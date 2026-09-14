import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { Conversation } from './Conversation';
import { User } from './User';

export type ParticipantRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface ConversationParticipantAttributes {
  id: string;
  conversationId: string;
  userId: string;
  role: ParticipantRole;
  hidden: boolean;
  muted: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

type ParticipantCreation = Optional<
  ConversationParticipantAttributes,
  'id' | 'role' | 'hidden' | 'muted' | 'createdAt' | 'updatedAt'
>;

export class ConversationParticipant
  extends Model<ConversationParticipantAttributes, ParticipantCreation>
  implements ConversationParticipantAttributes
{
  declare id: string;
  declare conversationId: string;
  declare userId: string;
  declare role: ParticipantRole;
  declare hidden: boolean;
  declare muted: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initConversationParticipant(sequelize: Sequelize): void {
  ConversationParticipant.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      conversationId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'conversation_id',
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
        references: { model: 'users', key: 'id' },
        // Account deletion removes membership (history handling is explicit).
        onDelete: 'CASCADE',
      },
      role: {
        type: DataTypes.ENUM('OWNER', 'ADMIN', 'MEMBER'),
        allowNull: false,
        defaultValue: 'MEMBER',
      },
      // Close chat: hidden from this member's list only. Membership, history,
      // and other members are untouched. Any new message reopens it.
      hidden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Mute: no notification push for this member, but rows (and unread
      // counters) are still recorded — WhatsApp semantics.
      muted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      sequelize,
      tableName: 'conversation_participants',
      indexes: [
        {
          unique: true,
          fields: ['conversation_id', 'user_id'],
          name: 'conversation_participants_pair_unique',
        },
        { fields: ['conversation_id'], name: 'conversation_participants_conversation_idx' },
        { fields: ['user_id'], name: 'conversation_participants_user_idx' },
      ],
    },
  );

  Conversation.hasMany(ConversationParticipant, {
    foreignKey: 'conversationId',
    as: 'participants',
    onDelete: 'CASCADE',
  });
  ConversationParticipant.belongsTo(Conversation, {
    foreignKey: 'conversationId',
    as: 'conversation',
  });
  User.hasMany(ConversationParticipant, {
    foreignKey: 'userId',
    as: 'conversationMemberships',
    onDelete: 'CASCADE',
  });
  ConversationParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });
}
