import { createServer } from 'http';
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './common/logger';
import { closeDatabase, connectDatabase, getSequelize } from './db/sequelize';
import { runMigrationsUp } from './db/migrate';
import { closeRedis, pingRedis } from './redis/redis';
import { initSocket } from './realtime/socket';
import { setSocketServer } from './realtime/bus';
import { deleteExpiredStories, startStorySweeper } from './modules/stories/stories.service';
import { ensureStorageDirs } from './storage';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  if (config.dbAutoMigrate) {
    await runMigrationsUp(getSequelize());
  } else {
    logger.info('DB_AUTO_MIGRATE disabled — expecting migrations to be applied externally');
  }

  const redisOk = await pingRedis();
  if (!redisOk) {
    // Redis is auxiliary: the API stays up, transient features degrade.
    logger.warn('Redis unreachable at boot — presence/rate-limit distribution degraded');
  }

  await ensureStorageDirs();

  const app = createApp();
  const httpServer = createServer(app);
  const io = initSocket(httpServer);

  // Janitorial only: reads always filter expired stories, so this just
  // bounds table growth. One boot sweep plus an hourly pass.
  await deleteExpiredStories().catch((err: unknown) =>
    logger.warn({ err: String(err) }, 'Initial story sweep failed'),
  );
  const stopStorySweeper = startStorySweeper();

  httpServer.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.nodeEnv, origins: config.clientOrigins },
      'ANA Meet server listening',
    );
  });

  // Graceful shutdown: stop intake → close sockets → Redis → PostgreSQL.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown initiated');
    stopStorySweeper();
    httpServer.close(() => logger.info('HTTP server closed'));
    // Stop accepting new socket work, then close existing connections.
    io.disconnectSockets(true);
    setSocketServer(null);
    void io.close().then(() => logger.info('Socket.IO closed'));
    // Give in-flight requests a moment to finish, then release resources.
    // The timer is NOT unref'd: the process must stay alive until cleanup
    // completes (or the hard stop below fires).
    setTimeout(() => {
      void closeRedis()
        .then(() => closeDatabase())
        .then(() => {
          logger.info('Shutdown complete');
          process.exit(0);
        })
        .catch((err: unknown) => {
          logger.error({ err: String(err) }, 'Error during shutdown');
          process.exit(1);
        });
    }, 1000);
    // Hard stop if dependencies hang.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err: unknown) => {
  logger.error({ err: String(err) }, 'Failed to start server');
  process.exit(1);
});
