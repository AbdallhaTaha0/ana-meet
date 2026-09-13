import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('admin_audit_logs', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    action: { type: DataTypes.STRING(64), allowNull: false },
    target_type: { type: DataTypes.STRING(32), allowNull: true },
    target_id: { type: DataTypes.UUID, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('admin_audit_logs', ['admin_id'], {
    name: 'admin_audit_logs_admin_idx',
  });
  await queryInterface.addIndex('admin_audit_logs', ['created_at'], {
    name: 'admin_audit_logs_created_idx',
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('admin_audit_logs');
};
