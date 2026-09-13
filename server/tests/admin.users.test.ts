import { randomUUID } from 'crypto';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { User } from '../src/db/models';
import { initSocket } from '../src/realtime/socket';
import { setSocketServer } from '../src/realtime/bus';
import { closeRedis } from '../src/redis/redis';
import { resetRateLimits } from './helpers';

// Phase 10: admin user management + permanent deletion.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('admin users', () => {
  const app = createApp();
  const httpServer = createServer(app);
  const io = initSocket(httpServer);
  const ajax = { 'X-Requested-With': 'XMLHttpRequest' };
  const agents = {
    alice: request.agent(app),
    bob: request.agent(app),
    carol: request.agent(app),
  };
  type Agent = (typeof agents)['alice'];
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  let baseUrl = '';

  async function register(agent: Agent, username: string): Promise<void> {
    const res = await agent.post('/api/v1/auth/register').set(ajax).send({
      username,
      email: `${username}@example.com`,
      password: 's3cure-passphrase',
      displayName: username,
    });
    expect(res.status).toBe(201);
    ids[username] = res.body.user.id as string;
    const cookies = res.headers['set-cookie'] as unknown as string[];
    tokens[username] = (cookies.find((c) => c.startsWith('am_access=')) as string)
      .split(';')[0]
      .slice('am_access='.length);
  }

  function connectSocket(token: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const s = ioClient(baseUrl, { auth: { token }, reconnection: false });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  function waitDisconnect(socket: ClientSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('disconnect timeout')), 5000);
      socket.once('disconnect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
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

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const { port } = httpServer.address() as AddressInfo;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    io.disconnectSockets(true);
    await io.close();
    setSocketServer(null);
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await closeRedis();
    await closeDatabase();
  });

  it('gates every admin endpoint by role', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/admin/users'],
      ['get', `/api/v1/admin/users/${ids.bob}`],
      ['get', '/api/v1/admin/stats'],
    ] as const) {
      expect((await agents.bob[method](path)).status).toBe(403);
      expect((await request(app)[method](path)).status).toBe(401);
    }
    expect(
      (await agents.bob.post(`/api/v1/admin/users/${ids.carol}/disable`).set(ajax)).status,
    ).toBe(403);
    expect(
      (await agents.bob.delete(`/api/v1/admin/users/${ids.carol}`).set(ajax)).status,
    ).toBe(403);
  });

  it('lists and searches users with admin visibility', async () => {
    const all = await agents.alice.get('/api/v1/admin/users');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(3);
    expect(JSON.stringify(all.body)).toContain('bob@example.com');

    const search = await agents.alice.get('/api/v1/admin/users').query({ search: 'bo' });
    expect(search.body.items.map((u: { username: string }) => u.username)).toEqual(['bob']);
    const bots = await agents.alice.get('/api/v1/admin/users').query({ role: 'BOT' });
    expect(bots.body.total).toBe(0);
    const missing = await agents.alice.get('/api/v1/admin/users/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
  });

  it('shows user detail with resource counts', async () => {
    const dm = await agents.bob.post('/api/v1/conversations/direct').set(ajax).send({
      peerId: ids.carol,
    });
    await agents.bob.post(`/api/v1/conversations/${dm.body.conversation.id}/messages`).set(ajax).send({
      type: 'TEXT',
      content: 'Hi carol',
      clientMessageId: randomUUID(),
    });
    const detail = await agents.alice.get(`/api/v1/admin/users/${ids.bob}`);
    expect(detail.status).toBe(200);
    expect(detail.body.user.email).toBe('bob@example.com');
    expect(detail.body.stats.conversations).toBe(1);
    expect(detail.body.stats.messagesSent).toBe(1);
    expect(detail.body.stats.activeSessions).toBe(1);
  });

  it('disables, disconnects, and restores an account', async () => {
    const bobSock = await connectSocket(tokens.bob);
    try {
      const gone = waitDisconnect(bobSock);
      const disabled = await agents.alice.post(`/api/v1/admin/users/${ids.bob}/disable`).set(ajax);
      expect(disabled.status).toBe(200);
      expect(disabled.body.user.status).toBe('DISABLED');
      await gone;

      // All credential paths are dead: login, cookies, refresh.
      expect(
        (await request(app).post('/api/v1/auth/login').set(ajax).send({
          identifier: 'bob',
          password: 's3cure-passphrase',
        })).status,
      ).toBe(401);
      expect((await agents.bob.get('/api/v1/auth/me')).status).toBe(401);
      expect((await agents.bob.post('/api/v1/auth/refresh').set(ajax)).status).toBe(401);

      // Self-disable is refused.
      expect((await agents.alice.post(`/api/v1/admin/users/${ids.alice}/disable`).set(ajax)).status).toBe(
        400,
      );

      const restored = await agents.alice.post(`/api/v1/admin/users/${ids.bob}/restore`).set(ajax);
      expect(restored.body.user.status).toBe('ACTIVE');
      // Old sessions stayed revoked: re-login required.
      expect((await agents.bob.post('/api/v1/auth/refresh').set(ajax)).status).toBe(401);
      const relogin = await agents.bob.post('/api/v1/auth/login').set(ajax).send({
        identifier: 'bob',
        password: 's3cure-passphrase',
      });
      expect(relogin.status).toBe(200);
    } finally {
      bobSock.disconnect();
    }
  });

  it('permanently deletes an account with all its relations', async () => {
    // Carol builds a footprint: DM + message, story, mutual contacts.
    const dm = await agents.carol.post('/api/v1/conversations/direct').set(ajax).send({
      peerId: ids.alice,
    });
    const dmId = dm.body.conversation.id as string;
    await agents.carol.post(`/api/v1/conversations/${dmId}/messages`).set(ajax).send({
      type: 'TEXT',
      content: 'Carol was here',
      clientMessageId: randomUUID(),
    });
    await agents.carol.post('/api/v1/stories').set(ajax).send({ type: 'TEXT', content: 'Bye' });
    await agents.carol.post('/api/v1/contacts').set(ajax).send({ contactUserId: ids.alice });
    await agents.alice.post('/api/v1/contacts').set(ajax).send({ contactUserId: ids.carol });
    await agents.alice.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.bob });
    await agents.bob.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.carol });

    const carolSock = await connectSocket(tokens.carol);
    try {
      const gone = waitDisconnect(carolSock);
      expect((await agents.alice.delete(`/api/v1/admin/users/${ids.carol}`).set(ajax)).status).toBe(
        204,
      );
      await gone;

      // Credentials dead.
      expect(
        (await request(app).post('/api/v1/auth/login').set(ajax).send({
          identifier: 'carol',
          password: 's3cure-passphrase',
        })).status,
      ).toBe(401);
      // Admin surfaces: gone everywhere.
      expect((await agents.alice.get(`/api/v1/admin/users/${ids.carol}`)).status).toBe(404);
      expect(
        (await agents.alice.get('/api/v1/admin/users').query({ search: 'carol' })).body.total,
      ).toBe(0);
      // Peer history preserved: conversation + message remain, sender nulled.
      const history = await agents.alice.get(`/api/v1/conversations/${dmId}/messages`);
      expect(history.body.items).toHaveLength(1);
      expect(history.body.items[0].sender).toBeNull();
      expect(history.body.items[0].senderId).toBeNull();
      // Relations cleaned both directions.
      const contacts = await agents.alice.get('/api/v1/contacts');
      expect(contacts.body.items.map((c: { username: string }) => c.username)).not.toContain('carol');
      const blocks = await agents.bob.get('/api/v1/blocks');
      expect(blocks.body.items.map((b: { username: string }) => b.username)).not.toContain('carol');
      // Stories gone.
      expect((await agents.alice.get(`/api/v1/stories/${ids.carol}`)).status).toBe(404);
      // Audit trail kept the record.
      const log = await agents.alice.get('/api/v1/admin/audit-log');
      const entry = log.body.items.find((e: { action: string }) => e.action === 'user.delete') as {
        targetId: string;
        admin: { username: string };
      };
      expect(entry.targetId).toBe(ids.carol);
      expect(entry.admin.username).toBe('alice');

      // Self-delete refused; missing user 404.
      expect((await agents.alice.delete(`/api/v1/admin/users/${ids.alice}`).set(ajax)).status).toBe(
        400,
      );
      expect(
        (await agents.alice.delete('/api/v1/admin/users/00000000-0000-4000-8000-000000000000').set(ajax))
          .status,
      ).toBe(404);
    } finally {
      carolSock.disconnect();
    }
  });

  it('reports platform statistics', async () => {
    const stats = await agents.alice.get('/api/v1/admin/stats');
    expect(stats.status).toBe(200);
    expect(stats.body.users.total).toBe(2); // carol deleted
    expect(stats.body.users.admins).toBe(1);
    expect(stats.body.users.bots).toBe(0);
    expect(stats.body.conversations.total).toBeGreaterThanOrEqual(2);
    expect(stats.body.messages.total).toBeGreaterThanOrEqual(2);
    expect(stats.body.notifications.total).toBeGreaterThanOrEqual(1);
    expect(typeof stats.body.stories.active).toBe('number');
  });
});
