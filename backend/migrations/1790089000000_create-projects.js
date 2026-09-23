// T-08: tạo bảng dự án trước các migration khác (ví dụ project_members)
// vì project_members.project_id tham chiếu tới projects.id.
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
  },

  down: (pgm) => {
    pgm.dropTable("projects");
  },
};
