# DECISIONS.md -- Quyết định và quy tắc phân quyền

**Cập nhật lần cuối:** 2026-10-21  
**Tài liệu chuẩn:** `Ma_tran_phan_quyen_S01_S51.xlsx`, Backlog AC/NFR, và chỉ đạo của Product Owner.

---

## 1. Các điểm giữ theo Backlog (BL Overrides)

### BL-1: S-24 Khóa sổ và Mở khóa nhật ký thi công
- **Khóa sổ cuối ngày:** Kỹ sư giám sát (`site_log.close_daily: [KY_SU_GIAM_SAT]`). Chuyển giao từ Chỉ huy trưởng, khóa ngày đã qua để bảo vệ dữ liệu.
- **Mở khóa điều chỉnh:** Ban quản lý (`site_log.correct_locked: [BAN_QUAN_LY]`).
- **Ràng buộc máy chủ:** Bắt buộc nhập lý do mở khóa (`reason`, kiểm tra HTTP 400 tại server) và ghi nhận nhật ký thao tác `UNLOCK_DIARY` ngay sau khi commit transaction.
- **System Admin:** Giữ theo ma trận (Toàn quyền / Quản trị).

### BL-2: S-32 Xử lý xung đột phiên bản nhật ký
- **Key riêng:** `diary.resolve_conflict` (tách riêng, không dùng lại key của S-24).
- **Chọn bản giữ:** Kỹ sư giám sát (`diary.resolve_conflict: [KY_SU_GIAM_SAT]`). KSGS là người trực tiếp kiểm tra hiện trường nên có thẩm quyền chọn bản ghi giữ lại khi phát hiện xung đột phiên bản.
- **Ban quản lý:** Chỉ XEM danh sách xung đột (`GET /diary-conflicts`), KHÔNG có quyền chọn bản giữ.
- **System Admin:** Giữ theo ma trận.

### BL-3: S-19 Đặt mốc tiến độ bắt buộc
- **Căn cứ:** Backlog S-19 (story của Chủ đầu tư) và T-43 (*"chỉ chủ đầu tư và ban quản lý đặt được mốc"*).
- **Phân quyền:** Cả Chủ đầu tư và Ban quản lý đều có quyền đặt mốc (`milestone.manage: [CHU_DAU_TU, BAN_QUAN_LY]`).
- **Các vai trò khác:** Chỉ xem và nhận cảnh báo mốc.
- **System Admin:** Giữ theo ma trận.

### BL-4: S-47 Ghi chi phí thực tế gắn với hạng mục
- **Căn cứ:** Backlog S-47 (*"Là ban quản lý dự án tôi muốn ghi các khoản chi thực tế gắn với hạng mục để có số so với dự toán"*).
- **Phân quyền:** `cost.record` chỉ dành cho Ban quản lý (`[BAN_QUAN_LY]`) (+ `system_admin` theo ma trận).
- **Kế toán:** Bỏ quyền ghi `cost.record`; Kế toán chỉ có quyền xem/đối chiếu (`cost.view`, `finance.report`).

---

## 2. Lớp ghi đè an toàn (Safety Overrides — OV)

### OV-1: Đội trưởng và thông tin tài chính
- **Khóa quyền:** Đội trưởng bị chặn toàn bộ các quyền và API tài chính: `cost.record`, `budget.manage`, `budget.view`, `payment_request.create`, `payment_request.view`, `payment.approve`, `payment_retention.manage`, `finance.report`.
- **Tầng Serializer:** Loại bỏ hoàn toàn các trường tiền (`unit_price`, `total_price`, `contract_value`, `contract_total`, `budget`, `actual_cost`, `cost`, `retention_amount`, `retention_rate`) khỏi response ở tầng serializer đối với vai trò Đội trưởng.
- **Phạm vi phủ:** Áp dụng xuyên suốt các story tài chính S-43..S-45, S-48..S-50 và các API trả về danh sách công việc/hạng mục.

### OV-2: Phạm vi đội của Đội trưởng (Team Scoping)
- **Quy tắc:** Đội trưởng chỉ thấy công việc, khối lượng báo cáo, vướng mắc của **ĐỘI MÌNH** (phạm vi team) ở mọi ô "Xem" về tiến độ/công việc.
- **Cơ chế:** Máy chủ ép cứng `team_id = ownTeam.id` (bất kể client gửi gì).
- **Đổi đội:** Khi người dùng được chuyển sang đội khác trong CSDL, lập tức mất quyền xem dữ liệu của đội cũ và chỉ thấy dữ liệu đội mới.
- *Ghi chú:* Việc Đội trưởng không sửa WBS là thẩm quyền quản lý WBS (`work_item.manage`), tách biệt với quy tắc giới hạn phạm vi team OV-2.

