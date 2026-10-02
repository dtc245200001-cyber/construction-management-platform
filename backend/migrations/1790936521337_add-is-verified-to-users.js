/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.addColumn('users', {
    is_verified: { type: 'boolean', notNull: true, default: false },
  });
};

exports.down = pgm => {
  pgm.dropColumn('users', 'is_verified');
};
