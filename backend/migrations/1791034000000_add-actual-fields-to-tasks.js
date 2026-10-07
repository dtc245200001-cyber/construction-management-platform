"use strict";

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    // Thêm ba cột số liệu thực tế vào bảng tasks tách khỏi kế hoạch
    pgm.addColumns("tasks", {
      actual_start_date: {
        type: "date",
        notNull: false,
        default: null,
      },
      actual_end_date: {
        type: "date",
        notNull: false,
        default: null,
      },
      percent_complete: {
        type: "integer",
        notNull: false,
        default: 0,
      },
    });

    // Ràng buộc kiểm tra: ngày kết thúc thực tế không được sớm hơn ngày bắt đầu thực tế
    pgm.addConstraint("tasks", "tasks_actual_dates_order_check", {
      check: '"actual_end_date" >= "actual_start_date"',
    });

    // Ràng buộc kiểm tra: phần trăm hoàn thành phải nằm trong khoảng 0 - 100
    pgm.addConstraint("tasks", "tasks_percent_complete_range", {
      check: '"percent_complete" >= 0 AND "percent_complete" <= 100',
    });
  },

  down: (pgm) => {
    pgm.dropConstraint("tasks", "tasks_actual_dates_order_check", {
      ifExists: true,
    });
    pgm.dropConstraint("tasks", "tasks_percent_complete_range", {
      ifExists: true,
    });
    pgm.dropColumns(
      "tasks",
      ["actual_start_date", "actual_end_date", "percent_complete"],
      { ifExists: true }
    );
  },
};
