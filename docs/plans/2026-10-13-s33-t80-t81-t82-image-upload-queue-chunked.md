# Kế hoạch thực hiện S-33: T-80, T-81, T-82
## Hàng đợi ảnh tách khỏi nhật ký & API tải ảnh từng phần tiếp tục khi đứt mạng

> **Story:** S-33 (Ảnh dung lượng lớn tải nền theo hàng đợi, tiếp tục sau khi đứt mạng)  
> **Epic:** E-05 (Nhật ký công trường)  
> **Tasks:** T-80, T-81, T-82  
> **Story Points:** 5 + 5 + 5 = 15 SP  
> **Ngày thiết kế:** 13/10/2026  

---

## 1. Mục tiêu & Yêu cầu nghiệp vụ

1. **T-80 (Tạo hàng đợi ảnh tách khỏi nhật ký):**
   - Khi lưu nhật ký, nội dung text được gửi lên server và lưu ngay lập tức (<300ms).
   - Tối đa 30 ảnh được xếp hàng vào hàng đợi nền mà không làm chặn người dùng tạo thêm nhật ký mới hoặc thao tác khác.
   - Giới hạn số ảnh upload đồng thời (Concurrency Limit = 2).

2. **T-81 (API tải ảnh từng phần và tiếp tục tải):**
   - Upload session quản lý từng file ảnh, chia thành các chunk 512KB.
   - Cho phép query offset và tiếp tục tải từ vị trí byte chưa gửi sau khi mất kết nối mạng.
   - Kiểm tra chặt chẽ phân quyền, dung lượng (<=50MB), loại MIME (ảnh hợp lệ) và toàn vẹn file bằng mã băm SHA-256.

3. **T-82 (Giao diện tiến độ và thử lại tải ảnh):**
   - Floating Widget / Drawer hiển thị tiến độ từng ảnh và tiến độ tổng thể.
   - Cơ chế "Thử lại" (Retry) an toàn, tái sử dụng session / offset, không tạo trùng lặp bản ghi đính kèm (`task_attachments`).
   - Giao diện mượt mà, tối ưu cho màn hình cảm ứng di động, không gây giật lag hay treo trình duyệt.
