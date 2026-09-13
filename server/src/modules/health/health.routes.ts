import { Router } from 'express';
import type { Request, Response } from 'express';
import { getSequelize } from '../../db/sequelize';
import { logger } from '../../common/logger';
import { pingRedis } from '../../redis/redis';

export const healthRoutes: Router = Router();

// Liveness: the process is running. No dependency checks, no secrets.
healthRoutes.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'ana-meet-server',
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

// Readiness: safe dependency health for load balancers / Docker.
// Returns 503 when a dependency is unhealthy; never exposes connection strings.
healthRoutes.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<'database' | 'redis', 'up' | 'down'> = { database: 'down', redis: 'down' };
  try {
    await getSequelize().authenticate();
    checks.database = 'up';
  } catch (err) {
    logger.warn({ err: String(err) }, 'Readiness: database check failed');
  }
  checks.redis = (await pingRedis()) ? 'up' : 'down';

  const ready = checks.database === 'up' && checks.redis === 'up';
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', checks });
});
