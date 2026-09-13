import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { User } from './User';

export type NotificationType = 'MESSAGE' | 'SYSTEM';

export interface NotificationAttributes {
  id: string;
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  conversationId: string | null;
  messageId: string | null;
  readAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type NotificationCreation = Optional<
  NotificationAttributes,
  'id' | 'actorId' | 'conversationId' | 'messageId' | 'readAt' | 'createdAt' | 'updatedAt'
>;

export class Notification
  extends Model<NotificationAttributes, NotificationCreation>
  implements NotificationAttributes
{
  declare id: string;
  declare recipientId: string;
  declare actorId: string | null;
  declare type: NotificationType;
  declare title: string;
  declare body: string;
  declare conversationId: string | null;
  declare messageId: string | null;
  declare readAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initNotification(sequelize: Sequelize): void {
  Notification.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      recipientId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'recipient_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      actorId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'actor_id',
        references: { model: 'users', key: 'id' },
        // Actor history survives account deletion; the card resolves null.
        onDelete: 'SET NULL',
      },
      type: { type: DataTypes.ENUM('MESSAGE', 'SYSTEM'), allowNull: false },
      title: { type: DataTypes.STRING(160), allowNull: false },
      body: { type: DataTypes.STRING(280), allowNull: false },
      conversationId: { type: DataTypes.UUID, allowNull: true, field: 'conversation_id' },
      messageId: { type: DataTypes.UUID, allowNull: true, field: 'message_id' },
      readAt: { type: DataTypes.DATE, allowNull: true, field: 'read_at' },
    },
    {
      sequelize,
      tableName: 'notifications',
      indexes: [
        { fields: ['recipient_id'], name: 'notifications_recipient_idx' },
        { fields: ['recipient_id', 'read_at'], name: 'notifications_recipient_read_idx' },
      ],
    },
  );

  User.hasMany(Notification, {
    foreignKey: 'recipientId',
    as: 'notifications',
    onDelete: 'CASCADE',
  });
  Notification.belongsTo(User, { foreignKey: 'recipientId', as: 'recipient' });
  Notification.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });
}
