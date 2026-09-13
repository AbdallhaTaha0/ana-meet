import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('stories', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    owner_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    type: { type: DataTypes.ENUM('TEXT', 'IMAGE', 'VIDEO'), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: true },
    media_url: { type: DataTypes.STRING(2048), allowNull: true },
    mime_type: { type: DataTypes.STRING(128), allowNull: true },
    size_bytes: { type: DataTypes.BIGINT, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('stories', ['owner_id'], { name: 'stories_owner_idx' });
  await queryInterface.addIndex('stories', ['expires_at'], { name: 'stories_expires_at_idx' });
  await queryInterface.addIndex('stories', ['owner_id', 'expires_at'], {
    name: 'stories_owner_expires_idx',
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('stories');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_stories_type";');
};
