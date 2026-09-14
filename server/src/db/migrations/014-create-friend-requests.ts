import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('friend_requests', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    requester_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    addressee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('friend_requests', ['requester_id', 'addressee_id'], {
    unique: true,
    name: 'friend_requests_pair_unique',
  });
  await queryInterface.addIndex('friend_requests', ['requester_id'], {
    name: 'friend_requests_requester_idx',
  });
  await queryInterface.addIndex('friend_requests', ['addressee_id'], {
    name: 'friend_requests_addressee_idx',
  });
  await queryInterface.addIndex('friend_requests', ['addressee_id', 'status'], {
    name: 'friend_requests_addressee_status_idx',
  });
  await queryInterface.addIndex('friend_requests', ['requester_id', 'status'], {
    name: 'friend_requests_requester_status_idx',
  });
  await queryInterface.sequelize.query(
    'ALTER TABLE friend_requests ADD CONSTRAINT friend_requests_no_self CHECK (requester_id <> addressee_id)',
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('friend_requests');
};
