import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('conversations', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: { type: DataTypes.ENUM('DIRECT', 'GROUP'), allowNull: false },
    title: { type: DataTypes.STRING(100), allowNull: true },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('conversations', ['type'], {
    name: 'conversations_type_idx',
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('conversations');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_conversations_type";');
};
