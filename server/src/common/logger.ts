import pino from 'pino';
import { config } from '../config/env';

// Structured logger. Sensitive fields are redacted so tokens, cookies,
// passwords and secrets can never be logged accidentally.
export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'cookie',
      'cookies',
      'authorization',
      'secret',
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
});
