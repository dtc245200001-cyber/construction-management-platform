"use strict";

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("dependencies", {
      id: {
        type: "serial",
        primaryKey: true,
      },
      predecessor_id: {
        type: "integer",
        notNull: true,
        references: "work_items(id)",
        onDelete: "CASCADE",
      },
      successor_id: {
        type: "integer",
        notNull: true,
        references: "work_items(id)",
        onDelete: "CASCADE",
      },
      dependency_type: {
        type: "varchar(2)",
        notNull: true,
        default: "FS",
      },
      lead_lag_days: {
        type: "integer",
        notNull: true,
        default: 0,
      },
      created_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
    });

    pgm.addConstraint("dependencies", "dependencies_not_self", {
      check: '"predecessor_id" <> "successor_id"',
    });

    pgm.addConstraint("dependencies", "dependencies_type_check", {
      check: `"dependency_type" IN ('FS', 'SS', 'FF', 'SF')`,
    });

    pgm.addConstraint("dependencies", "dependencies_unique_edge", {
      unique: ["predecessor_id", "successor_id"],
    });

    pgm.createIndex("dependencies", "predecessor_id");
    pgm.createIndex("dependencies", "successor_id");
  },

  down: (pgm) => {
    pgm.dropTable("dependencies");
  },
};
