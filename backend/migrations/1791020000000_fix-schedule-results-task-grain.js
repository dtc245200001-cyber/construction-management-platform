"use strict";

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.sql("TRUNCATE TABLE schedule_results");

    pgm.dropConstraint("schedule_results", "schedule_results_work_item_unique", {
      ifExists: true,
    });

    pgm.dropConstraint("schedule_results", "schedule_results_work_item_id_fkey", {
      ifExists: true,
    });

    pgm.renameColumn("schedule_results", "work_item_id", "task_id");

    pgm.addConstraint("schedule_results", "schedule_results_task_id_fkey", {
      foreignKeys: {
        columns: "task_id",
        references: "tasks(id)",
        onDelete: "CASCADE",
      },
    });

    pgm.addConstraint("schedule_results", "schedule_results_task_unique", {
      unique: "task_id",
    });
  },

  down: (pgm) => {
    pgm.sql("TRUNCATE TABLE schedule_results");

    pgm.dropConstraint("schedule_results", "schedule_results_task_unique", {
      ifExists: true,
    });
    pgm.dropConstraint("schedule_results", "schedule_results_task_id_fkey", {
      ifExists: true,
    });

    pgm.renameColumn("schedule_results", "task_id", "work_item_id");

    pgm.addConstraint("schedule_results", "schedule_results_work_item_id_fkey", {
      foreignKeys: {
        columns: "work_item_id",
        references: "work_items(id)",
        onDelete: "CASCADE",
      },
    });

    pgm.addConstraint("schedule_results", "schedule_results_work_item_unique", {
      unique: "work_item_id",
    });
  },
};
