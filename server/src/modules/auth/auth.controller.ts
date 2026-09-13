import type { Request, Response } from 'express';
import { AppError } from '../../common/errors';
import { Errors } from '../../common/errors';
import { asyncHandler } from '../../common/asyncHandler';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../../common/cookies';
import type { SessionMeta } from './auth.service';
import {
  getCurrentUser,
  loginUser,
  logoutAllSessions,
  logoutSession,
  refreshSession,
  registerUser,
} from './auth.service';

function sessionMeta(req: Request): SessionMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()) ??
    req.ip ??
    null;
  const userAgent = req.headers['user-agent'] ?? null;
  return {
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
    ip: typeof ip === 'string' ? ip.slice(0, 64) : null,
  };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens } = await registerUser(req.body, sessionMeta(req));
  setAuthCookies(res, tokens);
  res.status(201).json({ user });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens } = await loginUser(req.body, sessionMeta(req));
  setAuthCookies(res, tokens);
  res.status(200).json({ user });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (typeof presented !== 'string' || presented.length === 0) {
    throw Errors.unauthorized('Invalid or expired refresh token');
  }
  try {
    const { user, tokens } = await refreshSession(presented, sessionMeta(req));
    setAuthCookies(res, tokens);
    res.status(200).json({ user });
  } catch (err) {
    // A failed refresh must not leave stale credentials in the browser.
    if (err instanceof AppError && err.code === 'TOKEN_REUSED') clearAuthCookies(res);
    throw err;
  }
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (typeof presented === 'string' && presented.length > 0) {
    await logoutSession(presented);
  }
  clearAuthCookies(res);
  res.status(204).send();
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  await logoutAllSessions(req.auth.userId);
  clearAuthCookies(res);
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.auth) throw Errors.unauthorized();
  const user = await getCurrentUser(req.auth.userId);
  res.status(200).json({ user });
});
