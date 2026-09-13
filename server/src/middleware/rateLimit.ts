import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { config } from '../config/env';
import { logger } from '../common/logger';
import { getRedis } from '../redis/redis';

function storeFor(prefix: string) {
  try {
    return new RedisStore({
      prefix,
      // rate-limit-redis v4 delegates raw commands to ioredis.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendCommand: (...args: string[]) => (getRedis().call as any)(...args),
    });
  } catch (err) {
    logger.warn({ err: String(err) }, 'Falling back to in-memory rate limiting');
    return undefined;
  }
}

// NOTE on Redis outages: `passOnStoreError` keeps every limiter fail-open
// so a cache/coordination failure degrades protection instead of turning
// the whole API into 500s (Redis is auxiliary per architecture rules).
// Strict limiter for auth endpoints (brute-force protection).
export const authLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  passOnStoreError: true,
  store: storeFor('rl:auth:'),
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } },
});

// General API limiter.
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.apiMax,
  // Auth writes have their own stricter limiter; session checks must remain available.
  skip: (req) => req.path.startsWith('/v1/auth/'),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  passOnStoreError: true,
  store: storeFor('rl:api:'),
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } },
});

// Strict per-user budget for uploads (bandwidth + storage abuse).
export const uploadLimiter = rateLimit({
  windowMs: config.rateLimit.uploadWindowMs,
  max: config.rateLimit.uploadMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  passOnStoreError: true,
  store: storeFor('rl:upload:'),
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } },
});
