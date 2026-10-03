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

## Phase 2: Indexing & Query Tuning
- **Indexes:** Thêm composite index `(project_id, parent_id, id)` cho bảng `work_items` để tối ưu hóa việc lấy cây hạng mục.
- **Normalization:** Chuẩn hóa cột `role` trong bảng `project_members` thành chữ HOA hoàn toàn (`UPPERCASE`) và thêm `CHECK` Constraint (`role IN ('OWNER', 'MANAGER', 'MEMBER')`).
- **Clean Code:** Xóa bỏ bảng `test_table` không cần thiết. Loại bỏ hoàn toàn các truy vấn `SELECT *` trong `authRoutes.js`, `projectRoutes.js` và `workItemTree.js`, thay bằng việc chỉ ra tường minh các cột cần lấy (ví dụ `SELECT id, name, role`).

## Phase 3: Project API & RBAC
- **GET `/api/projects`:** Thêm API trả về danh sách các dự án mà người dùng hiện tại là thành viên (JOIN bảng `projects` và `project_members`).
- **POST `/api/projects`:** Cài đặt endpoint tạo dự án mới, được bọc trong Transaction. Người tạo dự án tự động được gán quyền `OWNER` trong `project_members`.
- **Dọn dẹp code:** Xóa bỏ file `contractRoutes.js` không còn sử dụng.
- **Tích hợp RBAC:** Phân quyền trên mức dự án (`requireProjectRoles`) được tái cấu trúc và kiểm thử hoàn chỉnh thay cho endpoint dummy.

## Phase 4: Frontend Refactoring (React Router)
- **Tái cấu trúc thư mục:** Loại bỏ Component lỗi thời (`Header.jsx`), tổ chức lại bằng cách tách thành các Page (`LoginPage`, `ProjectsPage`) và Layout (`AuthLayout`, `MainLayout`).
- **Xử lý Đăng xuất (S-17):** Thêm Component `LogoutButton` gọi API xóa session backend, xóa state user frontend và chuyển hướng về `/login`.
- **Axios & Cookies (S-18):** Tích hợp thư viện Axios, cấu hình `baseURL` và `withCredentials: true` để Frontend tự động đính kèm Cookie Session `cmp.sid` HttpOnly với mọi request gửi sang Backend.

## Phase 5 & 6: DB Performance, CI/CD & Final
- **Performance Tweak:** Xác nhận việc cấu hình Pool Connection (max 10, idleTimeout 30s) và index (`idx_users_lower_email`, `idx_roles_name`) đã được thực thi từ các migration trước.
- **CI/CD:** Kích hoạt job kiểm tra frontend (chạy `npm run lint` và `npm run build`), đồng thời cấu hình job backend chạy toàn bộ test tích hợp bằng lệnh `--runInBand` nhằm ngăn chặn các bài test đụng độ trên một instance Postgres dùng chung.
