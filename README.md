# Construction Management Platform

## Triển khai Staging (Staging Deployment)

Quy trình deploy lên môi trường staging diễn ra hoàn toàn tự động thông qua GitHub Actions khi có code mới được merge vào nhánh `main`.

### Sơ đồ luồng (Workflow)
1. **Merge `main`**: Developer merge PR vào nhánh chính.
2. **CI Build & Test**: Job `backend` chạy các bước kiểm tra code (lint, test).
3. **Build & Push Image**: Nếu test pass, job `deploy` sẽ build Docker image từ thư mục `backend/` và đẩy lên GHCR (GitHub Container Registry).
4. **SSH Deploy**: GitHub Actions dùng SSH truy cập vào server Staging và kích hoạt script `deploy/deploy.sh`.
5. **Healthcheck & Rollback (Blue/Green)**: Container mới được khởi động song song. Đợi healthcheck (`GET /health`). Nếu lỗi (crash, timeout), kịch bản tự động xóa container mới, hệ thống cũ vẫn giữ nguyên, CI trả về thất bại. Nếu thành công, xóa container cũ và đổi tên container mới, CI thành công.

### Cấu hình Secrets (Yêu cầu trước khi chạy CI/CD)
Admin repository cần cấu hình 3 Secrets sau tại **Settings > Secrets and variables > Actions**:
- `STAGING_HOST`: Địa chỉ IP/Domain của máy chủ Staging.
- `STAGING_SSH_USER`: Tên user truy cập SSH (vd: `ubuntu`).
- `STAGING_SSH_KEY`: Nội dung Private SSH Key để đăng nhập vào server.

### Cách xem Log Deploy
- Truy cập vào tab **Actions** trên GitHub.
- Mở lần chạy (workflow run) gần nhất.
- Bấm vào job **Deploy to Staging** > mở xem chi tiết bước **Deploy to Staging via SSH**. Bạn sẽ thấy các log cụ thể của từng bước được sinh ra từ script `deploy.sh` (pull image, start container, healthcheck,...).

### Rollback Thủ Công
Trong trường hợp kịch bản tự động (Blue/Green) gặp lỗi không mong muốn hoặc cần lùi lại phiên bản trước đó:
1. Đăng nhập SSH vào server staging.
2. Chuyển tới thư mục dự án và chạy thủ công:
   ```bash
   docker stop construction_backend_staging || true
   docker rm construction_backend_staging || true
   
   # Chạy lại phiên bản cũ (thay <TAG-CU> bằng mã SHA của commit lúc trước)
   docker run -d \
     --name construction_backend_staging \
     --network deploy_default \
     --env-file .env.staging \
     -p 3000:3000 \
     ghcr.io/<org>/<repo>-backend:<TAG-CU>
   ```
