import { Sequelize } from 'sequelize';
import { config } from '../config/env';
import { logger } from '../common/logger';
import { initModels } from './models';

let sequelize: Sequelize | null = null;

export function getSequelize(url: string = config.databaseUrl): Sequelize {
  if (sequelize) return sequelize;
  sequelize = new Sequelize(url, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false, // SQL goes through migrations/tests explicitly, never request logs
    pool: {
      max: config.dbPool.max,
      min: config.dbPool.min,
      idle: config.dbPool.idleMs,
      acquire: config.dbPool.acquireMs,
    },
    define: {
      underscored: true,
      timestamps: true,
    },
  });
  initModels(sequelize);
  return sequelize;
}

// Separate instance for tooling/tests so the app singleton is never shared.
export function createSequelize(url: string): Sequelize {
  const instance = new Sequelize(url, {
    dialect: 'postgres',
    dialectOptions: {},
    logging: false,
    pool: { max: 5, min: 0, idle: 10000, acquire: 30000 },
    define: { underscored: true, timestamps: true },
  });
  initModels(instance);
  return instance;
}

export async function connectDatabase(): Promise<Sequelize> {
  const db = getSequelize();
  await db.authenticate();
  logger.info('PostgreSQL connection established');
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (sequelize) {
    await sequelize.close();
    sequelize = null;
    logger.info('PostgreSQL connection closed');
  }
}
