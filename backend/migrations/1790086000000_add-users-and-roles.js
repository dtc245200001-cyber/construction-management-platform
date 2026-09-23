module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("roles", {
      id: {
        type: "serial",
        primaryKey: true,
      },
      name: {
        type: "varchar(255)",
        notNull: true,
        unique: true,
      },
      created_at: {
        type: "timestamp",
        default: pgm.func("current_timestamp"),
      },
    });
    pgm.sql(`
      INSERT INTO roles (name)
      VALUES
        ('chu_dau_tu'),
        ('ban_quan_ly'),
        ('ky_su_giam_sat'),
        ('chi_huy_truong'),
        ('doi_truong'),
        ('ke_toan');
    `);

    pgm.createTable("users", {
      id: {
        type: "serial",
        primaryKey: true,
      },
      name: {
        type: "varchar(255)",
        notNull: true,
      },
      email: {
        type: "varchar(255)",
        notNull: true,
        unique: true,
      },
      password: {
        type: "varchar(255)",
        notNull: true,
      },
      role_id: {
        type: "integer",
        notNull: true,
        references: "roles",
        onDelete: "RESTRICT",
      },
      created_at: {
        type: "timestamp",
        default: pgm.func("current_timestamp"),
      },
    });
  },

  down: (pgm) => {
    pgm.dropTable("users");
    pgm.dropTable("roles");
  },
};
