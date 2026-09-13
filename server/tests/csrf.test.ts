import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { csrfProtection } from '../src/middleware/csrf';
import { AppError } from '../src/common/errors';

function check(headers: Record<string, string>): unknown {
  let result: unknown = 'not called';
  const req = { method: 'POST', cookies: { am_access: 'cookie' }, headers } as unknown as Request;
  csrfProtection(req, {} as Response, ((error?: unknown) => { result = error ?? null; }) as NextFunction);
  return result;
}

describe('CSRF origin validation', () => {
  it('accepts the configured client origin', () => {
    expect(check({ origin: 'http://localhost:3000', 'x-requested-with': 'XMLHttpRequest' })).toBeNull();
  });

  it('rejects an untrusted Origin even when a custom header is present', () => {
    const result = check({ origin: 'https://evil.example', 'x-requested-with': 'XMLHttpRequest' });
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).statusCode).toBe(403);
  });

  it('rejects a deceptive Referer hostname', () => {
    expect(check({ referer: 'http://localhost:3000.evil.example/path' })).toBeInstanceOf(AppError);
  });
});
