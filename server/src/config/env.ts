import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_ORIGIN: z.string().url().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  POSTGRES_USER: z.string().default('anameet'),
  POSTGRES_PASSWORD: z.string().default('anameet_dev_password'),
  POSTGRES_DB: z.string().default('anameet'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_HOST: z.string().default('localhost'),
  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DB_POOL_MIN: z.coerce.number().int().min(0).max(50).default(0),
  DB_POOL_IDLE_MS: z.coerce.number().int().positive().default(10000),
  DB_POOL_ACQUIRE_MS: z.coerce.number().int().positive().default(30000),
  DB_AUTO_MIGRATE: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === undefined ? undefined : v === 'true'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(50),
  RATE_LIMIT_API_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),
  RATE_LIMIT_API_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_UPLOAD_WINDOW_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().positive().default(60),

  UPLOAD_DIR: z.string().default('./uploads'),

  TEST_DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production';
if (isProduction && (!raw.PUBLIC_ORIGIN?.startsWith('https://') || raw.COOKIE_SECURE === false)) {
  throw new Error('Production requires an HTTPS PUBLIC_ORIGIN and secure cookies');
}

const databaseUrl =
  raw.DATABASE_URL && raw.DATABASE_URL.length > 0
    ? raw.DATABASE_URL
    : `postgres://${encodeURIComponent(raw.POSTGRES_USER)}:${encodeURIComponent(
        raw.POSTGRES_PASSWORD,
      )}@${raw.POSTGRES_HOST}:${raw.POSTGRES_PORT}/${raw.POSTGRES_DB}`;

export const config = {
  port: raw.PORT,
  trustProxyHops: raw.TRUST_PROXY_HOPS,
  nodeEnv: raw.NODE_ENV,
  isProduction,
  clientOrigins: raw.CLIENT_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  publicOrigin: raw.PUBLIC_ORIGIN || `http://localhost:${raw.PORT}`,
  databaseUrl,
  dbPool: {
    max: raw.DB_POOL_MAX,
    min: raw.DB_POOL_MIN,
    idleMs: raw.DB_POOL_IDLE_MS,
    acquireMs: raw.DB_POOL_ACQUIRE_MS,
  },
  dbAutoMigrate: isProduction ? false : raw.DB_AUTO_MIGRATE,
  redisUrl: raw.REDIS_URL,
  jwt: {
    accessSecret: raw.JWT_ACCESS_SECRET,
    refreshSecret: raw.JWT_REFRESH_SECRET,
    accessTtl: raw.ACCESS_TOKEN_TTL,
    refreshTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
  },
  cookies: {
    domain: raw.COOKIE_DOMAIN || undefined,
    // In production cookies must be Secure; local dev over HTTP opts out explicitly.
    secure: raw.COOKIE_SECURE ?? isProduction,
    sameSite: raw.COOKIE_SAMESITE as 'lax' | 'strict' | 'none',
  },
  rateLimit: {
    authWindowMs: raw.RATE_LIMIT_AUTH_WINDOW_MS,
    authMax: raw.RATE_LIMIT_AUTH_MAX,
    apiWindowMs: raw.RATE_LIMIT_API_WINDOW_MS,
    apiMax: raw.RATE_LIMIT_API_MAX,
    uploadWindowMs: raw.RATE_LIMIT_UPLOAD_WINDOW_MS,
    uploadMax: raw.RATE_LIMIT_UPLOAD_MAX,
  },
  uploadDir: raw.UPLOAD_DIR,
  testDatabaseUrl: raw.TEST_DATABASE_URL,
  logLevel: raw.LOG_LEVEL,
};

export type AppConfig = typeof config;
