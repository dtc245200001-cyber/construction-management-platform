# CÁC QUYẾT ĐỊNH KIẾN TRÚC & KỸ THUẬT SPRINT 1

## 1. Cơ sở dữ liệu: `pg` (node-postgres) vs `Prisma`
- **Quyết định:** Sử dụng `pg` thuần kết hợp `node-pg-migrate`. BỎ HOÀN TOÀN Prisma.
- **Lý do:** 
  - Prisma giới hạn trong việc viết các truy vấn đệ quy (Recursive CTE) cho cây phân cấp phức tạp.
  - Sử dụng `pg` cho phép tối ưu SQL thuần, đặc biệt hiệu quả trong việc chặn vòng lặp, kiểm soát Transaction và lấy dữ liệu cây 500+ nút siêu nhanh.

## 2. Xác thực: `Session (Cookie)` vs `JWT`
- **Quyết định:** Dùng Stateful Session (lưu trên Postgres qua `connect-pg-simple`) qua Cookie `httpOnly`.
- **Lý do:** 
  - Đảm bảo tính bảo mật (chống XSS) vì frontend không chạm được vào token.
  - Dễ dàng khóa/force-logout người dùng, đếm số lần sai mật khẩu và chặn (rate limit) ngay ở phía máy chủ. 

## 3. Ràng buộc Xóa (ON DELETE): `CASCADE` vs `RESTRICT`
- **Quyết định:** Sử dụng `RESTRICT`. 
- **Lý do:** 
  - Xóa Cascade (xóa cha bay luôn con) quá nguy hiểm trong ngành quản lý dự án. Việc sử dụng RESTRICT bắt buộc hệ thống trả về lỗi `409` khi xóa một Hạng Mục Công Việc đang có Hạng mục con hoặc có Công việc (Task) bên trong, đảm bảo an toàn dữ liệu 100%.

## 4. Quản lý Container: `Docker` vs `PM2`
- **Quyết định:** Sử dụng hoàn toàn **Docker** & **Docker Compose** cho phát triển và Blue/Green Deployment trên Staging. Bỏ PM2.
- **Lý do:** 
  - Đảm bảo môi trường giống nhau 100% giữa local và staging (Immutable Infrastructure). Dễ rollback, kiểm soát Healthcheck và Zero-downtime deploy.

## 5. Frontend Framework
- **Quyết định:** Chuyển từ TanStack Start (SSR/Fullstack) về cấu trúc **Vite + React (Client-side Rendering thuần)**.
- **Lý do:** 
  - Hệ thống đã có Backend ExpressJS riêng, không cần thêm 1 lớp server SSR nữa để tránh phức tạp hóa. Giao diện Cây hạng mục được code tay thuần React component thay vì dùng thư viện cồng kềnh để tối ưu kết xuất (render) mượt mà cho 500+ nodes.
