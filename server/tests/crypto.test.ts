import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/common/password';
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../src/common/tokens';

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).not.toContain('correct-horse-battery');
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});

describe('jwt tokens', () => {
  it('round-trips access and refresh tokens', () => {
    const access = signAccessToken('user-1', 'USER');
    expect(verifyAccessToken(access).sub).toBe('user-1');

    const refresh = signRefreshToken('user-1', 'session-1');
    const payload = verifyRefreshToken(refresh);
    expect(payload.sub).toBe('user-1');
    expect(payload.sid).toBe('session-1');
  });

  it('rejects tampered tokens and cross-type use', () => {
    const access = signAccessToken('user-1', 'USER');
    expect(() => verifyAccessToken(`${access}x`)).toThrow();
    // An access token must not verify as a refresh token and vice versa.
    expect(() => verifyRefreshToken(access)).toThrow();
    expect(() => verifyAccessToken(signRefreshToken('user-1', 's1'))).toThrow();
  });

  it('hashes refresh tokens deterministically without leaking the value', () => {
    const token = signRefreshToken('user-1', 'session-1');
    const hashed = hashRefreshToken(token);
    expect(hashed).toBe(hashRefreshToken(token));
    expect(hashed).not.toContain(token);
    expect(hashed).toHaveLength(64);
  });
});

