// Migration: Thêm unique index trên lower(email) trong bảng users.
//
// Mục đích:
//   1. Đảm bảo không có hai user có email trùng nhau kể cả khi khác hoa/thường
//      (email đã được normalize lower() khi lưu, nhưng cần index để enforce ở DB level).
//   2. Tăng tốc lookup WHERE LOWER(email) = $1 (thay vì quét toàn bảng).
//
// Dùng CONCURRENTLY để không khóa bảng khi tạo index trên DB có dữ liệu.
// node-pg-migrate không hỗ trợ CONCURRENTLY qua pgm.createIndex → dùng pgm.sql.

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.sql(
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_email_lower_idx
       ON users (LOWER(email))`
    );
  },

  down: (pgm) => {
    pgm.sql(`DROP INDEX IF EXISTS users_email_lower_idx`);
  },
};
