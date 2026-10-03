# Pull Request: Hoàn thiện Sprint 1 - Nền Tảng Điều Hành Công Việc

## 🎯 Mục tiêu
Đưa hệ thống đạt trạng thái "Hoàn thành" (Done) của Sprint 1, chuẩn bị sẵn sàng cho Sprint 2. Tập trung vào việc thay thế Prisma bằng PG thuần để kiểm soát truy vấn phức tạp, bổ sung an toàn (RBAC, chống lỗi vòng lặp) và tái cấu trúc giao diện sang React Client-Side an toàn. Bổ sung hoàn chỉnh hệ thống triển khai CI/CD Blue/Green an toàn (Zero-Downtime).

## 📝 Danh sách thay đổi
- **Kiến trúc DB:** Gỡ bỏ Prisma, sử dụng `pg` + `node-pg-migrate`. Cập nhật `ON DELETE RESTRICT` cho hạng mục.
- **Xác thực (Auth):** Bổ sung Session Logout, khóa tài khoản (Rate Limit 5 lần/15 phút), báo lỗi chung `401`/`423`, giấu tên đăng nhập, cấp quyền Default Deny toàn hệ thống (báo `403`).
- **Giao diện (Frontend):** Bỏ cách dựng cây Vanilla JS `innerHTML`, chuyển sang React rendering mượt mà cho 500+ Hạng mục công việc. Bắt và hiển thị lỗi `422`/`409` từ máy chủ.
- **Cơ sở hạ tầng & CI/CD:** 
  - File `docker-compose.yml` local hoàn chỉnh không mã cứng mật khẩu.
  - CI Pipeline ép buộc test (coverage 100% cho tree builder), lint, quét phụ thuộc/mật khẩu bị rò rỉ (`gitleaks`). 
  - Kịch bản Deploy Blue/Green sử dụng Nginx.

## 🧪 Cách kiểm tra (Testing Guide)
1. **Khởi động Local:** Chạy `docker compose up -d` và `npm run migrate:up`.
2. **Kiểm tra Frontend:** Mở `http://localhost:5173`. Thử đổi cha hạng mục về chính nó $\rightarrow$ Kỳ vọng lỗi `422`.
3. **Kiểm tra Rate Limit:** Thử đăng nhập sai 6 lần liên tiếp $\rightarrow$ Từ lần 6 hệ thống trả `423` (Locked 15 min).
4. **Unit / Integration Tests:** Chạy `npm run test` ở Backend. Kết quả phủ độ cao và báo passed (Kèm cảnh báo open handles do thư viện postgres session).

## ⚠️ Rủi ro & Lưu ý
- **Triển khai (Staging):** Hệ thống thực tế chưa được thiết lập URL nên **chưa có chứng minh 100% chạy trên dàn**. Do đó có rủi ro về môi trường.
- **K-01:** Spike đường găng đang dừng ở mức lý thuyết $\rightarrow$ cần con người review và tính toán nháp trước khi bước vào Sprint 2 (S-08 -> S-10).
- **Mobile UI:** Giao diện chưa được kiểm tra độ thân thiện/mượt mà trên màn hình nhỏ.

## ✅ Danh sách kiểm tra DoD (Definition of Done)
- [x] Code đã được Push lên nhánh. Cần người thứ 2 đánh giá (Không Merge tự động).
- [x] Unit test cho logic mới đầy đủ, độ phủ (coverage) không giảm.
- [x] CI Xanh: Biên dịch, Syntax, Typecheck (TSC), Test, Scan Secrets.
- [x] Không còn file chứa Secrets cứng (`.env`), dọn sạch mã rác Prisma.
- [x] Cập nhật toàn bộ `README.md` & `docs/DECISIONS.md`.
- [ ] AC Pass trên môi trường Staging. (CHƯA ĐẠT - Chờ môi trường).
- [ ] Giao diện được kiểm tra trên di động thật. (CHƯA THỬ).
