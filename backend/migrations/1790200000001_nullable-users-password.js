// Migration: Đổi cột users.password thành NULL-able (expand step).
//
// Lý do: authRoutes.js mới không ghi cột password cũ nữa (dùng password_hash + argon2id).
// Theo nguyên tắc expand/contract (tương thích ngược với blue/green deploy):
//   - Bước này (expand): chỉ bỏ ràng buộc NOT NULL — không DROP cột.
//   - Bước contract (DROP COLUMN password): thực hiện ở release tiếp theo khi
//     chắc chắn không còn container nào chạy code cũ vẫn ghi vào cột này.

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.alterColumn("users", "password", { notNull: false });
  },

  down: (pgm) => {
    // Không thể rollback an toàn nếu đã có NULL trong cột — chỉ đặt lại ràng buộc
    pgm.alterColumn("users", "password", { notNull: true });
  },
};
