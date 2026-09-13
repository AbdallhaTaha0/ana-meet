import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('media_assets', {
    id: { type: DataTypes.STRING(160), primaryKey: true },
    owner_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    mime_type: { type: DataTypes.STRING(128), allowNull: false },
    kind: { type: DataTypes.ENUM('IMAGE', 'VIDEO', 'FILE'), allowNull: false },
    size_bytes: { type: DataTypes.BIGINT, allowNull: false },
    file_name: { type: DataTypes.STRING(255), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('media_assets', ['owner_id'], {
    name: 'media_assets_owner_idx',
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('media_assets');
  await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_media_assets_kind";');
};
