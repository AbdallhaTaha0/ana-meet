import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
  await queryInterface.createTable('users', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    username: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING(128), allowNull: false },
    display_name: { type: DataTypes.STRING(80), allowNull: false },
    public_id: { type: DataTypes.STRING(16), allowNull: false, unique: true },
    role: { type: DataTypes.ENUM('USER', 'BOT', 'ADMIN'), allowNull: false, defaultValue: 'USER' },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'DISABLED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('users', ['username'], { unique: true, name: 'users_username_unique' });
  await queryInterface.addIndex('users', ['email'], { unique: true, name: 'users_email_unique' });
  await queryInterface.addIndex('users', ['public_id'], {
    unique: true,
    name: 'users_public_id_unique',
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('users');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_role";');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_users_status";');
};
