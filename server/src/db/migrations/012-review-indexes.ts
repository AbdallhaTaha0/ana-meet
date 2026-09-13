import type { MigrationFn } from 'umzug';
import { QueryInterface } from 'sequelize';

// Index review (Phase 12 hardening):
// 1. Drop redundant unique constraints. The 001 migration declared
//    `unique: true` on the columns AND added explicit unique indexes, so
//    PostgreSQL maintained two identical unique indexes per column
//    (users_*_key + users_*_unique). One enforcement each is enough.
// 2. Add LIKE-prefix indexes for the actual search patterns
//    (username/email prefix match in user + admin search).
export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.sequelize.query('ALTER TABLE users DROP CONSTRAINT users_username_key;');
  await queryInterface.sequelize.query('ALTER TABLE users DROP CONSTRAINT users_email_key;');
  await queryInterface.sequelize.query('ALTER TABLE users DROP CONSTRAINT users_public_id_key;');
  // Raw SQL for the operator classes: prefix LIKE queries can then scan
  // instead of seq-scanning (plain btree already covers exact matches).
  await queryInterface.sequelize.query(
    'CREATE INDEX users_username_pattern_idx ON users (username varchar_pattern_ops);',
  );
  await queryInterface.sequelize.query(
    'CREATE INDEX users_email_pattern_idx ON users (email varchar_pattern_ops);',
  );
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.sequelize.query('DROP INDEX IF EXISTS users_email_pattern_idx;');
  await queryInterface.sequelize.query('DROP INDEX IF EXISTS users_username_pattern_idx;');
};
