# T-08 – Projects và Work Items dạng cây

## Đã thực hiện

- Tạo migration `1790127151916_add-projects-and-work-items.js`:
  - `projects`
  - `work_items`
  - `parent_id` tự tham chiếu để biểu diễn cây
  - cascade delete
  - chặn item tự làm cha chính nó
  - index `parent_id` và `project_id`
- Thêm `backend/queries/workItemTree.js` với `WITH RECURSIVE`:
  - `getWorkItemSubtree()` lấy cây con, gồm cả node gốc mặc định.
  - `getDescendantIds()` lấy ID các hậu duệ.
  - Truy vấn giữ cùng `project_id` để tránh đi xuyên sang dự án khác.
- Thêm test tích hợp `backend/__tests__/workItemTree.test.js`.
- Thêm script `migrate:up` / `migrate:down`.
- Cập nhật `.env.example` với `DATABASE_URL`.
- Cập nhật GitHub Actions để chạy PostgreSQL service cho test.
- Sửa migration login cũ để bổ sung cột vào `users` thay vì tạo lại bảng `users`, tránh lỗi migration trên database sạch.

## Kiểm tra

Đã kiểm tra cú pháp JavaScript bằng `node --check` cho các file T-08 liên quan.

Test tích hợp PostgreSQL cần chạy trong môi trường có PostgreSQL và dependencies đã cài:
```bash
cd backend
npm ci
npm test -- --runInBand
```
