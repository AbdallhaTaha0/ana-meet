import Redis from 'ioredis';
import { config } from '../config/env';
import { logger } from '../common/logger';

let client: Redis | null = null;
let unavailableLogged = false;

export function getRedis(): Redis {
  if (client) return client;
  client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
  client.on('error', (err) => {
    if (!unavailableLogged) {
      logger.warn({ err: String(err) }, 'Redis unavailable — transient features degraded');
      unavailableLogged = true;
    }
  });
  client.on('ready', () => {
    unavailableLogged = false;
    logger.info('Redis connection ready');
  });
  return client;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    client.removeAllListeners();
    await client.quit().catch(() => undefined);
    client = null;
    logger.info('Redis connection closed');
  }
}

// --- Presence (ephemeral, multi-socket safe) ---
// One Redis SET per user holding its active socket ids. A user is online
// while the set is non-empty; each socket carries a TTL so crashed nodes
// cannot leave ghost entries forever.
const PRESENCE_TTL_SECONDS = 60;

function presenceKey(userId: string): string {
  return `presence:${userId}`;
}

export async function addPresenceSocket(userId: string, socketId: string): Promise<number> {
  const redis = getRedis();
  const key = presenceKey(userId);
  await redis.sadd(key, socketId);
  await redis.expire(key, PRESENCE_TTL_SECONDS);
  return redis.scard(key);
}

export async function refreshPresenceSocket(userId: string, socketId: string): Promise<void> {
  const redis = getRedis();
  const key = presenceKey(userId);
  // Re-add (idempotent) and refresh sliding TTL.
  await redis.sadd(key, socketId);
  await redis.expire(key, PRESENCE_TTL_SECONDS);
}

export async function removePresenceSocket(userId: string, socketId: string): Promise<number> {
  const redis = getRedis();
  const key = presenceKey(userId);
  await redis.srem(key, socketId);
  const remaining = await redis.scard(key);
  if (remaining === 0) {
    await redis.del(key);
  } else {
    await redis.expire(key, PRESENCE_TTL_SECONDS);
  }
  return remaining;
}

export async function isUserOnline(userId: string): Promise<boolean> {
  const count = await getRedis().scard(presenceKey(userId));
  return count > 0;
}
