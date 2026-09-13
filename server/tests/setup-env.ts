// Vitest setup: runs before any test module is imported (in particular
// before src/config/env.ts reads process.env). Routes the whole suite at
// an isolated test database and guarantees test-safe secrets.
import dotenv from 'dotenv';
import { tmpdir } from 'os';
import { join } from 'path';

const explicitUploadDir = process.env.UPLOAD_DIR;
// Make server/.env values (e.g. TEST_DATABASE_URL) visible to the suite.
// Real environment variables always take precedence over the file.
dotenv.config({ path: '.env' });

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
// Generous test budgets: rate limiting itself is a hardening-phase concern;
// the suite must not trip over shared 15-minute windows across files/runs.
if (!process.env.RATE_LIMIT_AUTH_MAX) process.env.RATE_LIMIT_AUTH_MAX = '1000';
if (!process.env.RATE_LIMIT_API_MAX) process.env.RATE_LIMIT_API_MAX = '10000';
if (!process.env.RATE_LIMIT_UPLOAD_MAX) process.env.RATE_LIMIT_UPLOAD_MAX = '1000';
// Isolate test uploads from the dev ./uploads directory.
process.env.UPLOAD_DIR = explicitUploadDir || join(tmpdir(), 'ana-meet-test-uploads');
if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
  process.env.JWT_ACCESS_SECRET = 'test_access_secret_'.padEnd(64, 'x');
}
if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_'.padEnd(64, 'y');
}
