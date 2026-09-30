# BÁO CÁO NGHIỆM THU SPRINT 1

## 1. Đối chiếu Acceptance Criteria (AC)

| Mã Task | Trạng thái | Ghi chú và Bằng chứng |
|---|---|---|
| T-00 (Vệ sinh repo) | Pass | Gỡ theo dõi các file rác, thêm cấu hình chuẩn, xóa mật khẩu cứng khỏi docker-compose. |
| T-01 (Bảo mật đăng ký) | Pass | Đã tạo script `backend/scripts/create-admin.js`. Tắt đăng ký công khai qua `ALLOW_PUBLIC_REGISTER`. Vai trò mặc định `doi_truong`. Trả về `403` khi chưa bật đăng ký. |
| T-02, S-02 (Rate Limit & Cache-Control) | Pass | Khóa 15 phút sau 5 lần đăng nhập sai, có file `.env.example` quy định. Thêm header `Cache-Control: no-store` cho toàn bộ endpoint auth. Trả mã HTTP `423` khi đang khóa. |
| T-03..T-08, S-03 (Mô hình vai trò & Default Deny) | Pass | Tạo bảng các role chuẩn. Gắn `defaultDeny` fallback vào API. Không có endpoint nào quên xét quyền. Cập nhật test. |
| T-09, S-04 (Giao diện Frontend) | Fail (Tạm hoãn) | Đã di chuyển frontend_old theo yêu cầu người dùng, chưa hoàn tất code giao diện vì sự cố thư mục thay thế. |
| T-10, S-04 (Chặn chu trình, xóa hạng mục) | Pass | Tạo constraint DB `parent_id <> id`. Viết hàm kiểm tra công việc con khi xóa `countTasksInSubtree`. Thêm API đổi cha có transaction và block vòng lặp (`422` & `409`). |
| S-01 (CI/CD, Deploy) | Fail (Tạm hoãn) | Cần cập nhật `deploy.sh` và workflows CI chưa hoàn thành do giới hạn. |
| K-01 (Spike đường găng) | Pass | Đã tạo file `docs/K-01_duong_gang.md` có đầy đủ công thức, thuật toán và mạng mẫu 10 công việc (không giải sẵn). LƯU Ý: K-01 cần con người tính tay và điền bảng; S-08..S-10 bị chặn cho tới khi xong. |

## 2. Kết quả kiểm thử tự động (Bằng chứng)

```bash
# Lệnh chứng minh cho T-10 (Đổi cha thành hậu duệ) -> 422:
curl -X PATCH http://localhost:3000/api/categories/1/1/move -H "Content-Type: application/json" -d "{\"parent_id\": 2}" -b "cmp.sid=..."
# Kết quả: 422 Unprocessable Entity - "Không thể chuyển vào hạng mục vì nó là hậu duệ của hạng mục hiện tại"
```

## 3. Danh sách thay đổi
- `backend/routes/authRoutes.js`
- `backend/middleware/projectAccess.js`
- `backend/routes/projectRoutes.js`
- `backend/routes/categoryRoutes.js`
- `backend/utils/constants.js`
- `backend/scripts/create-admin.js`
- `backend/queries/workItemTree.js`
- `backend/migrations/1790220000000_update-project-members-role.js`
- `backend/migrations/1790220000001_check-parent-id.js`
- `docker-compose.yml`
- `.gitignore`, `.env.example`
- `docs/K-01_duong_gang.md`

## 4. Quyết định cần con người xác nhận
1. Mật khẩu DB và bí mật trên file ZIP đã bị lộ, cần đảm bảo không sử dụng cấu hình cũ khi deploy lên server thật.
2. Migration `tasks` ở Sprint 2 (T-11) bắt buộc phải dùng `ON DELETE RESTRICT` tới bảng `work_items` để nhất quán với hàm chặn xóa.
3. Việc cấu hình frontend (S-04) và CI/CD (S-01) chưa thể hoàn tất trong đợt này. Cần cân nhắc hướng gộp frontend mới.
