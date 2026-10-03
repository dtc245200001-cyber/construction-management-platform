# Construction Management Platform

## 1. Chạy ở máy cá nhân (Local Development)

Dự án này sử dụng Docker để giả lập môi trường Database và có thể dễ dàng chạy ứng dụng trên máy cá nhân mà không cần cài đặt nhiều phụ thuộc phức tạp (ngoại trừ Docker và Node.js). 

Hãy thực hiện lần lượt các bước sau:

1. **Cài đặt Docker & Node.js:** Đảm bảo máy tính của bạn đã cài đặt [Docker Desktop](https://www.docker.com/products/docker-desktop) và [Node.js](https://nodejs.org/).
2. **Cấu hình Biến môi trường:** 
   ```bash
   cp .env.example .env
   ```
   *(Bạn có thể giữ nguyên các thông số trong `.env` để phát triển tại local).*
3. **Khởi động Database:** 
   ```bash
   docker compose up -d
   ```
   *(Lệnh này sẽ khởi động PostgreSQL và PgAdmin ở chế độ background).*
4. **Cài đặt thư viện Backend:** 
   ```bash
   cd backend
   npm ci
   ```
5. **Chạy Migration Database:**
   ```bash
   npm run migrate:up
   ```
6. **Khởi động Backend:** 
   ```bash
   npm run dev
   ```
7. **Khởi động Frontend:** Mở một terminal mới, chuyển vào thư mục `frontend` và chạy:
   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

## 2. Biến môi trường

Toàn bộ các cấu hình được quản lý qua biến môi trường. Vui lòng xem file `.env.example` để biết chi tiết. Một số biến quan trọng:
- `DATABASE_URL`: Chuỗi kết nối Database.
- `SESSION_SECRET`: Bí mật để mã hóa session (BẮT BUỘC trên môi trường Production/Staging).
- `CORS_ORIGINS`: Danh sách các domain Frontend được phép gọi API.

## 3. Khôi phục & Xử lý sự cố (Troubleshooting)

- **Lỗi Migration:** Nếu bạn chạy lỗi migration hoặc muốn lùi db, có thể dùng `npm run migrate:down`.
- **Dọn dẹp hoàn toàn Docker:** Để làm mới cơ sở dữ liệu nếu có lỗi dữ liệu nặng nề (mất toàn bộ dữ liệu ở máy local):
  ```bash
  docker compose down -v
  docker compose up -d
  ```
- **Port Conflict (Cổng đã được sử dụng):** Nếu cổng 5432, 3000 hoặc 5173 đã bị chiếm dụng, hãy tắt các dịch vụ đang chạy cổng này hoặc đổi port trong file `.env` và `docker-compose.yml`.

## 4. Triển khai (Deployment)

Hệ thống sử dụng cơ chế Deploy Blue/Green với Docker trên môi trường Staging.
Quy trình được tự động hóa qua GitHub Actions.

### Cấu hình Secrets cho GitHub Actions
Bạn cần thiết lập 4 Secrets sau trên GitHub (Settings > Secrets and variables > Actions):
1. `STAGING_HOST`: Địa chỉ IP/Domain của máy chủ Staging.
2. `STAGING_USER`: Tên user truy cập SSH (thay cho STAGING_SSH_USER cũ).
3. `STAGING_SSH_KEY`: Private SSH Key để đăng nhập.
4. `GHCR_PAT` (hoặc bí mật thứ 4 tùy chọn nếu dùng repo private để pull image).

### Luồng Deploy tự động (Blue/Green)
1. Kéo Image mới về server.
2. Chạy container mới (phiên bản Green) song song với container cũ (Blue).
3. Container mới thực hiện **Migration DB** trực tiếp trong lúc khởi động (hoặc qua bước migrate độc lập).
4. Kiểm tra sức khỏe (Healthcheck) qua endpoint `/api/ready`.
5. Nếu container mới KHỎE và migration thành công: Chuyển lưu lượng Nginx sang container mới, sau đó tắt container cũ.
6. Nếu container mới LỖI: Hủy container mới, hệ thống vẫn dùng container cũ không bị gián đoạn.

## 5. Rollback thủ công

Trong trường hợp luồng deploy bị kẹt hoặc cần rollback về bản cũ:
1. SSH vào server staging.
2. Xác định tên container cũ đang chạy hoặc chạy lệnh lùi phiên bản image:
   ```bash
   docker stop construction_backend_staging_new || true
   docker rm construction_backend_staging_new || true
   # Đảm bảo container chính chạy lại:
   docker start construction_backend_staging
   ```

## 6. API quan hệ phụ thuộc giữa các công việc

a) Endpoint: `POST /api/projects/:projectId/dependencies`. Cần đăng nhập, chỉ vai trò ban_quan_ly của dự án đó.
b) Body JSON: `predecessor_id` (số nguyên dương, id bảng tasks), `successor_id` (như trên), `dependency_type` (FS, SS, FF hoặc SF, mặc định FS), `lead_lag_days` (số nguyên, cho phép âm, mặc định 0). Nêu rõ predecessor_id và successor_id là id của bảng tasks, không phải work_items.
c) Bảng mã phản hồi:
   - 201: tạo thành công, trả về dependency vừa tạo.
   - 400: dữ liệu sai (id không hợp lệ, loại quan hệ sai, lead_lag_days không phải số nguyên) hoặc công việc không thuộc dự án này.
   - 403: không thuộc dự án hoặc không đủ vai trò.
   - 409: cặp công việc này đã có quan hệ.
   - 422: quan hệ sẽ tạo vòng phụ thuộc (kể cả tự trỏ). Quan hệ KHÔNG được lưu.
d) Ví dụ phản hồi 422:
```json
{
  "code": "DEPENDENCY_CYCLE",
  "message": "Không thể tạo quan hệ vì sẽ tạo vòng phụ thuộc: A → B → A",
  "cycleIds": [1, 2],
  "cycleNames": ["A", "B"],
  "cyclePath": "A → B → A"
}
```
e) Giải thích: việc kiểm tra chạy trong cùng giao dịch, trước khi INSERT, có khoá theo dự án để hai yêu cầu đồng thời không tạo vòng; dùng detectCycle ở backend/algorithms/cpm.js (T-17).
f) Ví dụ curl cho trường hợp tạo vòng:
```bash
curl -X POST http://localhost:3000/api/projects/PID/dependencies \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your_cookie" \
  -d '{
    "predecessor_id": B_ID,
    "successor_id": A_ID,
    "dependency_type": "FS",
    "lead_lag_days": 0
  }'
```
