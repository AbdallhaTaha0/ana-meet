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

// Socket.IO foundation: authentication, presence query, payload limits.
// Requires TEST_DATABASE_URL; Redis presence degrades gracefully when absent.
const shouldRun = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!shouldRun)('socket foundation', () => {
  const app = createApp();
  const httpServer = createServer(app);
  const io = initSocket(httpServer);
  let baseUrl = '';
  let accessToken = '';
  let userId = '';

  const creds = {
    username: 'socketuser',
    email: 'socket@example.com',
    password: 's3cure-passphrase',
    displayName: 'Socket User',
  };
  const ajax = { 'X-Requested-With': 'XMLHttpRequest' };

  beforeAll(async () => {
    const url = config.databaseUrl;
    if (!/test/i.test(url)) throw new Error(`Refusing to reset non-test database: ${url}`);
    await resetRateLimits();
    const db = getSequelize();
    await db.authenticate();
    await db.sync({ force: true });

    const reg = await request(app).post('/api/v1/auth/register').set(ajax).send(creds);
    if (reg.status !== 201) throw new Error(`setup register failed: ${reg.status}`);
    userId = reg.body.user.id as string;
    const cookies = reg.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((c) => c.startsWith('am_access=')) as string;
    accessToken = access.split(';')[0].slice('am_access='.length);

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
    // Let in-flight disconnect handlers finish presence cleanup first.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await closeRedis();
    await closeDatabase();
  });

  function connect(token?: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, {
        auth: token ? { token } : {},
        reconnection: false,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  }

  it('rejects unauthenticated connections', async () => {
    await expect(connect()).rejects.toThrow();
  });

  it('rejects forged tokens', async () => {
    await expect(connect('forged.token.value')).rejects.toThrow();
  });

  it('accepts a verified token and answers ping with acknowledgement', async () => {
    const socket = await connect(accessToken);
    try {
      const pong = await new Promise<unknown>((resolve) => {
        socket.emit('ping', { hello: 'server' }, (res: unknown) => resolve(res));
      });
      expect((pong as { event: string }).event).toBe('pong');
    } finally {
      socket.disconnect();
    }
  });

  it('validates presence payloads', async () => {
    const socket = await connect(accessToken);
    try {
      const bad = await new Promise<unknown>((resolve) => {
        socket.emit('presence:get', { userId: 'not-a-uuid' }, (res: unknown) => resolve(res));
      });
      expect((bad as { error: { code: string } }).error.code).toBe('BAD_REQUEST');

      const good = await new Promise<unknown>((resolve) => {
        socket.emit('presence:get', { userId }, (res: unknown) => resolve(res));
      });
      const body = good as { userId?: string; online?: boolean; error?: { code: string } };
      if (body.error) {
        // Redis absent in this environment — degraded but explicit.
        expect(body.error.code).toBe('PRESENCE_UNAVAILABLE');
      } else {
        expect(body.userId).toBe(userId);
        expect(typeof body.online).toBe('boolean');
      }
    } finally {
      socket.disconnect();
    }
  });
});

