"use strict";

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    // Mỗi lần chốt = 1 dòng. Dòng cũ giữ lại làm lịch sử.
    pgm.createTable("baselines", {
      id: { type: "serial", primaryKey: true },
      project_id: {
        type: "integer", notNull: true,
        references: "projects", onDelete: "CASCADE",
      },
      created_by: { type: "integer", notNull: true, references: "users" },
      created_at: {
        type: "timestamp", notNull: true,
        default: pgm.func("current_timestamp"),
      },
      is_active: { type: "boolean", notNull: true, default: true },
    });

    // Mỗi dự án chỉ có tối đa 1 bản đang hiệu lực
    pgm.createIndex("baselines", "project_id", {
      name: "baselines_active_project_idx",
      unique: true,
      where: "is_active = true",
    });

    // Bốn mốc của từng task tại thời điểm chốt
    pgm.createTable("baseline_items", {
      id: { type: "serial", primaryKey: true },
      baseline_id: {
        type: "integer", notNull: true,
        references: "baselines", onDelete: "CASCADE",
      },
      task_id: {
        type: "integer", notNull: true,
        references: "tasks", onDelete: "CASCADE",
      },
      early_start: { type: "timestamp" },
      early_finish: { type: "timestamp" },
      late_start: { type: "timestamp" },
      late_finish: { type: "timestamp" },
    });

    pgm.addConstraint("baseline_items", "baseline_items_unique", {
      unique: ["baseline_id", "task_id"],
    });
  },

  down: (pgm) => {
    pgm.dropTable("baseline_items");
    pgm.dropTable("baselines");
  },
};