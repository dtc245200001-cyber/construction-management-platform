# Audit & Optimization Report

## Phase 1: Nền tảng Backend & Bảo mật (Đã hoàn thành)
- **Cấu trúc & Kết nối:** Đã gộp `app.js` và `server.js`. Cấu hình kết nối DB ưu tiên `DATABASE_URL` và sử dụng một pool duy nhất thông qua `config/db.js`.
- **Session & Cookie:** Triển khai `connect-pg-simple` thay cho memory store. Thêm bảo vệ bằng `SESSION_SECRET`, cấu hình cookie `httpOnly`, `secure`, `sameSite`, và xoay vòng session (`session.regenerate()`) sau khi đăng nhập.
- **Bảo mật Đăng nhập:** 
  - Nâng cấp băm mật khẩu lên `argon2id`, với cơ chế tự động re-hash khi người dùng cũ đăng nhập.
  - Implement cơ chế atomic lock cho tài khoản đăng nhập sai quá 5 lần.
  - Timing equalization bằng dummy hash khi email không tồn tại.
- **Rate Limit & Headers:** Tích hợp `helmet` để bảo vệ header, giới hạn lượng dữ liệu tải lên (`100kb`), và chặn rate limit cho endpoint `/login`, `/register`.
- **Logging & Error Handling:** Thay thế `console.log` bằng `pino` logger tích hợp `pino-http`. Quản lý lỗi tập trung qua `errorHandler.js` và tự động bắt lỗi cho async route qua `asyncHandler.js`.
- **Validation & Categories:** Validate dữ liệu đầu vào. Tạo endpoint `/tree/all` lấy cây hạng mục trong một truy vấn duy nhất.
- **Project Access:** Tinh gọn middleware, chuẩn hóa các route trả về 403 thành các log structued.
- **Docker & Deployment:** Thiết lập `docker-entrypoint.sh` để migrate rồi khởi động server bằng `exec node`. Cấu hình health checks (`/health` và `/ready`) và graceful shutdown.

*Các phase tiếp theo sẽ được cập nhật sau khi hoàn thành.*
