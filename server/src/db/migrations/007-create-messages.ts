import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('messages', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversation_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'conversations', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    sender_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    type: { type: DataTypes.ENUM('TEXT', 'IMAGE', 'VIDEO', 'FILE'), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: true },
    media_url: { type: DataTypes.STRING(2048), allowNull: true },
    mime_type: { type: DataTypes.STRING(128), allowNull: true },
    size_bytes: { type: DataTypes.BIGINT, allowNull: true },
    file_name: { type: DataTypes.STRING(255), allowNull: true },
    reply_to_message_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'messages', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
    client_message_id: { type: DataTypes.UUID, allowNull: false },
    status: {
      type: DataTypes.ENUM('SENT', 'DELIVERED', 'READ'),
      allowNull: false,
      defaultValue: 'SENT',
    },
    edited_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('messages', ['conversation_id', 'client_message_id'], {
    unique: true,
    name: 'messages_idempotency_unique',
  });
  await queryInterface.addIndex('messages', ['conversation_id', 'created_at', 'id'], {
    name: 'messages_conversation_history_idx',
  });
  await queryInterface.addIndex('messages', ['sender_id'], { name: 'messages_sender_idx' });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('messages');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_messages_type";');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_messages_status";');
};
