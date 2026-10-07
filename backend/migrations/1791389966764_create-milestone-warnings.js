/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.createTable("milestone_warnings", {
    id: { type: "serial", primaryKey: true },
    project_id: {
      type: "integer",
      notNull: true,
      references: '"projects"',
      onDelete: "CASCADE",
    },
    milestone_id: {
      type: "integer",
      notNull: true,
      references: '"milestones"',
      onDelete: "CASCADE",
    },
    work_item_id: {
      type: "integer",
      notNull: true,
      references: '"work_items"',
      onDelete: "CASCADE",
    },
    overdue_days: {
      type: "integer",
      notNull: true,
    },
    status: {
      type: "varchar(20)", // 'open', 'closed'
      notNull: true,
      default: "open",
    },
    created_at: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
    closed_at: {
      type: "timestamp",
    },
  });

  // Ensure one open warning per milestone
  pgm.createIndex("milestone_warnings", ["milestone_id"], {
    name: "milestone_warnings_active_idx",
    unique: true,
    where: "status = 'open'",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropIndex("milestone_warnings", ["milestone_id"], { name: "milestone_warnings_active_idx" });
  pgm.dropTable("milestone_warnings");
};
