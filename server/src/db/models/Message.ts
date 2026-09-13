import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { Conversation } from './Conversation';
import { User } from './User';

export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE';
export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';

export interface MessageAttributes {
  id: string;
  conversationId: string;
  senderId: string | null;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  fileName: string | null;
  replyToMessageId: string | null;
  clientMessageId: string;
  status: MessageStatus;
  editedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type MessageCreation = Optional<
  MessageAttributes,
  'id' | 'content' | 'mediaUrl' | 'mimeType' | 'sizeBytes' | 'fileName' | 'replyToMessageId' | 'status' | 'editedAt' | 'createdAt' | 'updatedAt'
>;

export class Message extends Model<MessageAttributes, MessageCreation> implements MessageAttributes {
  declare id: string;
  declare conversationId: string;
  declare senderId: string | null;
  declare type: MessageType;
  declare content: string | null;
  declare mediaUrl: string | null;
  declare mimeType: string | null;
  declare sizeBytes: number | null;
  declare fileName: string | null;
  declare replyToMessageId: string | null;
  declare clientMessageId: string;
  declare status: MessageStatus;
  declare editedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initMessage(sequelize: Sequelize): void {
  Message.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      conversationId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'conversation_id',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      senderId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'sender_id',
        references: { model: 'users', key: 'id' },
        // Deleted users' messages stay visible to peers (sender resolves null).
        onDelete: 'SET NULL',
      },
      type: { type: DataTypes.ENUM('TEXT', 'IMAGE', 'VIDEO', 'FILE'), allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: true },
      mediaUrl: { type: DataTypes.STRING(2048), allowNull: true, field: 'media_url' },
      mimeType: { type: DataTypes.STRING(128), allowNull: true, field: 'mime_type' },
      sizeBytes: { type: DataTypes.BIGINT, allowNull: true, field: 'size_bytes' },
      fileName: { type: DataTypes.STRING(255), allowNull: true, field: 'file_name' },
      replyToMessageId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'reply_to_message_id',
        references: { model: 'messages', key: 'id' },
        // Deleting a parent orphans replies (replyTo resolves null), never cascades.
        onDelete: 'SET NULL',
      },
      clientMessageId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'client_message_id',
      },
      status: {
        type: DataTypes.ENUM('SENT', 'DELIVERED', 'READ'),
        allowNull: false,
        defaultValue: 'SENT',
      },
      editedAt: { type: DataTypes.DATE, allowNull: true, field: 'edited_at' },
    },
    {
      sequelize,
      tableName: 'messages',
      indexes: [
        {
          unique: true,
          fields: ['conversation_id', 'client_message_id'],
          name: 'messages_idempotency_unique',
        },
        {
          fields: ['conversation_id', 'created_at', 'id'],
          name: 'messages_conversation_history_idx',
        },
        { fields: ['sender_id'], name: 'messages_sender_idx' },
      ],
    },
  );

  Conversation.hasMany(Message, {
    foreignKey: 'conversationId',
    as: 'messages',
    onDelete: 'CASCADE',
  });
  Message.belongsTo(Conversation, { foreignKey: 'conversationId', as: 'conversation' });
  User.hasMany(Message, { foreignKey: 'senderId', as: 'sentMessages', onDelete: 'SET NULL' });
  Message.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
  Message.belongsTo(Message, { foreignKey: 'replyToMessageId', as: 'replyTo' });
}
