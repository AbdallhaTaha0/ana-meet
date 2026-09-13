import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env';
import { logger } from '../common/logger';
import { toErrorResponse } from '../common/errors';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
}

// Centralized error handler: consistent shape, no stack traces or
// infrastructure details leak to clients in production.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const normalized = err instanceof Error ? err : new Error(String(err));
  const { statusCode, body } = toErrorResponse(normalized);
  if (statusCode >= 500) {
    logger.error(
      { err: normalized.message, method: req.method, path: req.path },
      'Unhandled request error',
    );
  } else {
    logger.warn(
      { statusCode, code: (body.error as { code: string }).code, method: req.method, path: req.path },
      'Request error',
    );
  }
  if (res.headersSent) return;
  if (!config.isProduction && statusCode >= 500 && normalized.stack) {
    res.status(statusCode).json({
      ...body,
      dev: { stack: normalized.stack.split('\n').slice(0, 5) },
    });
    return;
  }
  res.status(statusCode).json(body);
}
