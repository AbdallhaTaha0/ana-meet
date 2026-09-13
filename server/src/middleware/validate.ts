import type { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { Errors } from '../common/errors';

type Source = 'body' | 'query' | 'params';

// Validates external input with Zod before it reaches controllers/services.
export function validate(source: Source, schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      (req as unknown as Record<string, unknown>)[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          Errors.badRequest(
            'Validation failed',
            err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
        return;
      }
      next(err);
    }
  };
}
