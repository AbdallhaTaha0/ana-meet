import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { User } from '../src/db/models';
import { resetRateLimits } from './helpers';

// Phase 9: BOT accounts, directory, announcements, audit log.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('bots and admin', () => {
  const app = createApp();
  const ajax = { 'X-Requested-With': 'XMLHttpRequest' };
  const agents = {
    alice: request.agent(app),
    bob: request.agent(app),
  };
  type Agent = (typeof agents)['alice'];
  const ids: Record<string, string> = {};
  let botId = '';
  let botPassword = '';

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
    // Alice is the platform admin. requireAuth re-reads the role per request.
    await User.update({ role: 'ADMIN' }, { where: { id: ids.alice } });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('rejects bot provisioning without admin rights', async () => {
    expect(
      (await agents.bob.post('/api/v1/admin/bots').set(ajax).send({
        username: 'helper',
        email: 'helper@example.com',
        displayName: 'Helper',
      })).status,
    ).toBe(403);
    expect(
      (await request(app).post('/api/v1/admin/bots').set(ajax).send({
        username: 'helper',
        email: 'helper@example.com',
        displayName: 'Helper',
      })).status,
    ).toBe(401);
  });

  it('provisions a BOT account with a one-time password', async () => {
    const res = await agents.alice.post('/api/v1/admin/bots').set(ajax).send({
      username: 'helperbot',
      email: 'helperbot@example.com',
      displayName: 'Helper Bot',
    });
    expect(res.status).toBe(201);
    expect(res.body.bot.isBot).toBe(true);
    expect(res.body.bot.role).toBe('BOT');
    expect(res.body.bot).not.toHaveProperty('passwordHash');
    expect(typeof res.body.initialPassword).toBe('string');
    expect(res.body.initialPassword.length).toBeGreaterThanOrEqual(20);
    botId = res.body.bot.id as string;
    botPassword = res.body.initialPassword as string;

    // The password works exactly once-by-design: a normal login.
    const login = await request(app).post('/api/v1/auth/login').set(ajax).send({
      identifier: 'helperbot',
      password: botPassword,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.isBot).toBe(true);

    const dup = await agents.alice.post('/api/v1/admin/bots').set(ajax).send({
      username: 'helperbot',
      email: 'other@example.com',
      displayName: 'Dup',
    });
    expect(dup.status).toBe(409);
  });

  it('lists bots in the directory and flags them everywhere', async () => {
    const dir = await agents.bob.get('/api/v1/bots');
    expect(dir.status).toBe(200);
    expect(dir.body.items.map((u: { username: string }) => u.username)).toContain('helperbot');
    expect(dir.body.items.map((u: { username: string }) => u.username)).not.toContain('alice');
    expect(dir.body.items.every((u: { isBot: boolean }) => u.isBot)).toBe(true);

    const search = await agents.bob.get('/api/v1/users/search').query({ q: 'helper' });
    expect(search.body.items[0].isBot).toBe(true);
    const profile = await agents.bob.get(`/api/v1/users/${botId}`);
    expect(profile.body.user.isBot).toBe(true);
    // ...while regular users are not flagged.
    const human = await agents.bob.get(`/api/v1/users/${ids.alice}`);
    expect(human.body.user.isBot).toBe(false);
    expect(human.body.user).not.toHaveProperty('role');
  });

  it('converses with bots through normal paths', async () => {
    const dm = await agents.bob.post('/api/v1/conversations/direct').set(ajax).send({
      peerId: botId,
    });
    expect(dm.status).toBe(201);
    const sent = await agents.bob
      .post(`/api/v1/conversations/${dm.body.conversation.id}/messages`)
      .set(ajax)
      .send({ type: 'TEXT', content: 'Hi bot', clientMessageId: '11111111-1111-4111-8111-111111111111' });
    expect(sent.status).toBe(201);
  });

  it('sends audited system announcements atomically', async () => {
    const res = await agents.alice.post('/api/v1/admin/announcements').set(ajax).send({
      title: 'Maintenance',
      body: 'Downtime at midnight.',
      userIds: [ids.bob],
    });
    expect(res.status).toBe(201);
    expect(res.body.sent).toBe(1);

    const bobNotifs = await agents.bob.get('/api/v1/notifications').query({ unread: true });
    const announcement = bobNotifs.body.items.find(
      (n: { type: string }) => n.type === 'SYSTEM',
    ) as { title: string; body: string };
    expect(announcement.title).toBe('Maintenance');
    expect(announcement.body).toBe('Downtime at midnight.');

    // Unknown recipient aborts the whole announcement: nothing new for bob.
    const before = bobNotifs.body.items.length;
    const bad = await agents.alice.post('/api/v1/admin/announcements').set(ajax).send({
      title: 'Nope',
      body: 'Should not send.',
      userIds: [ids.bob, '00000000-0000-4000-8000-000000000000'],
    });
    expect(bad.status).toBe(404);
    const after = await agents.bob.get('/api/v1/notifications').query({ unread: true });
    expect(after.body.items.length).toBe(before);

    expect(
      (await agents.bob.post('/api/v1/admin/announcements').set(ajax).send({
        title: 'X',
        body: 'Y',
        userIds: [ids.bob],
      })).status,
    ).toBe(403);
  });

  it('records admin actions in the audit log', async () => {
    const log = await agents.alice.get('/api/v1/admin/audit-log');
    expect(log.status).toBe(200);
    const actions = log.body.items.map((e: { action: string }) => e.action);
    expect(actions).toContain('bot.create');
    expect(actions).toContain('announcement.send');
    const entry = log.body.items.find((e: { action: string }) => e.action === 'bot.create') as {
      admin: { username: string };
      targetId: string;
    };
    expect(entry.admin.username).toBe('alice');
    expect(entry.targetId).toBe(botId);

    expect((await agents.bob.get('/api/v1/admin/audit-log')).status).toBe(403);
  });
});
