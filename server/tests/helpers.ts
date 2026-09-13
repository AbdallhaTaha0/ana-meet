import { getRedis } from '../src/redis/redis';

// Clears distributed rate-limit counters so test files are isolated from
// each other (and from repeated runs inside the 15-minute window).
export async function resetRateLimits(): Promise<void> {
  try {
    const redis = getRedis();
    const keys = await redis.keys('rl:*');
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Redis degraded — limiters fall back to per-process memory, which is
    // already isolated to this test process. Nothing to reset.
  }
}
