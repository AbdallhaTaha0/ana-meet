import { getRedis } from './redis';

// Distributed sliding-window limiter (INCR + TTL). Shared across Node
// instances via Redis; fails OPEN when Redis is unreachable so a cache
// outage degrades protection instead of blocking legitimate traffic.
export async function checkRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return { allowed: count <= max, remaining: Math.max(0, max - count) };
  } catch {
    return { allowed: true, remaining: max };
  }
}
