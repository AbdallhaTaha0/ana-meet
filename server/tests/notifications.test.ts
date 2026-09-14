import { randomUUID } from 'crypto';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { getSequelize, closeDatabase } from '../src/db/sequelize';
import { initSocket } from '../src/realtime/socket';
import { setSocketServer } from '../src/realtime/bus';
import { closeRedis } from '../src/redis/redis';
import { resetRateLimits } from './helpers';

// Phase 8: durable notifications + real-time delivery + read state.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('notifications', () => {
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
  let directId = '';
  let groupId = '';

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

  async function send(agent: Agent, convoId: string, content: string): Promise<string> {
    const res = await agent.post(`/api/v1/conversations/${convoId}/messages`).set(ajax).send({
      type: 'TEXT',
      content,
      clientMessageId: randomUUID(),
    });
    expect(res.status).toBe(201);
    return res.body.message.id as string;
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

    const direct = await agents.alice.post('/api/v1/conversations/direct').set(ajax).send({
      peerId: ids.bob,
    });
    directId = direct.body.conversation.id as string;
    const group = await agents.alice.post('/api/v1/conversations/group').set(ajax).send({
      title: 'Notifs',
      memberIds: [ids.bob, ids.carol],
    });
    groupId = group.body.conversation.id as string;

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

  it('notifies recipients of new messages, never the sender', async () => {
    await send(agents.alice, directId, 'Ping bob');
    const bobList = await agents.bob.get('/api/v1/notifications');
    expect(bobList.status).toBe(200);
    expect(bobList.body.items).toHaveLength(1);
    expect(bobList.body.items[0].type).toBe('MESSAGE');
    expect(bobList.body.items[0].actor.username).toBe('alice');
    expect(bobList.body.items[0].readAt).toBeNull();
    expect(bobList.body.items[0].messageId).toBeTruthy();

    const aliceList = await agents.alice.get('/api/v1/notifications');
    expect(aliceList.body.items).toHaveLength(0);
  });

  it('notifies every group member except the sender', async () => {
    await send(agents.bob, groupId, 'Hello group');
    for (const name of ['alice', 'carol'] as const) {
      const list = await agents[name].get('/api/v1/notifications').query({ unread: true });
      expect(list.body.items.length).toBeGreaterThanOrEqual(1);
      expect(list.body.items[0].actor.username).toBe('bob');
    }
    const senderList = await agents.bob.get('/api/v1/notifications').query({ unread: true });
    expect(
      senderList.body.items.filter(
        (n: { actor: { username: string } }) => n.actor.username === 'bob',
      ),
    ).toHaveLength(0);
  });

  it('pushes notification:new to connected recipients in real time', async () => {
    const bob = await new Promise<ClientSocket>((resolve, reject) => {
      const s = ioClient(baseUrl, { auth: { token: tokens.bob }, reconnection: false });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
    try {
      const incoming = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('notification timeout')), 5000);
        bob.once('notification:new', (p: unknown) => {
          clearTimeout(timer);
          resolve(p);
        });
      });
      await send(agents.alice, directId, 'Real-time ping');
      const payload = (await incoming) as { notification: { actor: { username: string } } };
      expect(payload.notification.actor.username).toBe('alice');
    } finally {
      bob.disconnect();
    }
  });

  it('pages newest-first and filters unread', async () => {
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await send(agents.alice, directId, `Burst ${i}`);
    }
    const page1 = await agents.bob.get('/api/v1/notifications').query({ limit: 2 });
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await agents.bob
      .get('/api/v1/notifications')
      .query({ limit: 2, cursor: page1.body.nextCursor });
    expect(page2.body.items.length).toBeGreaterThanOrEqual(1);
    const ids1 = new Set(page1.body.items.map((n: { id: string }) => n.id));
    for (const n of page2.body.items as { id: string }[]) expect(ids1.has(n.id)).toBe(false);

    const unread = await agents.bob.get('/api/v1/notifications').query({ unread: true });
    expect(unread.body.items.every((n: { readAt: null }) => n.readAt === null)).toBe(true);
  });

  it('tracks read state per recipient without cross-user leaks', async () => {
    const list = await agents.bob.get('/api/v1/notifications').query({ unread: true });
    const ownId = list.body.items[0].id as string;

    const countBefore = await agents.bob.get('/api/v1/notifications/unread-count');
    const marked = await agents.bob.post('/api/v1/notifications/read').set(ajax).send({
      ids: [ownId],
    });
    expect(marked.body.updated).toBe(1);
    const countAfter = await agents.bob.get('/api/v1/notifications/unread-count');
    expect(countAfter.body.count).toBe(countBefore.body.count - 1);

    // Alice cannot mark Bob's notification: silently ignored, still unread.
    const foreign = await agents.alice.post('/api/v1/notifications/read').set(ajax).send({
      ids: [ownId],
    });
    expect(foreign.body.updated).toBe(0);

    const readAll = await agents.bob.post('/api/v1/notifications/read-all').set(ajax);
    expect(readAll.body.updated).toBeGreaterThanOrEqual(1);
    expect((await agents.bob.get('/api/v1/notifications/unread-count')).body.count).toBe(0);
  });

  it('suppresses pushes for muted chats but still records them', async () => {
    await agents.carol.post(`/api/v1/conversations/${groupId}/mute`).set(ajax);
    const carol = await new Promise<ClientSocket>((resolve, reject) => {
      const s = ioClient(baseUrl, { auth: { token: tokens.carol }, reconnection: false });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
    try {
      let pushed = false;
      carol.on('notification:new', () => {
        pushed = true;
      });
      const messageId = await send(agents.alice, groupId, 'Muted ping');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(pushed).toBe(false);
      // Durable + counted, just silent.
      const unread = await agents.carol.get('/api/v1/notifications').query({ unread: true });
      expect(unread.body.items.map((n: { messageId: string }) => n.messageId)).toContain(messageId);

      await agents.carol.post(`/api/v1/conversations/${groupId}/unmute`).set(ajax);
      const incoming = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('notification timeout')), 5000);
        carol.once('notification:new', (p: unknown) => {
          clearTimeout(timer);
          resolve(p);
        });
      });
      await send(agents.alice, groupId, 'Unmuted ping');
      const payload = (await incoming) as { notification: { actor: { username: string } } };
      expect(payload.notification.actor.username).toBe('alice');
    } finally {
      carol.disconnect();
    }
  });

  it('clears message notifications when the chat is read', async () => {    const messageId = await send(agents.alice, directId, 'Read me please');
    const before = await agents.bob.get('/api/v1/notifications').query({ unread: true });
    expect(
      before.body.items.map((n: { messageId: string }) => n.messageId),
    ).toContain(messageId);

    const receipt = await agents.bob
      .post(`/api/v1/conversations/${directId}/messages/${messageId}/status`)
      .set(ajax)
      .send({ status: 'READ' });
    expect(receipt.status).toBe(200);

    const after = await agents.bob.get('/api/v1/notifications').query({ unread: true });
    expect(
      after.body.items.map((n: { messageId: string }) => n.messageId),
    ).not.toContain(messageId);
  });

  it('marks a whole conversation read with one batched request', async () => {
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      ids.push(await send(agents.alice, directId, `Batch ${i}`));
    }
    const before = await agents.bob.get('/api/v1/notifications').query({ unread: true });
    for (const id of ids as string[]) {
      expect(before.body.items.map((n: { messageId: string }) => n.messageId)).toContain(id);
    }
    const batch = await agents.bob.post(`/api/v1/conversations/${directId}/messages/read`).set(ajax);
    expect(batch.status).toBe(200);
    expect(batch.body.updated).toBeGreaterThanOrEqual(3);
    const after = await agents.bob.get('/api/v1/notifications').query({ unread: true });
    for (const id of ids as string[]) {
      expect(after.body.items.map((n: { messageId: string }) => n.messageId)).not.toContain(id);
    }
    // Repeating is a harmless no-op.
    expect(
      (await agents.bob.post(`/api/v1/conversations/${directId}/messages/read`).set(ajax)).body.updated,
    ).toBe(0);
    // Outsiders get no oracle.
    expect(
      (await agents.carol.post(`/api/v1/conversations/${directId}/messages/read`).set(ajax)).status,
    ).toBe(404);
  });

  it('dismisses own notifications only', async () => {    const list = await agents.carol.get('/api/v1/notifications');
    const ownId = list.body.items[0].id as string;
    expect((await agents.carol.delete(`/api/v1/notifications/${ownId}`).set(ajax)).status).toBe(
      204,
    );
    expect((await agents.carol.delete(`/api/v1/notifications/${ownId}`).set(ajax)).status).toBe(
      404,
    );

    const bobList = await agents.bob.get('/api/v1/notifications');
    const bobId = bobList.body.items[0].id as string;
    expect((await agents.carol.delete(`/api/v1/notifications/${bobId}`).set(ajax)).status).toBe(
      404,
    );
    // Still intact for the owner.
    const again = await agents.bob.get('/api/v1/notifications');
    expect(again.body.items.map((n: { id: string }) => n.id)).toContain(bobId);
  });
});
