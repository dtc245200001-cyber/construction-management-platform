"use strict";

module.exports = {
  up: (pgm) => {
    // 1. Drop old "write-once-when-NULL" columns
    pgm.dropColumns("projects", ["planned_finish_date"], { ifExists: true });
    pgm.dropColumns("tasks", ["was_critical_baseline"], { ifExists: true });

    // 2. Add current_baseline_version to projects
    pgm.addColumns("projects", {
      current_baseline_version: { type: "integer", notNull: false, default: null },
    });

    // 3. Drop existing baseline tables to recreate them cleanly
    pgm.dropTable("baseline_items", { ifExists: true });
    pgm.dropTable("baselines", { ifExists: true });

    // 4. Create baselines table
    pgm.createTable("baselines", {
      id: { type: "serial", primaryKey: true },
      project_id: { type: "integer", notNull: true, references: "projects", onDelete: "CASCADE" },
      version: { type: "integer", notNull: true },
      frozen_by: { type: "integer", notNull: true, references: "users" },
      frozen_at: { type: "timestamp", notNull: true, default: pgm.func("current_timestamp") }
    });

    // project_id + version must be unique
    pgm.addConstraint("baselines", "baselines_project_version_unique", {
      unique: ["project_id", "version"],
    });

    // 5. Create baseline_items table
    pgm.createTable("baseline_items", {
      id: { type: "serial", primaryKey: true },
      baseline_id: { type: "integer", notNull: true, references: "baselines", onDelete: "CASCADE" },
      task_id: { type: "integer", notNull: true, references: "tasks", onDelete: "CASCADE" },
      planned_early_start: { type: "timestamp" },
      planned_early_finish: { type: "timestamp" },
      planned_late_start: { type: "timestamp" },
      planned_late_finish: { type: "timestamp" },
      was_critical: { type: "boolean", notNull: true, default: false }
    });

    pgm.addConstraint("baseline_items", "baseline_items_unique", {
      unique: ["baseline_id", "task_id"],
    });
  },

  down: (pgm) => {
    pgm.dropTable("baseline_items");
    pgm.dropTable("baselines");
    
    pgm.dropColumns("projects", ["current_baseline_version"]);

    pgm.addColumns("projects", {
      planned_finish_date: { type: "date", notNull: false, default: null },
    });
    pgm.addColumns("tasks", {
      was_critical_baseline: { type: "boolean", notNull: false, default: null },
    });
  },
};
