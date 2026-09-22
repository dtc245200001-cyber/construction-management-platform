# Hướng Dẫn Test Rollback Kịch Bản Deploy (Zero-Downtime)

Dành cho team khi muốn tự tay kiểm chứng khả năng an toàn (chống sập server) của `deploy.sh`.

### Kịch Bản: Thử deploy một image cố tình bị lỗi (Crash ngay khi start)

**Bước 1: Chạy hệ thống giả lập với bản chuẩn (Green)**
Đảm bảo bạn đang có một bản cũ chạy bình thường:
```bash
# Khởi động bản đang chạy tốt
docker run -d --name construction_backend_staging -p 3000:3000 ghcr.io/my-org/repo-backend:latest
```
*Truy cập http://localhost:3000/health phải thấy trả về `{"status":"ok"}`.*

**Bước 2: Tạo một image cố ý lỗi (nhưng đóng giả bản mới)**
Tạo nhanh một Dockerfile lỗi ở máy:
```dockerfile
FROM alpine
# Cố tình chạy lệnh sai để container crash ngay lập tức
CMD ["non_existent_command"] 
```
Build thành image:
```bash
docker build -t ghcr.io/my-org/repo-backend:broken-test .
```

**Bước 3: Chạy script deploy với bản lỗi**
```bash
./deploy.sh ghcr.io/my-org/repo-backend:broken-test
```

**Kết Quả Kỳ Vọng (Những gì bạn sẽ thấy):**
1. Script pull image `broken-test`.
2. Script bật container tên `construction_backend_staging_new`.
3. Do lệnh `CMD` bị lỗi, container crash và `docker inspect` health check sẽ báo "unhealthy" (hoặc timeout).
4. Script phát hiện lỗi, in ra màn hình **"HEALTHCHECK FAIL: Bắt đầu Rollback..."**
5. Kịch bản sẽ xóa container lỗi đi và exit (Mã lỗi 1).
6. **Kiểm tra lại hệ thống cũ:** Bạn vào `http://localhost:3000/health` (bản cũ) vẫn thấy chạy mượt mà, không rớt một nhịp nào!
