import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('notifications', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    recipient_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    actor_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    type: { type: DataTypes.ENUM('MESSAGE', 'SYSTEM'), allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    body: { type: DataTypes.STRING(280), allowNull: false },
    conversation_id: { type: DataTypes.UUID, allowNull: true },
    message_id: { type: DataTypes.UUID, allowNull: true },
    read_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('notifications', ['recipient_id'], {
    name: 'notifications_recipient_idx',
  });
  await queryInterface.addIndex('notifications', ['recipient_id', 'read_at'], {
    name: 'notifications_recipient_read_idx',
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('notifications');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_type";');
};
