import { randomUUID } from 'crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { User } from '../src/db/models';
import { resetRateLimits } from './helpers';

// Phase 11: upload validation, serving, lifecycle, message integration.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe.skipIf(!shouldRun)('uploads', () => {
  const app = createApp();
  const ajax = { 'X-Requested-With': 'XMLHttpRequest' };
  const agents = {
    alice: request.agent(app),
    bob: request.agent(app),
    carol: request.agent(app),
  };
  type Agent = (typeof agents)['alice'];
  const ids: Record<string, string> = {};

  async function register(agent: Agent, username: string): Promise<void> {
    const res = await agent.post('/api/v1/auth/register').set(ajax).send({
      username,
      email: `${username}@example.com`,
      password: 's3cure-passphrase',
      displayName: username,
    });
    expect(res.status).toBe(201);
    ids[username] = res.body.user.id as string;
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

    await register(agents.alice, 'alice');
    await register(agents.bob, 'bob');
    await register(agents.carol, 'carol');
    await User.update({ role: 'ADMIN' }, { where: { id: ids.alice } });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('uploads an image by content, ignoring client claims', async () => {
    const res = await agents.alice
      .post('/api/v1/uploads')
      .set(ajax)
      .attach('file', PNG_1X1, { filename: 'evil.png.exe', contentType: 'application/octet-stream' });
    expect(res.status).toBe(201);
    expect(res.body.media.mimeType).toBe('image/png');
    expect(res.body.media.type).toBe('IMAGE');
    expect(res.body.media.sizeBytes).toBe(PNG_1X1.length);
    // Server-named key: client filename never touches storage…
    expect(res.body.media.key).toMatch(/^[0-9]{4}\/[0-9]{2}\/[0-9a-f]{32}\.png$/);
    // …but is preserved (sanitized) as metadata.
    expect(res.body.media.fileName).toBe('evil.png.exe');
    expect(res.body.media.url).toMatch(/^https?:\/\//);
    expect(new URL(res.body.media.url as string).origin).toBe(config.publicOrigin);
  });

  it('sniffs spoofed content instead of trusting extensions', async () => {
    const spoof = await agents.alice
      .post('/api/v1/uploads')
      .set(ajax)
      .attach('file', Buffer.from('just some plain text, definitely not an image'), {
        filename: 'photo.png',
        contentType: 'image/png',
      });
    expect(spoof.status).toBe(201);
    expect(spoof.body.media.mimeType).toBe('text/plain');
    expect(spoof.body.media.type).toBe('FILE');
    expect(spoof.body.media.key).toMatch(/\.txt$/);
  });

  it('rejects executables, empty files, missing fields, and oversize bodies', async () => {
    const exe = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(100)]);
    expect(
      (await agents.alice.post('/api/v1/uploads').set(ajax).attach('file', exe, 'run.exe')).status,
    ).toBe(400);
    expect(
      (await agents.alice.post('/api/v1/uploads').set(ajax).attach('file', Buffer.alloc(0), 'empty.png'))
        .status,
    ).toBe(400);
    expect((await agents.alice.post('/api/v1/uploads').set(ajax).send({})).status).toBe(400);

    const bigPng = Buffer.concat([PNG_1X1, Buffer.alloc(11_000_000)]);
    expect(
      (await agents.alice.post('/api/v1/uploads').set(ajax).attach('file', bigPng, 'big.png')).status,
    ).toBe(400);
  });

  it('serves bytes only to the owner until the upload is shared in a conversation', async () => {
    const up = await agents.bob.post('/api/v1/uploads').set(ajax).attach('file', PNG_1X1, 'a.png');
    const key = up.body.media.key as string;
    const urlPath = `/api/v1/uploads/${key}`;

    const served = await agents.bob.get(urlPath).buffer(true);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(served.body as Buffer, PNG_1X1)).toBe(0);

    expect((await request(app).get(urlPath)).status).toBe(401);
    expect((await agents.carol.get(urlPath)).status).toBe(404);
    expect((await agents.bob.get('/api/v1/uploads/2026/01/doesnotexist1234567890123456.png')).status).toBe(
      404,
    );
    const traversal = await agents.bob.get('/api/v1/uploads/..%2F..%2Fsecret');
    expect([400, 404]).toContain(traversal.status);
  });

  it('lists own uploads and enforces delete ownership', async () => {
    const mine = await agents.bob.get('/api/v1/uploads');
    expect(mine.body.total).toBeGreaterThanOrEqual(1);
    const key = mine.body.items[0].key as string;

    // Non-owner cannot delete.
    expect((await agents.carol.delete(`/api/v1/uploads/${key}`).set(ajax)).status).toBe(403);

    // Admin can.
    expect((await agents.alice.delete(`/api/v1/uploads/${key}`).set(ajax)).status).toBe(204);
    expect((await agents.bob.get(`/api/v1/uploads/${key}`)).status).toBe(404);
    expect((await agents.alice.delete(`/api/v1/uploads/${key}`).set(ajax)).status).toBe(404);
  });

  it('references uploads from messages end to end', async () => {    const up = await agents.alice.post('/api/v1/uploads').set(ajax).attach('file', PNG_1X1, 'msg.png');
    const dm = await agents.alice.post('/api/v1/conversations/direct').set(ajax).send({
      peerId: ids.bob,
    });
    const sent = await agents.alice
      .post(`/api/v1/conversations/${dm.body.conversation.id}/messages`)
      .set(ajax)
      .send({
        type: 'IMAGE',
        mediaUrl: up.body.media.url,
        mimeType: up.body.media.mimeType,
        sizeBytes: up.body.media.sizeBytes,
        clientMessageId: randomUUID(),
      });
    expect(sent.status).toBe(201);
    expect(sent.body.message.media.url).toBe(up.body.media.url);

    // The peer gains read access only through this shared conversation.
    expect((await agents.bob.get(`/api/v1/uploads/${up.body.media.key}`)).status).toBe(200);
    const history = await agents.bob.get(`/api/v1/conversations/${dm.body.conversation.id}/messages`);
    expect(history.body.items[0].media.mimeType).toBe('image/png');
  });

  it('serves story-only assets to followers without a message reference', async () => {
    const up = await agents.alice.post('/api/v1/uploads').set(ajax).attach('file', PNG_1X1, 'story.png');
    expect(up.status).toBe(201);
    // Bob follows Alice (sees her feed) but the asset is never sent as a message.
    await agents.bob.post('/api/v1/contacts').set(ajax).send({ contactUserId: ids.alice });
    const story = await agents.alice.post('/api/v1/stories').set(ajax).send({
      type: 'IMAGE',
      mediaUrl: up.body.media.url,
      mimeType: up.body.media.mimeType,
      sizeBytes: up.body.media.sizeBytes,
    });
    expect(story.status).toBe(201);

    const feed = await agents.bob.get('/api/v1/stories/feed');
    expect(feed.body.items.map((s: { id: string }) => s.id)).toContain(story.body.story.id);
    // Regression: story-only assets used to 404 for viewers (message check ran first).
    expect((await agents.bob.get(`/api/v1/uploads/${up.body.media.key}`)).status).toBe(200);
    // Strangers still cannot read it.
    expect((await agents.carol.get(`/api/v1/uploads/${up.body.media.key}`)).status).toBe(404);
  });
});
