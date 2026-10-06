module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("holidays", {
      id: {
        type: "serial",
        primaryKey: true,
      },

      project_id: {
        type: "integer",
        notNull: true,
        references: "projects",
        onDelete: "CASCADE",
      },

      holiday_date: {
        type: "date",
        notNull: true,
      },

      name: {
        type: "varchar(255)",
        notNull: true,
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

    pgm.addConstraint(
      "holidays",
      "holidays_project_id_date_unique",
      {
        unique: ["project_id", "holiday_date"],
      }
    );

    pgm.createIndex("holidays", ["project_id", "holiday_date"]);
  },

  down: (pgm) => {
    pgm.dropTable("holidays");
  },
};
