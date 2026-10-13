# HƯỚNG DẪN DÀNH CHO CLAUDE CODE — CÔNG TRƯỜNG 360

> Claude Code không tự động đọc `AGENTS.md`. File này yêu cầu Claude Code phải đọc và tuân thủ `AGENTS.md` trong mọi phiên làm việc tại `D:\construction-management-platform`.

## Bắt buộc

1. Trước khi thực hiện bất kỳ nhiệm vụ nào, hãy đọc file `AGENTS.md` ở thư mục gốc dự án.
2. Tuân thủ toàn bộ quy tắc bảo vệ dữ liệu production trong `AGENTS.md` (mục 1–6), bao gồm:
   - Không tự ý ghi/sửa/xóa dữ liệu production.
   - Cấm `DELETE/TRUNCATE/DROP/ALTER/UPDATE/INSERT` trên production khi chưa được phép rõ ràng.
   - Cấm seed/restore/reset/migration/test ghi production, đổi `DATABASE_URL`/`DB_*`, đổi Supabase/Render/GitHub Actions/deploy, hoặc để frontend local ghi lên API production khi chưa duyệt.
   - Ưu tiên mock API, dữ liệu giả, kiểm thử không ghi; không coi `NODE_ENV=development`, tên file `test`, lệnh `dev` là bằng chứng an toàn.
   - Không xác định được database đích hoặc phạm vi ảnh hưởng → dừng và hỏi.
   - Trước thao tác nguy hiểm phải nêu lệnh/file/phạm vi/rủi ro/phương án an toàn → chờ xác nhận.
3. `AGENTS.md` là nguồn chung duy nhất. Không tự tạo file Rules riêng cho Antigravity khi chưa xác minh cơ chế hỗ trợ.
4. Không tự ý sửa các hướng dẫn hiện có không liên quan khi bổ sung quy tắc.
