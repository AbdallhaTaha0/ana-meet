import { describe, expect, it } from 'vitest';
import { checkRateLimit } from '../src/redis/limits';

describe('distributed rate limiter', () => {
  it('allows up to max then blocks within the window', async () => {
    const key = `rl:test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    expect((await checkRateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await checkRateLimit(key, 2, 60)).allowed).toBe(true);
    const third = await checkRateLimit(key, 2, 60);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });
});
