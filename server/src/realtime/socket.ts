import { parse as parseCookie } from 'cookie';
import type { Server as HttpServer } from 'http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { z } from 'zod';
import { config } from '../config/env';
import { ACCESS_COOKIE } from '../common/cookies';
import { logger } from '../common/logger';
import { verifyAccessToken } from '../common/tokens';
import { User } from '../db/models';
import { isBlockedEitherWay } from '../modules/blocks/blocks.service';
import {
  addPresenceSocket,
  isUserOnline,
  refreshPresenceSocket,
  removePresenceSocket,
} from '../redis/redis';
import { registerMessagingHandlers } from './handlers';
import { setSocketServer } from './bus';

const authPayloadSchema = z.object({
  token: z.string().min(1).max(4096).optional(),
});

function tokenFromHandshake(socket: Socket): string | null {
  const fromAuth = authPayloadSchema.safeParse(socket.handshake.auth);
  if (fromAuth.success && fromAuth.data.token) return fromAuth.data.token;
  const header = socket.handshake.headers.cookie;
  if (header) {
    const parsed = parseCookie(header);
    if (parsed[ACCESS_COOKIE]) return parsed[ACCESS_COOKIE];
  }
  return null;
}

export function initSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: config.clientOrigins, credentials: true },
    // RULE 52: bound WebSocket payloads; media uses the upload API, not sockets.
    maxHttpBufferSize: 1_000_000,
  });

  // Horizontal scaling: cross-instance pub/sub via Redis when available.
  // Without Redis the node runs standalone (single-instance dev mode).
  try {
    const pubClient = new Redis(config.redisUrl, { lazyConnect: true });
    const subClient = pubClient.duplicate();
    void Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter enabled');
      })
      .catch((err: unknown) => {
        logger.warn({ err: String(err) }, 'Socket.IO running without Redis adapter');
      });
  } catch (err) {
    logger.warn({ err: String(err) }, 'Socket.IO running without Redis adapter');
  }

  // Authentication: never trust client-provided user ids; identity AND role
  // come from the verified access JWT plus a live account lookup.
  io.use(async (socket, next) => {
    try {
      const token = tokenFromHandshake(socket);
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = verifyAccessToken(token);
      const user = await User.findByPk(payload.sub, { attributes: ['id', 'role', 'status', 'authVersion'] });
      if (!user || user.status !== 'ACTIVE' || (payload.version ?? 0) !== user.authVersion)
        return next(new Error('UNAUTHORIZED'));
      socket.data.userId = user.id as string;
      socket.data.role = user.role as string;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  // Domain services emit real-time events through this bus without
  // importing the socket server (which would create import cycles).
  setSocketServer(io);

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    // One personal room per user: all devices/tabs join; emits to the room
    // reach every connection, on every node (via the Redis adapter).
    void socket.join(`user:${userId}`);
    logger.info({ userId, socketId: socket.id, total: io.engine.clientsCount }, 'Socket connected');

    // Presence is ephemeral (Redis set of socket ids, multi-device safe).
    void addPresenceSocket(userId, socket.id).catch((err: unknown) =>
      logger.warn({ err: String(err) }, 'Presence add failed'),
    );

    registerMessagingHandlers(io, socket);

    // Foundation-level echo used by health/diag tooling; also refreshes the
    // sliding presence TTL for long-lived connections.
    socket.on('ping', (payload: unknown, ack?: (res: unknown) => void) => {
      void refreshPresenceSocket(userId, socket.id).catch(() => undefined);
      if (typeof ack === 'function') ack({ event: 'pong', at: new Date().toISOString() });
    });

    // Clients heartbeat (~every 30s) so crash-proof TTLs never expire a live
    // socket; without heartbeats a socket older than the TTL looks offline.
    socket.on('presence:heartbeat', (payload: unknown, ack?: (res: unknown) => void) => {
      refreshPresenceSocket(userId, socket.id)
        .then(() => {
          if (typeof ack === 'function') ack({ ok: true });
        })
        .catch(() => {
          if (typeof ack === 'function') {
            ack({ error: { code: 'PRESENCE_UNAVAILABLE', message: 'Presence temporarily unavailable' } });
          }
        });
      void payload;
    });

    socket.on('presence:get', async (payload: unknown, ack?: (res: unknown) => void) => {
      if (typeof ack !== 'function') return;
      const parsed = z.object({ userId: z.string().uuid() }).safeParse(payload);
      if (!parsed.success) {
        ack({ error: { code: 'BAD_REQUEST', message: 'Invalid payload' } });
        return;
      }
      try {
        // Privacy-preserving answer across blocks: indistinguishable from
        // genuinely offline (no existence/activity oracle).
        if (parsed.data.userId !== userId && (await isBlockedEitherWay(userId, parsed.data.userId))) {
          ack({ userId: parsed.data.userId, online: false });
          return;
        }
        ack({ userId: parsed.data.userId, online: await isUserOnline(parsed.data.userId) });
      } catch {
        ack({ error: { code: 'PRESENCE_UNAVAILABLE', message: 'Presence temporarily unavailable' } });
      }
    });

    socket.on('disconnect', () => {
      void removePresenceSocket(userId, socket.id).catch((err: unknown) =>
        logger.warn({ err: String(err) }, 'Presence remove failed'),
      );
      logger.info({ userId, socketId: socket.id }, 'Socket disconnected');
    });
  });

  return io;
}
