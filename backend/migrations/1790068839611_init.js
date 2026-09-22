module.exports = {
  shorthands: undefined,

  up: pgm => {
    pgm.createTable('test_table', {
      id: {
        type: 'serial',
        primaryKey: true,
      },
      name: {
        type: 'varchar(255)',
        notNull: true,
      },
      created_at: {
        type: 'timestamp',
        default: pgm.func('current_timestamp'),
      },
    });
  },

  down: pgm => {
    pgm.dropTable('test_table');
  },
};
