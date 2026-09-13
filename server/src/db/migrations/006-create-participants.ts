import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('conversation_participants', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    conversation_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'conversations', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    role: {
      type: DataTypes.ENUM('OWNER', 'ADMIN', 'MEMBER'),
      allowNull: false,
      defaultValue: 'MEMBER',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('conversation_participants', ['conversation_id', 'user_id'], {
    unique: true,
    name: 'conversation_participants_pair_unique',
  });
  await queryInterface.addIndex('conversation_participants', ['conversation_id'], {
    name: 'conversation_participants_conversation_idx',
  });
  await queryInterface.addIndex('conversation_participants', ['user_id'], {
    name: 'conversation_participants_user_idx',
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('conversation_participants');
  await queryInterface.sequelize.query(
    'DROP TYPE IF EXISTS "enum_conversation_participants_role";',
  );
};
