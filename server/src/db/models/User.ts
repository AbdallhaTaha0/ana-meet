import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import type { AccountRole } from '../../common/tokens';

export type AccountStatus = 'ACTIVE' | 'DISABLED';

export interface UserAttributes {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
  publicId: string;
  role: AccountRole;
  status: AccountStatus;
  authVersion: number;
  createdAt?: Date;
  updatedAt?: Date;
}

type UserCreation = Optional<UserAttributes, 'id' | 'role' | 'status' | 'authVersion' | 'createdAt' | 'updatedAt'>;

export class User extends Model<UserAttributes, UserCreation> implements UserAttributes {
  declare id: string;
  declare username: string;
  declare email: string;
  declare passwordHash: string;
  declare displayName: string;
  declare publicId: string;
  declare role: AccountRole;
  declare status: AccountStatus;
  declare authVersion: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initUser(sequelize: Sequelize): void {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      username: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
      passwordHash: { type: DataTypes.STRING(128), allowNull: false, field: 'password_hash' },
      displayName: { type: DataTypes.STRING(80), allowNull: false, field: 'display_name' },
      publicId: { type: DataTypes.STRING(16), allowNull: false, unique: true, field: 'public_id' },
      role: { type: DataTypes.ENUM('USER', 'BOT', 'ADMIN'), allowNull: false, defaultValue: 'USER' },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'DISABLED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      authVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'auth_version' },
    },
    {
      sequelize,
      tableName: 'users',
      indexes: [
        { unique: true, fields: ['username'] },
        { unique: true, fields: ['email'] },
        { unique: true, fields: ['public_id'] },
      ],
    },
  );
}
