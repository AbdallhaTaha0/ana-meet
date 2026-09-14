import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { User } from './User';

export type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface FriendRequestAttributes {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendRequestStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

type FriendRequestCreation = Optional<FriendRequestAttributes, 'id' | 'status' | 'createdAt' | 'updatedAt'>;

// Friend requests are separate from blocks and contacts:
// - PENDING means waiting for addressee decision.
// - ACCEPTED means friends (also mirrored as mutual contacts for feed).
// - REJECTED/CANCELLED are terminal but re-requestable (row resets to PENDING).
// - Blocks never auto-accept; a block cancels pending rows between the pair.
export class FriendRequest
  extends Model<FriendRequestAttributes, FriendRequestCreation>
  implements FriendRequestAttributes
{
  declare id: string;
  declare requesterId: string;
  declare addresseeId: string;
  declare status: FriendRequestStatus;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initFriendRequest(sequelize: Sequelize): void {
  FriendRequest.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      requesterId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'requester_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      addresseeId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'addressee_id',
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
    },
    {
      sequelize,
      tableName: 'friend_requests',
      indexes: [
        { unique: true, fields: ['requester_id', 'addressee_id'], name: 'friend_requests_pair_unique' },
        { fields: ['requester_id'], name: 'friend_requests_requester_idx' },
        { fields: ['addressee_id'], name: 'friend_requests_addressee_idx' },
        { fields: ['addressee_id', 'status'], name: 'friend_requests_addressee_status_idx' },
        { fields: ['requester_id', 'status'], name: 'friend_requests_requester_status_idx' },
      ],
    },
  );

  User.hasMany(FriendRequest, { foreignKey: 'requesterId', as: 'sentFriendRequests', onDelete: 'CASCADE' });
  User.hasMany(FriendRequest, { foreignKey: 'addresseeId', as: 'receivedFriendRequests', onDelete: 'CASCADE' });
  FriendRequest.belongsTo(User, { foreignKey: 'requesterId', as: 'requester' });
  FriendRequest.belongsTo(User, { foreignKey: 'addresseeId', as: 'addressee' });
}
