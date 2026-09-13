import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { User } from './User';

export type StoryType = 'TEXT' | 'IMAGE' | 'VIDEO';

export interface StoryAttributes {
  id: string;
  ownerId: string;
  type: StoryType;
  content: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

type StoryCreation = Optional<
  StoryAttributes,
  'id' | 'content' | 'mediaUrl' | 'mimeType' | 'sizeBytes' | 'createdAt' | 'updatedAt'
>;

export class Story extends Model<StoryAttributes, StoryCreation> implements StoryAttributes {
  declare id: string;
  declare ownerId: string;
  declare type: StoryType;
  declare content: string | null;
  declare mediaUrl: string | null;
  declare mimeType: string | null;
  declare sizeBytes: number | null;
  declare expiresAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initStory(sequelize: Sequelize): void {
  Story.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'owner_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: DataTypes.ENUM('TEXT', 'IMAGE', 'VIDEO'), allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: true },
      mediaUrl: { type: DataTypes.STRING(2048), allowNull: true, field: 'media_url' },
      mimeType: { type: DataTypes.STRING(128), allowNull: true, field: 'mime_type' },
      sizeBytes: { type: DataTypes.BIGINT, allowNull: true, field: 'size_bytes' },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    },
    {
      sequelize,
      tableName: 'stories',
      indexes: [
        { fields: ['owner_id'], name: 'stories_owner_idx' },
        { fields: ['expires_at'], name: 'stories_expires_at_idx' },
        { fields: ['owner_id', 'expires_at'], name: 'stories_owner_expires_idx' },
      ],
    },
  );

  User.hasMany(Story, { foreignKey: 'ownerId', as: 'stories', onDelete: 'CASCADE' });
  Story.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
}
