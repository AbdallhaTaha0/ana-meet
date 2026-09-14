import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.addColumn('users', 'auth_version', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context }) => {
  await context.removeColumn('users', 'auth_version');
};
