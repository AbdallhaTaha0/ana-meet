import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export type AccountRole = 'USER' | 'BOT' | 'ADMIN';

export interface AccessTokenPayload {
  sub: string; // user id
  role: AccountRole;
  type: 'access';
  version?: number;
}

export interface RefreshTokenPayload {
  sub: string; // user id
  sid: string; // refresh session id (jti)
  type: 'refresh';
}

export function signAccessToken(userId: string, role: AccountRole, version = 0): string {
  const payload: AccessTokenPayload = { sub: userId, role, type: 'access', version };
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl as jwt.SignOptions['expiresIn'],
  });
}

export function signRefreshToken(userId: string, sessionId: string): string {
  const payload: RefreshTokenPayload = { sub: userId, sid: sessionId, type: 'refresh' };
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: `${config.jwt.refreshTtlDays}d`,
    jwtid: sessionId,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
  if (decoded.type !== 'access' || !decoded.sub) throw new Error('Invalid access token');
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
  if (decoded.type !== 'refresh' || !decoded.sub || !decoded.sid) {
    throw new Error('Invalid refresh token');
  }
  return decoded;
}

// Server-side sessions store only a SHA-256 hash of the refresh token,
// so a database leak does not yield usable credentials.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionId(): string {
  return randomUUID();
}
