import { QueryInterface, Sequelize } from 'sequelize';
import { Umzug, SequelizeStorage } from 'umzug';
import { config } from '../config/env';
import { logger } from '../common/logger';

export function createMigrator(sequelize: Sequelize): Umzug<QueryInterface> {
  return new Umzug({
    migrations: { glob: ['migrations/*.ts', { cwd: __dirname }] },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize, tableName: 'sequelize_meta' }),
    logger: console,
  });
}

export async function runMigrationsUp(sequelize: Sequelize): Promise<void> {
  const migrator = createMigrator(sequelize);
  const applied = await migrator.up();
  logger.info({ applied: applied.map((m) => m.name) }, 'Database migrations applied');
}

// CLI: npm run db:migrate / db:migrate:undo
async function main(): Promise<void> {
  const direction = process.argv[2] ?? 'up';
  const sequelize = new Sequelize(config.databaseUrl, { dialect: 'postgres', logging: false });
  const migrator = createMigrator(sequelize);
  try {
    if (direction === 'down') {
      const reverted = await migrator.down();
      logger.info({ reverted: reverted.map((m) => m.name) }, 'Migration reverted');
    } else {
      const applied = await migrator.up();
      logger.info({ applied: applied.map((m) => m.name) }, 'Migrations applied');
    }
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  });
}
