import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { User } from './User';

export interface MediaAssetAttributes {
  // Server-generated date-sharded path, e.g. 2026/09/<hex>.png.
  id: string;
  ownerId: string;
  mimeType: string;
  kind: 'IMAGE' | 'VIDEO' | 'FILE';
  sizeBytes: number;
  fileName: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type MediaAssetCreation = Optional<MediaAssetAttributes, 'fileName' | 'createdAt' | 'updatedAt'>;

export class MediaAsset
  extends Model<MediaAssetAttributes, MediaAssetCreation>
  implements MediaAssetAttributes
{
  declare id: string;
  declare ownerId: string;
  declare mimeType: string;
  declare kind: 'IMAGE' | 'VIDEO' | 'FILE';
  declare sizeBytes: number;
  declare fileName: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initMediaAsset(sequelize: Sequelize): void {
  MediaAsset.init(
    {
      id: { type: DataTypes.STRING(160), primaryKey: true },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'owner_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      mimeType: { type: DataTypes.STRING(128), allowNull: false, field: 'mime_type' },
      kind: { type: DataTypes.ENUM('IMAGE', 'VIDEO', 'FILE'), allowNull: false },
      sizeBytes: { type: DataTypes.BIGINT, allowNull: false, field: 'size_bytes' },
      fileName: { type: DataTypes.STRING(255), allowNull: true, field: 'file_name' },
    },
    {
      sequelize,
      tableName: 'media_assets',
      indexes: [{ fields: ['owner_id'], name: 'media_assets_owner_idx' }],
    },
  );

  User.hasMany(MediaAsset, { foreignKey: 'ownerId', as: 'mediaAssets', onDelete: 'CASCADE' });
  MediaAsset.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
}
