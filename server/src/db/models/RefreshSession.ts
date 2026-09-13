import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { User } from './User';

export interface RefreshSessionAttributes {
  id: string;
  userId: string;
  refreshHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

type RefreshSessionCreation = Optional<
  RefreshSessionAttributes,
  'createdAt' | 'updatedAt' | 'userAgent' | 'ip' | 'revokedAt' | 'replacedBy'
>;

export class RefreshSession
  extends Model<RefreshSessionAttributes, RefreshSessionCreation>
  implements RefreshSessionAttributes
{
  declare id: string;
  declare userId: string;
  declare refreshHash: string;
  declare userAgent: string | null;
  declare ip: string | null;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare replacedBy: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initRefreshSession(sequelize: Sequelize): void {
  RefreshSession.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      refreshHash: { type: DataTypes.STRING(64), allowNull: false, field: 'refresh_hash' },
      userAgent: { type: DataTypes.STRING(512), allowNull: true, field: 'user_agent' },
      ip: { type: DataTypes.STRING(64), allowNull: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
      revokedAt: { type: DataTypes.DATE, allowNull: true, field: 'revoked_at' },
      replacedBy: { type: DataTypes.UUID, allowNull: true, field: 'replaced_by' },
    },
    {
      sequelize,
      tableName: 'refresh_sessions',
      indexes: [
        { fields: ['user_id'] },
        { fields: ['expires_at'] },
        { fields: ['user_id', 'revoked_at'] },
      ],
    },
  );

  User.hasMany(RefreshSession, { foreignKey: 'userId', as: 'sessions', onDelete: 'CASCADE' });
  RefreshSession.belongsTo(User, { foreignKey: 'userId', as: 'user' });
}
