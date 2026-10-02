module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("schedule_results", {
      id: {
        type: "serial",
        primaryKey: true,
      },
      work_item_id: {
        type: "integer",
        notNull: true,
        references: "work_items",
        onDelete: "CASCADE",
      },
      early_start: {
        type: "timestamp",
        notNull: false,
      },
      early_finish: {
        type: "timestamp",
        notNull: false,
      },
      late_start: {
        type: "timestamp",
        notNull: false,
      },
      late_finish: {
        type: "timestamp",
        notNull: false,
      },
      total_float: {
        type: "integer",
        notNull: false,
      },
      is_critical: {
        type: "boolean",
        notNull: false,
        default: false,
      },
      calculated_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
    });

    pgm.addConstraint("schedule_results", "schedule_results_work_item_unique", {
      unique: "work_item_id",
    });


  },

  down: (pgm) => {
    pgm.dropTable("schedule_results");
  },
};
