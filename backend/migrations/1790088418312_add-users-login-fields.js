module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.addColumns("users", {
      password_hash: {
        type: "varchar(255)",
        notNull: false,
      },
      failed_login_attempts: {
        type: "integer",
        notNull: true,
        default: 0,
      },
      locked_until: {
        type: "timestamp",
        notNull: false,
      },
      updated_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
    });

    pgm.sql(`
      UPDATE users
      SET password_hash = password
      WHERE password_hash IS NULL;
    `);

    pgm.alterColumn("users", "password_hash", { notNull: true });
  },

  down: (pgm) => {
    pgm.dropColumns("users", [
      "password_hash",
      "failed_login_attempts",
      "locked_until",
      "updated_at",
    ]);
  },
};
