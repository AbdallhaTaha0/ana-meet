// Centralized API error model. All REST responses use:
//   { "error": { "code": "...", "message": "...", "details?": ... } }
// Internal messages/stack traces are never sent to clients in production.

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  badRequest: (message = 'Invalid request', details?: unknown) =>
    new AppError(400, 'BAD_REQUEST', message, details),
  unauthorized: (message = 'Authentication required') =>
    new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Not found') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message = 'Conflict', details?: unknown) =>
    new AppError(409, 'CONFLICT', message, details),
  blocked: (message = 'Action blocked due to a block relationship') =>
    new AppError(403, 'BLOCKED', message),
  rateLimited: (message = 'Too many requests') =>
    new AppError(429, 'RATE_LIMITED', message),
  internal: (message = 'Internal server error') =>
    new AppError(500, 'INTERNAL_ERROR', message),
};

export function toErrorResponse(err: AppError | Error) {
  if (err instanceof AppError) {
    const body: { code: string; message: string; details?: unknown } = {
      code: err.code,
      message: err.message,
    };
    if (err.details !== undefined) body.details = err.details;
    return { statusCode: err.statusCode, body: { error: body } };
  }
  return { statusCode: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } } };
}
