// Bổ sung các trường phục vụ đăng nhập vào bảng users đã được tạo ở
// migration 1790086000000_add-users-and-roles.js.
//
// Migration cũ từng gọi createTable('users') lần thứ hai, khiến toàn bộ
// migration thất bại trên database mới vì bảng users đã tồn tại. T-08 chạy
// migration trên database sạch trong CI nên cần migration này có thể chạy
// liên tục từ đầu.
module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.addColumns("users", {
      password_hash: {
        type: "varchar(255)",
        notNull: false,
      },
      failed_login_attempts: {
        type: "integer",
        notNull: true,
        default: 0,
      },
      locked_until: {
        type: "timestamp",
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

    // Tương thích với dữ liệu cũ: nếu password đang lưu hash thì chuyển
    // sang password_hash trước khi đặt ràng buộc NOT NULL.
    pgm.sql(`
      UPDATE users
      SET password_hash = password
      WHERE password_hash IS NULL;
    `);

    pgm.alterColumn("users", "password_hash", { notNull: true });
  },

  down: (pgm) => {
    pgm.dropTable("users");
  },
};
