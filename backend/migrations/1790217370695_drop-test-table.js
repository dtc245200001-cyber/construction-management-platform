/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.dropTable('test_table', { ifExists: true });
};

exports.down = (pgm) => {
  pgm.createTable('test_table', {
    id: 'id',
    name: { type: 'varchar(100)', notNull: true }
  }, { ifNotExists: true });
};
