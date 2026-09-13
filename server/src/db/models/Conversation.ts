import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type ConversationType = 'DIRECT' | 'GROUP';

export interface ConversationAttributes {
  id: string;
  type: ConversationType;
  title: string | null;
  createdBy: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type ConversationCreation = Optional<
  ConversationAttributes,
  'id' | 'title' | 'createdBy' | 'createdAt' | 'updatedAt'
>;

export class Conversation
  extends Model<ConversationAttributes, ConversationCreation>
  implements ConversationAttributes
{
  declare id: string;
  declare type: ConversationType;
  declare title: string | null;
  declare createdBy: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initConversation(sequelize: Sequelize): void {
  Conversation.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      type: { type: DataTypes.ENUM('DIRECT', 'GROUP'), allowNull: false },
      title: { type: DataTypes.STRING(100), allowNull: true },
      createdBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'created_by',
        references: { model: 'users', key: 'id' },
        // Creator history survives account deletion; membership does not.
        onDelete: 'SET NULL',
      },
    },
    {
      sequelize,
      tableName: 'conversations',
      indexes: [{ fields: ['type'], name: 'conversations_type_idx' }],
    },
  );
}
