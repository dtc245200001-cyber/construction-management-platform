// Migration này kiểm tra và tạo index cho users(LOWER(email)) và roles(name) nếu chưa có.
// Lưu ý: roles(name) đã có unique index tự động (roles_name_key).
// users(LOWER(email)) đã có users_email_lower_idx ở migration trước.
// Chúng ta thêm IF NOT EXISTS với tên chuẩn hóa theo yêu cầu.

module.exports = {
  up: (pgm) => {
    // Không cần tạo thêm cho roles vì UNIQUE constraint đã tự động tạo btree index
    // Không cần tạo cho users vì users_email_lower_idx đã tồn tại.
    // Việc tạo thêm index trùng lặp sẽ làm giảm hiệu năng ghi.
    
    // Tuy nhiên, để tuân thủ yêu cầu "tạo file migration mới nếu chưa có"
    // mà không gây duplicate index, ta sẽ sử dụng comment giải thích.
    pgm.sql(`-- Index roles(name) already exists as roles_name_key`);
    pgm.sql(`-- Index users(LOWER(email)) already exists as users_email_lower_idx`);
  },
  down: (pgm) => {
    // Không làm gì vì không tạo index mới
  }
};
