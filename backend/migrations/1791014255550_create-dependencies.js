"use strict";

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("dependencies", {
      id: {
        type: "serial",
        primaryKey: true,
      },

      // Task trước
      predecessor_id: {
        type: "integer",
        notNull: true,
        references: "tasks(id)",
        onDelete: "CASCADE",
      },

      // Task sau
      successor_id: {
        type: "integer",
        notNull: true,
        references: "tasks(id)",
        onDelete: "CASCADE",
      },

      // FS, SS, FF, SF
      dependency_type: {
        type: "varchar(2)",
        notNull: true,
        default: "FS",
      },

      // Có thể âm, 0 hoặc dương
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

    // Không cho task phụ thuộc chính nó
    pgm.addConstraint("dependencies", "dependencies_not_self", {
      check: '"predecessor_id" <> "successor_id"',
    });

    // Chỉ cho phép 4 loại quan hệ
    pgm.addConstraint("dependencies", "dependencies_type_check", {
      check: `"dependency_type" IN ('FS', 'SS', 'FF', 'SF')`,
    });

    // Không cho phép trùng cùng một cặp task
    pgm.addConstraint("dependencies", "dependencies_unique_edge", {
      unique: ["predecessor_id", "successor_id"],
    });

    // Index để tìm task trước
    pgm.createIndex("dependencies", "predecessor_id");

    // Index để tìm task sau
    pgm.createIndex("dependencies", "successor_id");
  },

  down: (pgm) => {
    pgm.dropTable("dependencies");
  },
};
