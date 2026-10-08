"use strict";

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.addColumns("tasks", {
      planned_quantity: {
        type: "numeric(12,2)",
        notNull: false,
        default: null,
      },
      quantity_unit: {
        type: "varchar(30)",
        notNull: false,
        default: null,
      },
    });

    pgm.addConstraint(
      "tasks",
      "tasks_planned_quantity_non_negative",
      {
        check:
          '"planned_quantity" IS NULL OR "planned_quantity" >= 0',
      }
    );

    pgm.createTable("task_quantity_reports", {
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

      task_id: {
        type: "integer",
        notNull: true,
        references: "tasks",
        onDelete: "CASCADE",
      },

      team_id: {
        type: "integer",
        notNull: true,
        references: "teams",
        onDelete: "CASCADE",
      },

      reported_by: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "RESTRICT",
      },

      quantity: {
        type: "numeric(12,2)",
        notNull: true,
      },

      report_date: {
        type: "date",
        notNull: true,
        default: pgm.func("current_date"),
      },

      created_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
    });

    pgm.addConstraint(
      "task_quantity_reports",
      "task_quantity_reports_quantity_non_negative",
      {
        check: '"quantity" >= 0',
      }
    );

    pgm.createIndex(
      "task_quantity_reports",
      ["task_id", "report_date"]
    );

    pgm.createIndex(
      "task_quantity_reports",
      ["team_id", "report_date"]
    );
  },

  down: (pgm) => {
    pgm.dropTable("task_quantity_reports");

    pgm.dropConstraint(
      "tasks",
      "tasks_planned_quantity_non_negative",
      { ifExists: true }
    );

    pgm.dropColumns(
      "tasks",
      ["planned_quantity", "quantity_unit"],
      { ifExists: true }
    );
  },
};