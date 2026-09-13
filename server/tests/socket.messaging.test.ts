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
import { closeRedis } from '../src/redis/redis';
import { resetRateLimits } from './helpers';

// Phase 6: real-time message events, typing, presence heartbeat.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('socket messaging', () => {
  const app = createApp();
  const httpServer = createServer(app);
  const io = initSocket(httpServer);
  const ajax = { 'X-Requested-With': 'XMLHttpRequest' };
  let baseUrl = '';
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let directId = '';

  async function register(username: string): Promise<{ id: string; token: string }> {
    const res = await request(app).post('/api/v1/auth/register').set(ajax).send({
      username,
      email: `${username}@example.com`,
      password: 's3cure-passphrase',
      displayName: username,
    });
    expect(res.status).toBe(201);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((c) => c.startsWith('am_access=')) as string;
    return {
      id: res.body.user.id as string,
      token: access.split(';')[0].slice('am_access='.length),
    };
  }

  function connect(token?: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, { auth: token ? { token } : {}, reconnection: false });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  }

  function emitAck(socket: ClientSocket, event: string, payload: unknown): Promise<unknown> {
    return new Promise((resolve) => {
      socket.emit(event, payload, (res: unknown) => resolve(res));
    });
  }

  function waitFor(socket: ClientSocket, event: string, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
      socket.once(event, (payload: unknown) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  beforeAll(async () => {
    const url = config.databaseUrl;
    if (!/test/i.test(url)) throw new Error(`Refusing to reset non-test database: ${url}`);
    await resetRateLimits();
    const db = getSequelize();
    await db.authenticate();
    await db.sync({ force: true });

    for (const name of ['alice', 'bob', 'carol']) {
      // eslint-disable-next-line no-await-in-loop
      const { id, token } = await register(name);
      ids[name] = id;
      tokens[name] = token;
    }
    // REST-created DM (socket layer only consumes it).
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').set(ajax).send({
      identifier: 'alice',
      password: 's3cure-passphrase',
    });
    const direct = await agent.post('/api/v1/conversations/direct').set(ajax).send({
      peerId: ids.bob,
    });
    expect(direct.status).toBe(201);
    directId = direct.body.conversation.id as string;

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
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await closeRedis();
    await closeDatabase();
  });

  it('delivers message:send to all member devices with persistence ack', async () => {
    const alice = await connect(tokens.alice);
    const bob = await connect(tokens.bob);
    try {
      const incoming = waitFor(bob, 'message:new');
      const clientMessageId = randomUUID();
      const ack = (await emitAck(alice, 'message:send', {
        conversationId: directId,
        message: { type: 'TEXT', content: 'Real-time hi', clientMessageId },
      })) as { ok: boolean; created: boolean; message: { id: string; content: string } };
      expect(ack.ok).toBe(true);
      expect(ack.created).toBe(true);

      const delivered = (await incoming) as { message: { id: string; content: string } };
      expect(delivered.message.id).toBe(ack.message.id);
      expect(delivered.message.content).toBe('Real-time hi');

      // Durable: visible via REST history after reconnect-style fetch.
      const history = await request(app)
        .get(`/api/v1/conversations/${directId}/messages`)
        .set('Cookie', `am_access=${tokens.alice}`);
      expect(
        history.body.items.map((m: { id: string }) => m.id),
      ).toContain(ack.message.id);
    } finally {
      alice.disconnect();
      bob.disconnect();
    }
  });

  it('broadcasts REST messages to the other member without a reload', async () => {
    const bob = await connect(tokens.bob);
    try {
      const incoming = waitFor(bob, 'message:new');
      const sent = await request(app)
        .post(`/api/v1/conversations/${directId}/messages`)
        .set('Cookie', `am_access=${tokens.alice}`)
        .set(ajax)
        .send({ type: 'TEXT', content: 'REST hi', clientMessageId: randomUUID() });
      expect(sent.status).toBe(201);
      const delivered = (await incoming) as { message: { id: string; content: string } };
      expect(delivered.message.id).toBe(sent.body.message.id);
      expect(delivered.message.content).toBe('REST hi');
    } finally {
      bob.disconnect();
    }
  });

  it('dedupes socket retries and rejects bad payloads + outsiders', async () => {
    const alice = await connect(tokens.alice);
    const carol = await connect(tokens.carol);
    try {
      const clientMessageId = randomUUID();
      const payload = {
        conversationId: directId,
        message: { type: 'TEXT', content: 'Once', clientMessageId },
      };
      const first = (await emitAck(alice, 'message:send', payload)) as { ok: boolean; created: boolean; message: { id: string } };
      const second = (await emitAck(alice, 'message:send', payload)) as { ok: boolean; created: boolean; message: { id: string } };
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.message.id).toBe(first.message.id);

      const bad = (await emitAck(alice, 'message:send', {
        conversationId: directId,
        message: { type: 'TEXT', content: '', clientMessageId: randomUUID() },
      })) as { error: { code: string } };
      expect(bad.error.code).toBe('BAD_REQUEST');

      const outsider = (await emitAck(carol, 'message:send', {
        conversationId: directId,
        message: { type: 'TEXT', content: 'Intruder', clientMessageId: randomUUID() },
      })) as { error: { code: string } };
      expect(outsider.error.code).toBe('NOT_FOUND');
    } finally {
      alice.disconnect();
      carol.disconnect();
    }
  });

  it('broadcasts typing only to other members', async () => {
    const alice = await connect(tokens.alice);
    const bob = await connect(tokens.bob);
    try {
      const bobSees = waitFor(bob, 'typing:update');
      let aliceSaw: unknown = null;
      alice.on('typing:update', (p: unknown) => {
        aliceSaw = p;
      });
      const ack = (await emitAck(alice, 'typing:start', { conversationId: directId })) as { ok: boolean };
      expect(ack.ok).toBe(true);
      const update = (await bobSees) as { conversationId: string; userId: string; typing: boolean };
      expect(update).toMatchObject({ conversationId: directId, userId: ids.alice, typing: true });
      await new Promise((r) => setTimeout(r, 200));
      expect(aliceSaw).toBeNull();

      const stop = waitFor(bob, 'typing:update');
      await emitAck(alice, 'typing:stop', { conversationId: directId });
      expect(((await stop) as { typing: boolean }).typing).toBe(false);
    } finally {
      alice.disconnect();
      bob.disconnect();
    }
  });

  it('rejects typing in conversations the socket cannot access', async () => {
    const carol = await connect(tokens.carol);
    try {
      const res = (await emitAck(carol, 'typing:start', { conversationId: directId })) as {
        error: { code: string };
      };
      expect(res.error.code).toBe('NOT_FOUND');
    } finally {
      carol.disconnect();
    }
  });

  it('syncs edits, deletes, and read receipts across devices', async () => {
    const alice = await connect(tokens.alice);
    const bob = await connect(tokens.bob);
    try {
      const sent = (await emitAck(alice, 'message:send', {
        conversationId: directId,
        message: { type: 'TEXT', content: 'Sync me', clientMessageId: randomUUID() },
      })) as { message: { id: string } };
      const messageId = sent.message.id;

      const updated = waitFor(bob, 'message:updated');
      await emitAck(alice, 'message:edit', {
        conversationId: directId,
        messageId,
        content: 'Synced edit',
      });
      expect(((await updated) as { message: { content: string } }).message.content).toBe(
        'Synced edit',
      );

      const status = waitFor(alice, 'message:status');
      await emitAck(bob, 'message:read', { conversationId: directId, messageId });
      expect(((await status) as { status: string }).status).toBe('READ');

      const deleted = waitFor(bob, 'message:deleted');
      await emitAck(alice, 'message:delete', { conversationId: directId, messageId });
      expect(((await deleted) as { messageId: string }).messageId).toBe(messageId);
    } finally {
      alice.disconnect();
      bob.disconnect();
    }
  });

  it('enforces blocks on typing and presence (DM)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').set(ajax).send({
      identifier: 'alice',
      password: 's3cure-passphrase',
    });
    const alice = await connect(tokens.alice);
    const bob = await connect(tokens.bob);
    try {
      await agent.post('/api/v1/blocks').set(ajax).send({ blockedUserId: ids.bob });

      const typing = (await emitAck(bob, 'typing:start', { conversationId: directId })) as {
        error: { code: string };
      };
      expect(typing.error.code).toBe('BLOCKED');

      // Privacy-preserving presence: reads as offline, no oracle.
      const presence = (await emitAck(bob, 'presence:get', { userId: ids.alice })) as {
        online: boolean;
      };
      expect(presence.online).toBe(false);

      await agent.delete(`/api/v1/blocks/${ids.bob}`).set(ajax);
      const presenceAfter = (await emitAck(bob, 'presence:get', { userId: ids.alice })) as {
        online: boolean;
      };
      expect(presenceAfter.online).toBe(true);
    } finally {
      alice.disconnect();
      bob.disconnect();
    }
  });

  it('answers presence heartbeats', async () => {
    const alice = await connect(tokens.alice);
    try {
      const res = (await emitAck(alice, 'presence:heartbeat', {})) as { ok: boolean };
      expect(res.ok).toBe(true);
    } finally {
      alice.disconnect();
    }
  });
});
