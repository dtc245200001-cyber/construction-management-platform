// Theo mẫu migration ở T-04/T-06 (pgm.createTable + pgm.createIndex, up/down đối xứng).
//
// - `projects`: bảng dự án, phẳng (không phân cấp).
// - `work_items`: bảng hạng mục, PHÂN CẤP DẠNG CÂY bằng khoá ngoại tự trỏ
//   `parent_id -> work_items.id`. `parent_id = NULL` nghĩa là hạng mục gốc
//   (nằm thẳng dưới dự án, không có cha).
//
// Mọi truy vấn dựng cây (lấy cây con, kiểm tra hậu duệ ở T-10, ...) đều lọc
// theo `parent_id`, nên bảng có index riêng trên cột này (yêu cầu của T-08).

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("projects", {
      id: {
        type: "serial",
        primaryKey: true,
      },
      name: {
        type: "varchar(255)",
        notNull: true,
      },
      location: {
        type: "varchar(255)",
        notNull: false,
      },
      start_date: {
        type: "date",
        notNull: false,
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

    pgm.createTable("work_items", {
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
      // Khoá ngoại tự trỏ về chính bảng work_items -> tạo cây.
      // NULL = hạng mục gốc của dự án.
      parent_id: {
        type: "integer",
        notNull: false,
        references: "work_items",
        onDelete: "CASCADE",
      },
      name: {
        type: "varchar(255)",
        notNull: true,
      },
      code: {
        type: "varchar(50)",
        notNull: false,
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

    // Chặn trường hợp tầm thường nhất của vòng lặp: một hạng mục tự làm cha
    // của chính nó. Vòng lặp sâu hơn (con trỏ về ông/bà...) do tầng ứng dụng
    // kiểm bằng truy vấn đệ quy ở T-10, CHECK constraint không kiểm được.
    pgm.addConstraint("work_items", "work_items_parent_not_self", {
      check: '"parent_id" IS NULL OR "parent_id" <> "id"',
    });

    // Mọi truy vấn cây (lấy cây con, tìm hậu duệ...) đều lọc theo parent_id.
    pgm.createIndex("work_items", "parent_id");

    // Mọi truy vấn danh sách hạng mục đều lọc theo dự án trước tiên.
    pgm.createIndex("work_items", "project_id");
  },

  down: (pgm) => {
    // work_items tham chiếu tới projects nên phải xoá trước.
    pgm.dropTable("work_items");
    pgm.dropTable("projects");
  },
};
