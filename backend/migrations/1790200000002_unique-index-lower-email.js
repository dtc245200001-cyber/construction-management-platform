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
  up: async (pgm) => {
    // Kiem tra email trung lap (khong phan biet hoa thuong) truoc khi tao index
    const { rows } = await pgm.db.query(`
      SELECT LOWER(email) as lower_email, COUNT(*) as count
      FROM users
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
    `);

    if (rows.length > 0) {
      const duplicates = rows.map(r => r.lower_email).join(', ');
      throw new Error(
        `Không thể tạo unique index do có các email trùng lặp (không phân biệt hoa/thường): ${duplicates}. ` +
        `Vui lòng chạy query sau để tìm: SELECT id, email FROM users WHERE LOWER(email) IN (SELECT LOWER(email) FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1); ` +
        `Hãy xóa hoặc sửa các bản ghi trùng lặp trước khi migrate.`
      );
    }

    pgm.sql(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
       ON users (LOWER(email))`
    );
  },

  down: (pgm) => {
    pgm.sql(`DROP INDEX IF EXISTS users_email_lower_idx`);
  },
};
