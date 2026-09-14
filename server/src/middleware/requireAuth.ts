import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE } from '../common/cookies';
import { Errors } from '../common/errors';
import { verifyAccessToken, type AccountRole } from '../common/tokens';
import { User } from '../db/models';

export interface AuthContext {
  userId: string;
  role: AccountRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function extractToken(req: Request): string | null {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return null;
}

// Authentication: verifies the access JWT and the underlying account state,
// so deleted/disabled users lose access even with a not-yet-expired token.
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      next(Errors.unauthorized('Authentication required'));
      return;
    }
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      next(Errors.unauthorized('Invalid or expired token'));
      return;
    }
    const user = await User.findByPk(payload.sub, { attributes: ['id', 'role', 'status', 'authVersion'] });
    if (!user || user.status !== 'ACTIVE' || (payload.version ?? 0) !== user.authVersion) {
      next(Errors.unauthorized('Invalid or expired token'));
      return;
    }
    req.auth = { userId: user.id, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  // Never trust client claims — role comes from the verified server-side session above.
  if (!req.auth || req.auth.role !== 'ADMIN') {
    next(Errors.forbidden('Admin access required'));
    return;
  }
  next();
}
