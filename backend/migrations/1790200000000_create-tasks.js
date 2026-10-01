module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("tasks", {
      id: {
        type: "serial",
        primaryKey: true,
      },

      // Task thuộc một hạng mục (work_item)
      work_item_id: {
        type: "integer",
        notNull: true,
        references: "work_items",
        onDelete: "CASCADE",
      },

      name: {
        type: "varchar(255)",
        notNull: true,
      },

      // Thời lượng công việc tính theo ngày
      duration_days: {
        type: "integer",
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

    // duration_days bắt buộc phải là số ngày dương
    pgm.addConstraint(
      "tasks",
      "tasks_duration_days_positive",
      {
        check: '"duration_days" > 0',
      }
    );

    // Tăng tốc truy vấn task theo hạng mục
    pgm.createIndex("tasks", "work_item_id");
  },

  down: (pgm) => {
    pgm.dropTable("tasks");
  },
};