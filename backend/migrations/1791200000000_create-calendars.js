module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("calendars", {
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

      monday: {
        type: "boolean",
        notNull: true,
        default: true,
      },

      tuesday: {
        type: "boolean",
        notNull: true,
        default: true,
      },

      wednesday: {
        type: "boolean",
        notNull: true,
        default: true,
      },

      thursday: {
        type: "boolean",
        notNull: true,
        default: true,
      },

      friday: {
        type: "boolean",
        notNull: true,
        default: true,
      },

      saturday: {
        type: "boolean",
        notNull: true,
        default: true,
      },

      sunday: {
        type: "boolean",
        notNull: true,
        default: false,
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
      "calendars",
      "calendars_project_id_unique",
      {
        unique: ["project_id"],
      }
    );
  },

  down: (pgm) => {
    pgm.dropTable("calendars");
  },
};