### OV-3 / S-39: Nhật ký thao tác dự án (Audit Portal)
- **Quy tắc:** CHỈ LOẠI ĐỘI TRƯỞNG.
- **Phân quyền:** `audit.view_project: [CHU_DAU_TU, BAN_QUAN_LY, CHI_HUY_TRUONG, KY_SU_GIAM_SAT, KE_TOAN]`.
- **Đội trưởng:** Không được xem nhật ký thao tác (`audit.view_project` từ chối).
- **System Admin:** Chỉ xem, lọc và xuất nhật ký; KHÔNG có bất kỳ API nào để sửa hoặc xoá nhật ký thao tác (hệ thống append-only).

---

## 3. Các quyết định phân định khác

### OQ-02 / S-38: Phê duyệt nghiệm thu chính thức
- Ban quản lý duyệt hoặc trả lại phiếu nghiệm thu kỹ thuật (`acceptance.approve_official: [BAN_QUAN_LY]`, `acceptance.return_official: [BAN_QUAN_LY]`).
- Chủ đầu tư chỉ xem nghiệm thu (`acceptance.access`), Chủ đầu tư giữ quyền duyệt giải ngân thanh toán ở S-44 (`payment.approve: [CHU_DAU_TU]`).

### S-39 & S-51: Phân tách Audit dự án và Giám sát hạ tầng
- S-39: Nhật ký thao tác dự án (`audit.view_project`).
- S-51: Giám sát sức khỏe hệ thống hạ tầng DevOps (`system.health.view`, cấp nền tảng dành cho `system_admin`, `endpoint_status: not_implemented`).

---

## 4. F-06: Thẩm quyền cây WBS (S-04, S-05)
- **Quy tắc:** Chỉ Ban quản lý được Tạo/Sửa/Di chuyển/Xóa cây WBS (`work_item.manage: [BAN_QUAN_LY]`).
- **Chỉ huy trưởng:** Chỉ Xem cây WBS (nhận 403 Forbidden nếu cố tình thao tác tạo/sửa). Không tạo mã BL-5 vì đây là chuẩn tuân thủ theo ma trận và backlog S-04, S-05.
- **Phân định rõ với S-15 và S-25:**
  - S-15 (Cập nhật tiến độ thực tế: `PATCH /api/projects/:projectId/tasks/:taskId/progress`): Chỉ huy trưởng vẫn toàn quyền cập nhật tiến độ.
  - S-25 (Giao việc cho đội: `POST /api/projects/:projectId/teams/:teamId/assignments`): Dùng key riêng `task.assign: [CHI_HUY_TRUONG]`, Chỉ huy trưởng vẫn toàn quyền giao việc.

---

## 5. S-04: Quyền tạo dự án (project.create)

- **Chủ thể được phép tạo dự án:**
  - `system_admin` (Quản trị viên toàn hệ thống).
  - Người dùng đang giữ vai trò **Ban quản lý (`ban_quan_ly`)** ở ít nhất một dự án trong hệ thống (thành viên chưa bị gỡ, tài khoản hoạt động và đã xác thực `is_verified = true`, không bị khóa `locked_until`).
- **Chủ thể bị từ chối (HTTP 403 Forbidden):**
  - Chủ đầu tư, Chỉ huy trưởng, Kỹ sư giám sát, Đội trưởng, Kế toán, Khách (`khach`), hoặc người chưa từng có vai trò Ban quản lý ở bất kỳ dự án nào.
- **Ràng buộc khi System Admin tạo dự án:**
  - BẮT BUỘC chỉ định ít nhất một người làm Ban quản lý cho dự án (`pm_email` hoặc `pm_user_id`), nếu thiếu hoặc không hợp lệ -> HTTP 422 Unprocessable Entity.
  - Người được chỉ định phải tồn tại, đang hoạt động, đã xác thực, không phải vai trò khách (`role != 'khach'`).
  - Khi đã chỉ định người khác, KHÔNG tự thêm System Admin vào `project_members` để tránh dự án bị mồ côi (S-28: không được gỡ BQL cuối cùng).
- **Ràng buộc khi Ban quản lý tạo dự án:**
  - Trong MỘT giao dịch (Transaction), tạo dự án và thêm chính người tạo vào `project_members` với vai trò Ban quản lý; thiếu một trong hai thì rollback hủy cả hai.
  - Không cấp cho họ bất kỳ quyền nào trên các dự án của người khác.
- **Ghi nhật ký kiểm toán (Audit Log):**
  - Ghi nhật ký thao tác `CREATE_PROJECT` (thành công) và `CREATE_PROJECT_DENIED` (bị 403) kèm định danh người thực hiện, thời gian và địa chỉ IP chuẩn (`getClientIp`).
  - Tầng phân quyền trung tâm ghi log 403 cho mọi route, tự động lọc bỏ các trường nhạy cảm (mật khẩu, token, secret) trước khi lưu.

