# Hướng Dẫn Cấu Hình Và Sử Dụng Hệ Thống Gửi Email (Transaction Email)

Tài liệu này mô tả kiến trúc gửi email an toàn, cách thiết lập môi trường và luồng hoạt động của hệ thống Gửi thư mời dự án trong hệ thống Construction Management Platform (CPM).

## 1. Kiến Trúc Hệ Thống (Outbox Pattern)

Hệ thống **KHÔNG** gửi email trực tiếp khi có request gọi API. Việc gửi email qua giao thức SMTP/API thường tốn từ 500ms đến 2 giây. Nếu gửi trực tiếp, người dùng sẽ phải chờ đợi lâu, và nếu lỗi mạng, tiến trình sẽ bị sụp đổ dẫn đến mất mát dữ liệu hoặc rollback không mong muốn.

Giải pháp sử dụng **Outbox Pattern**:
1. **Lưu hàng đợi**: Khi Admin/PM mời thành viên, Server chỉ lưu thông tin vào bảng `invitations` và tạo một bản ghi trạng thái `pending` vào bảng `email_logs`. Quá trình này nằm chung trong một Database Transaction -> Đảm bảo tính nhất quán (ACID).
2. **Gửi nền (Background)**: Server gọi hàm `processEmailLogs` theo hướng bất đồng bộ (`.catch(err => ...)`). Trình gửi nền sẽ lôi các email đang `pending` ra, kết nối tới dịch vụ (như Brevo, SendGrid) để gửi.
3. **Cập nhật trạng thái**: Khi gửi xong, trạng thái `email_logs` chuyển thành `sent` hoặc `error` (nếu có lỗi).

## 2. Thiết Lập Biến Môi Trường (Environment Variables)

Hệ thống đang sử dụng thư viện `nodemailer`. Để gửi được email thật, bạn cần tạo/cập nhật file `.env` ở thư mục `backend/` với các biến sau:

```env
# ==========================================
# CẤU HÌNH GỬI EMAIL (Nodemailer)
# ==========================================

# SMTP Server (Ví dụ của Brevo/Sendinblue: smtp-relay.brevo.com)
SMTP_HOST=smtp-relay.brevo.com

# Cổng SMTP (thường là 587 cho TLS hoặc 465 cho SSL)
SMTP_PORT=587

# Tài khoản SMTP (Thường là email đăng ký dịch vụ)
SMTP_USER=your_brevo_account@example.com

# Mật khẩu SMTP (Mật khẩu được sinh ra cho SMTP/API Key, KHÔNG PHẢI mật khẩu đăng nhập web)
SMTP_PASS=your_smtp_password

# Email nguồn gửi đi (Phải được verify trên hệ thống email provider)
EMAIL_FROM="Nền Tảng CPM <no-reply@yourdomain.com>"

# Base URL của Frontend (Dùng để gắn link vào trong email)
APP_BASE_URL=http://localhost:5173
```

### Cách Lấy SMTP Pass Từ Brevo (Gợi ý miễn phí)
1. Đăng ký tài khoản miễn phí tại [Brevo (Sendinblue)](https://www.brevo.com/) (Cho phép gửi 300 email/ngày).
2. Vào **Tài khoản (Profile) -> SMTP & API**.
3. Chọn thẻ **SMTP**, bấm **Create a new SMTP key**.
4. Đặt tên (ví dụ: `cpm-project-local`) và Copy mật khẩu sinh ra gắn vào biến `SMTP_PASS`.

## 3. Kiến Trúc Bảo Mật Thư Mời (Security)

Hệ thống tuân thủ nguyên tắc **Phòng thủ theo chiều sâu (Defense in Depth)**:
- **Hashing Token**: Token 32-bytes được tạo ra và gửi thẳng vào Email người dùng. Nhưng trong Database, hệ thống chỉ lưu chuỗi băm bằng thuật toán **SHA-256**. Nếu Database bị rò rỉ (Dump DB), Hacker cũng không thể lấy được token gốc để kích hoạt tài khoản.
- **Che dấu trạng thái (Generic Messages)**: Các API kiểm tra (như `/api/public/invitations/:token`) chỉ báo *"Mã không hợp lệ hoặc đã hết hạn"*, tuyệt đối không chỉ ra lỗi chi tiết để tránh hacker dùng kỹ thuật dò tìm dữ liệu (Enumeration Attack).
- **Rate Limit khắt khe**: Route kiểm tra/chấp nhận lời mời chỉ cho phép gọi **10 lần / 15 phút** cho mỗi IP (chống Bruteforce/DDoS).
- **Bảo vệ chống đua (Race Condition / Double Spend)**: Endpoint chấp nhận thư mời dùng `SELECT ... FOR UPDATE` chặn các request đồng thời, bắt buộc request sau phải chờ request trước hoàn thành, ngăn chặn triệt để lỗ hổng "bấm đúp".
- **Hủy token cũ**: Khi PM chọn "Gửi lại lời mời", token cũ lập tức bị xoá bỏ và tạo ra chuỗi hash mới.

## 4. Kiểm Thử Thật (Live Testing)

Để kiểm thử tính năng này trên máy cục bộ (Local):

1. Điền cấu hình `.env` như phần 2.
2. Khởi động lại Server backend: `npm run dev`
3. Ở phía giao diện Frontend (hoặc Postman), đăng nhập bằng tài khoản có quyền `Quản lý dự án`.
4. Gọi API tạo lời mời hoặc Gửi lại lời mời.
5. Truy cập hộp thư (ví dụ: Gmail) mà bạn vừa mời. 
6. Kiểm tra giao diện HTML, nhấn vào link và quan sát thông tin Server phản hồi (Nếu email chưa có trong hệ thống -> Báo tạo tài khoản mới. Nếu đã có -> Chấp nhận gia nhập dự án).
7. Kiểm tra trạng thái trong Database bằng lệnh:
   ```sql
   SELECT id, email_masked, status, retry_count, error_reason FROM email_logs;
   ```
   Trạng thái sẽ là `sent`.

---
*Tài liệu được khởi tạo và cập nhật cho gói bảo mật E4 & E5.*
