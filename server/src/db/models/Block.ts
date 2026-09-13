import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { User } from './User';

export interface BlockAttributes {
  id: string;
  blockerId: string;
  blockedUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

type BlockCreation = Optional<BlockAttributes, 'id' | 'createdAt' | 'updatedAt'>;

// Directional: blockerId blocks blockedUserId. Enforcement treats a block
// in EITHER direction as a barrier between the two users.
export class Block extends Model<BlockAttributes, BlockCreation> implements BlockAttributes {
  declare id: string;
  declare blockerId: string;
  declare blockedUserId: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initBlock(sequelize: Sequelize): void {
  Block.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      blockerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'blocker_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      blockedUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'blocked_user_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      sequelize,
      tableName: 'blocks',
      indexes: [
        { unique: true, fields: ['blocker_id', 'blocked_user_id'], name: 'blocks_pair_unique' },
        { fields: ['blocker_id'], name: 'blocks_blocker_id_idx' },
        { fields: ['blocked_user_id'], name: 'blocks_blocked_user_id_idx' },
      ],
    },
  );

  User.hasMany(Block, { foreignKey: 'blockerId', as: 'blocksInitiated', onDelete: 'CASCADE' });
  Block.belongsTo(User, { foreignKey: 'blockerId', as: 'blocker' });
  Block.belongsTo(User, { foreignKey: 'blockedUserId', as: 'blockedUser' });
}
