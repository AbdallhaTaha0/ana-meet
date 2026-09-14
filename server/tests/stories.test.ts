import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { Story } from '../src/db/models';
import { STORY_TTL_MS, deleteExpiredStories } from '../src/modules/stories/stories.service';
import { resetRateLimits } from './helpers';

// Phase 7: story lifecycle + expiry.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('stories', () => {
  const app = createApp();
  const ajax = { 'X-Requested-With': 'XMLHttpRequest' };
  const agents = {
    alice: request.agent(app),
    bob: request.agent(app),
    carol: request.agent(app),
  };
  type Agent = (typeof agents)['alice'];
  const ids: Record<string, string> = {};

  async function register(agent: Agent, username: string): Promise<string> {
    const res = await agent.post('/api/v1/auth/register').set(ajax).send({
      username,
      email: `${username}@example.com`,
      password: 's3cure-passphrase',
      displayName: username,
    });
    expect(res.status).toBe(201);
    return res.body.user.id as string;
  }

  beforeAll(async () => {
    const url = config.databaseUrl;
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to reset non-test database: ${url}`);
    }
    await resetRateLimits();
    const db = getSequelize();
    await db.authenticate();
    await db.sync({ force: true });

    ids.alice = await register(agents.alice, 'alice');
    ids.bob = await register(agents.bob, 'bob');
    ids.carol = await register(agents.carol, 'carol');

    // Bob is alice's contact; carol is a stranger.
    await agents.alice.post('/api/v1/contacts').set(ajax).send({ contactUserId: ids.bob });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('creates text and media stories with a 24h expiry', async () => {
    const textRes = await agents.alice.post('/api/v1/stories').set(ajax).send({
      type: 'TEXT',
      content: 'Hello stories',
    });
    expect(textRes.status).toBe(201);
    expect(textRes.body.story.content).toBe('Hello stories');
    const ttl = new Date(textRes.body.story.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(STORY_TTL_MS - 60_000);
    expect(ttl).toBeLessThanOrEqual(STORY_TTL_MS);

    const imageRes = await agents.bob.post('/api/v1/stories').set(ajax).send({
      type: 'IMAGE',
      mediaUrl: 'https://cdn.example.com/s.png',
      mimeType: 'image/png',
      sizeBytes: 100,
    });
    expect(imageRes.status).toBe(201);
    expect(imageRes.body.story.owner.username).toBe('bob');
  });

  it('validates story payloads strictly', async () => {
    expect((await agents.alice.post('/api/v1/stories').set(ajax).send({
      type: 'TEXT',
      content: '',
    })).status).toBe(400);
    expect((await agents.alice.post('/api/v1/stories').set(ajax).send({
      type: 'IMAGE',
      mediaUrl: 'https://cdn.example.com/a.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 100,
    })).status).toBe(400);
    expect((await agents.alice.post('/api/v1/stories').set(ajax).send({
      type: 'VIDEO',
      mediaUrl: 'not-a-url',
      mimeType: 'video/mp4',
      sizeBytes: 100,
    })).status).toBe(400);
    expect((await agents.alice.post('/api/v1/stories').set(ajax).send({ type: 'FILE' })).status).toBe(
      400,
    );
  });

  it('serves a feed of self + contacts, newest first', async () => {
    await agents.carol.post('/api/v1/stories').set(ajax).send({ type: 'TEXT', content: 'Stranger' });
    const feed = await agents.alice.get('/api/v1/stories/feed');
    expect(feed.status).toBe(200);
    const owners = feed.body.items.map((s: { owner: { username: string } }) => s.owner.username);
    expect(owners).toContain('alice');
    expect(owners).toContain('bob');
    expect(owners).not.toContain('carol');
    // Newest first.
    const times = feed.body.items.map((s: { createdAt: string }) => new Date(s.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('shows per-user stories minus blocks, hides expired', async () => {
    // Expired story seeded directly (creation always mints fresh expiry).
    await Story.create({
      ownerId: ids.bob,
      type: 'TEXT',
      content: 'Old news',
      expiresAt: new Date(Date.now() - 1000),
    });

    const visible = await agents.alice.get(`/api/v1/stories/${ids.bob}`);
    expect(visible.status).toBe(200);
    expect(visible.body.items.every((s: { content: string }) => s.content !== 'Old news')).toBe(true);
    expect(visible.body.items.length).toBeGreaterThan(0);

    await agents.alice.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.bob });
    expect((await agents.alice.get(`/api/v1/stories/${ids.bob}`)).status).toBe(404);
    expect((await agents.bob.get(`/api/v1/stories/${ids.alice}`)).status).toBe(404);
    const feed = await agents.alice.get('/api/v1/stories/feed');
    expect(
      feed.body.items.map((s: { owner: { username: string } }) => s.owner.username),
    ).not.toContain('bob');
    await agents.alice.delete(`/api/v1/blocks/${ids.bob}`).set(ajax);

    expect((await agents.alice.get('/api/v1/stories/00000000-0000-4000-8000-000000000000')).status).toBe(
      404,
    );
  });

  it('deletes own stories only', async () => {    const created = await agents.carol.post('/api/v1/stories').set(ajax).send({
      type: 'TEXT',
      content: 'Delete me',
    });
    const id = created.body.story.id as string;
    expect(
      (await agents.alice.delete(`/api/v1/stories/${id}`).set(ajax)).status,
    ).toBe(404);
    expect((await agents.carol.delete(`/api/v1/stories/${id}`).set(ajax)).status).toBe(204);
    expect((await agents.carol.delete(`/api/v1/stories/${id}`).set(ajax)).status).toBe(404);
  });

  it('sweeps expired stories without touching active ones', async () => {
    const before = await Story.count();
    const swept = await deleteExpiredStories();
    expect(swept).toBeGreaterThanOrEqual(1);
    expect(await Story.count()).toBe(before - swept);
    expect(await deleteExpiredStories()).toBe(0);
  });

  it('stores text + media as one captioned story', async () => {
    const res = await agents.alice.post('/api/v1/stories').set(ajax).send({
      type: 'IMAGE',
      mediaUrl: 'https://cdn.example.com/s.png',
      mimeType: 'image/png',
      sizeBytes: 100,
      content: 'Sunset caption',
    });
    expect(res.status).toBe(201);
    expect(res.body.story.content).toBe('Sunset caption');
    expect(res.body.story.media).not.toBeNull();
  });
});
