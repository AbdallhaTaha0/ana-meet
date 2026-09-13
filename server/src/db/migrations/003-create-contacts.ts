import type { MigrationFn } from 'umzug';
import { DataTypes, QueryInterface } from 'sequelize';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('contacts', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    contact_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('contacts', ['user_id', 'contact_user_id'], {
    unique: true,
    name: 'contacts_pair_unique',
  });
  await queryInterface.addIndex('contacts', ['user_id'], { name: 'contacts_user_id_idx' });
  await queryInterface.addIndex('contacts', ['contact_user_id'], {
    name: 'contacts_contact_user_id_idx',
  });
  // No self-contacts: defense in depth behind the service-level check.
  await queryInterface.sequelize.query(
    'ALTER TABLE contacts ADD CONSTRAINT contacts_no_self CHECK (user_id <> contact_user_id)',
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('contacts');
};
