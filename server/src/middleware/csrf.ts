import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';
import { Errors } from '../common/errors';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../common/cookies';

// Lightweight CSRF defense for cookie-authenticated mutations:
// browsers sending cross-site form requests cannot set a custom header,
// while the SPA (fetch/axios) always sends one of the two signals below.
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const hasAuthCookie =
    Boolean(req.cookies?.[ACCESS_COOKIE]) || Boolean(req.cookies?.[REFRESH_COOKIE]);
  if (!hasAuthCookie) {
    next();
    return;
  }
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const requestedWith = req.headers['x-requested-with'];
  const trusted = (value: string | undefined): boolean => {
    if (!value) return false;
    try {
      return config.clientOrigins.includes(new URL(value).origin);
    } catch {
      return false;
    }
  };

  // A present Origin/Referer must match exactly; a custom header alone is
  // acceptable for non-browser clients that send neither header.
  if (origin && !trusted(origin)) {
    next(Errors.forbidden('CSRF validation failed'));
    return;
  }
  if (!origin && referer && !trusted(referer)) {
    next(Errors.forbidden('CSRF validation failed'));
    return;
  }
  if (trusted(origin) || trusted(referer) || requestedWith === 'XMLHttpRequest') {
    next();
    return;
  }
  next(Errors.forbidden('CSRF validation failed'));
}
