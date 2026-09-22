module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("users", {
      id: {
        type: "serial",
        primaryKey: true,
      },

      email: {
        type: "varchar(255)",
        notNull: true,
        unique: true,
      },

      password_hash: {
        type: "varchar(255)",
        notNull: true,
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

      created_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },

      updated_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
    });
  },

  down: (pgm) => {
    pgm.dropTable("users");
  },
};