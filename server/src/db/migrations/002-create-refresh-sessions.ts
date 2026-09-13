import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('refresh_sessions', {
    id: { type: DataTypes.UUID, primaryKey: true },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    refresh_hash: { type: DataTypes.STRING(64), allowNull: false },
    user_agent: { type: DataTypes.STRING(512), allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    replaced_by: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('refresh_sessions', ['user_id'], {
    name: 'refresh_sessions_user_id_idx',
  });
  await queryInterface.addIndex('refresh_sessions', ['expires_at'], {
    name: 'refresh_sessions_expires_at_idx',
  });
  await queryInterface.addIndex('refresh_sessions', ['user_id', 'revoked_at'], {
    name: 'refresh_sessions_user_revoked_idx',
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('refresh_sessions');
};
