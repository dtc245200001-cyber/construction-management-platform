# Kiểm thử kịch bản: Triển khai bản mới thất bại (Blue/Green Rollback)

**Tiêu chí chấp nhận (AC):** Khai báo bản mới thất bại giữa chừng → người dùng vẫn tìm thấy bản cũ. Không có downtime hoặc lỗi gián đoạn với luồng truy cập hiện tại.

## Kịch bản thử nghiệm
1. Đảm bảo hệ thống staging đang chạy bình thường bản cũ (`construction_backend_staging` đang healthy). Truy cập `curl -i http://staging_ip/ready` trả về `200 OK`.
2. Tạo một phiên bản lỗi có chủ đích bằng cách push một commit làm hỏng backend (ví dụ: sửa file `.env` sai thông tin kết nối DB hoặc ném exception ngay khi khởi động ứng dụng).
3. Push code lên GitHub. Quá trình CI (Test) có thể bị vượt qua nếu cố ý skip, tới bước Deploy.
4. Trên server staging, `deploy.sh` kéo image lỗi về, chạy dưới tên `construction_backend_staging_new`.
5. Script `deploy.sh` liên tục kiểm tra healthcheck `/ready` của bản mới trong 60 giây.
6. Bản mới gặp sự cố (crash liên tục) $\rightarrow$ lệnh `curl` báo lỗi.
7. Hết 60s, biến `PASSED` trả về `false`. Script xuất log báo `">>> HEALTHCHECK FAIL: Rollback..."`.
8. Hệ thống tự động gọi `docker stop` và `docker rm` dọn dẹp `construction_backend_staging_new`.
9. `construction_backend_staging` (bản cũ) vẫn đang sống. Nginx chưa từng bị trỏ sang bản mới. 

**Kết quả Đầu ra (Console Output) của Deploy Script:**
```bash
[1/5] Pull image mới: ghcr.io/org/repo-backend:broken-sha
[2/5] Lấy thông tin network của container cũ...
Network: deploy_default
[3/5] Chạy Migration DB...
[4/5] Khởi động container MỚI (construction_backend_staging_new)...
Chờ healthcheck của container mới (cần /ready thành công)...
-> Container mới báo LỖI (Connection Refused)!
-> Container mới báo LỖI (Connection Refused)!
...
>>> HEALTHCHECK FAIL: Rollback...
[Logs from crash...]
>>> DEPLOY THẤT BẠI. Đã rollback, hệ thống cũ vẫn chạy.
```

**Kết luận:** Đạt chuẩn Zero-downtime khi lỗi. Người dùng không hề cảm nhận được việc deploy thất bại vì Nginx upstream chưa hề chuyển traffic đi nơi khác.
