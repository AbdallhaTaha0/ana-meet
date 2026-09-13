import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('blocks', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    blocker_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    blocked_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('blocks', ['blocker_id', 'blocked_user_id'], {
    unique: true,
    name: 'blocks_pair_unique',
  });
  await queryInterface.addIndex('blocks', ['blocker_id'], { name: 'blocks_blocker_id_idx' });
  await queryInterface.addIndex('blocks', ['blocked_user_id'], {
    name: 'blocks_blocked_user_id_idx',
  });
  // No self-blocks: defense in depth behind the service-level check.
  await queryInterface.sequelize.query(
    'ALTER TABLE blocks ADD CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_user_id)',
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('blocks');
};
