import type { CookieOptions, Response } from 'express';
import { config } from '../config/env';

export const ACCESS_COOKIE = 'am_access';
export const REFRESH_COOKIE = 'am_refresh';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite,
    domain: config.cookies.domain,
  };
}

function msFromTtl(ttl: string): number {
  const match = ttl.match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === 's') return value * 1000;
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  return value * 24 * 60 * 60 * 1000;
}

export function setAuthCookies(res: Response, tokens: { access: string; refresh: string }): void {
  res.cookie(ACCESS_COOKIE, tokens.access, {
    ...baseOptions(),
    path: '/',
    maxAge: msFromTtl(config.jwt.accessTtl),
  });
  // Refresh cookie is scoped to auth endpoints to reduce exposure.
  res.cookie(REFRESH_COOKIE, tokens.refresh, {
    ...baseOptions(),
    path: '/api/v1/auth',
    maxAge: config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: '/api/v1/auth' });
}
