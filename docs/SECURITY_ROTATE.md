# Hướng dẫn Khắc phục Lộ lọt Bí mật (Security Rotate)

Do trong quá trình phát triển (hoặc chia sẻ file ZIP), một số thông tin nhạy cảm như file `.env`, mật khẩu `postgres123`, `password123` và các key nhạy cảm khác đã vô tình bị lưu lại trong lịch sử Git. Dưới đây là quy trình xử lý khẩn cấp để dọn dẹp và bảo mật hệ thống.

## 1. Dọn dẹp Lịch sử Git (Local & Remote)

Không được dùng `git rm` thông thường vì bí mật vẫn còn trong commit cũ. Chúng ta sử dụng `git filter-repo` để xóa hoàn toàn:

```bash
# 1. Cài đặt git filter-repo (yêu cầu Python)
pip install git-filter-repo

# 2. Xóa hẳn file .env khỏi toàn bộ lịch sử
git filter-repo --invert-paths --path .env

# Hoặc xóa các chuỗi mật khẩu cụ thể (tạo file passwords.txt chứa mật khẩu cần xóa)
# git filter-repo --replace-text passwords.txt

# 3. Ép đẩy (Force push) lên kho lưu trữ (lưu ý sẽ ghi đè lịch sử của tất cả mọi người)
git push origin --force --all
git push origin --force --tags
```

*(Lưu ý: Sau khi force push, các thành viên khác phải clone lại repo thay vì `git pull` để tránh xung đột lịch sử).*

## 2. Thay đổi Bí mật trên Môi trường Staging/Production (Rotate Secrets)

Vì mật khẩu cũ đã bị lộ, kẻ gian có thể đã sao chép. Bạn bắt buộc phải đổi mật khẩu mới.

1. **Đổi mật khẩu Database (PostgreSQL):**
   - Truy cập vào server staging.
   - Sửa file `.env.staging`, cập nhật `POSTGRES_PASSWORD` và `DATABASE_URL` sang mật khẩu mới an toàn (vd: sinh random 32 ký tự).
   - Truy cập vào Database cũ và đổi mật khẩu cho user:
     ```sql
     ALTER USER postgres WITH PASSWORD 'mat_khau_moi_random';
     ```
   - Khởi động lại container Database và Backend:
     ```bash
     docker compose -f docker-compose.yml up -d
     ```

2. **Đổi SESSION_SECRET:**
   - Đổi giá trị `SESSION_SECRET` trong `.env.staging` bằng một chuỗi ngẫu nhiên mới:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - **Lưu ý:** Thao tác này sẽ làm đăng xuất (đăng xuất) toàn bộ người dùng đang hoạt động hiện tại.

3. **Cập nhật GitHub Secrets:**
   - Vào **Settings > Secrets and variables > Actions** của Repository.
   - Xóa bỏ hoặc cập nhật bất kỳ secret nào đã từng bị rò rỉ (chẳng hạn như `STAGING_SSH_KEY`). Nên tạo cặp SSH key mới và đưa public key vào `~/.ssh/authorized_keys` của server staging.

## 3. Bật tính năng Quét Bí mật (Secret Scanning)

Để phòng tránh các lỗi tương tự trong tương lai, cần bật tự động quét:
1. Vào **Settings > Code security and analysis** của Repository trên GitHub.
2. Bật **Secret scanning**.
3. (Optional) Bật **Push protection** để GitHub chặn ngay lập tức các lệnh `git push` nếu phát hiện có chứa bí mật.

---
**CẢNH BÁO:** Bạn chỉ nên đọc kỹ tài liệu này. Hãy báo cho Team Lead trước khi thực thi `git filter-repo` trên Production.
