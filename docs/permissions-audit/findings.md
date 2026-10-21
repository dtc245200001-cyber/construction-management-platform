# Báo cáo phát hiện kiểm kê phân quyền (Findings Report)

Báo cáo phân loại các lỗ hổng, sai lệch và bất cập phân quyền phát hiện được từ kiểm kê 100% mã nguồn đang chạy so với tài liệu Backlog và Thiết kế vai trò.

---

## 1. MỨC ĐỘ: NGHIÊM TRỌNG (CRITICAL)

### [F-01] Route xem quan hệ phụ thuộc công việc không khai báo quyền, bị chặn hoàn toàn bởi Default-Deny
- **Vị trí:** [`backend/routes/dependencyRoutes.js:320-324`](file:///d:/construction-management-platform/backend/routes/dependencyRoutes.js#L320-L324)
- **Mô tả:** Endpoint `GET /api/projects/:projectId/tasks/:taskId/dependencies` được bọc bởi `createProjectRouter()` nhưng không có `requirePermission(...)` hay `allow(...)`. 
- **Hậu quả:** Trên môi trường Production, middleware `defaultDeny` tự động kích hoạt trả về **HTTP 403 Forbidden** đối với toàn bộ người dùng (kể cả Ban quản lý và Chủ đầu tư). Trên môi trường Dev, hệ thống ném ngoại lệ làm crash request.
- **Tái hiện:**
  ```bash
  curl -X GET "http://localhost:5000/api/projects/1/tasks/1/dependencies" -b "cmp.sid=..."
  # Trả về: 403 {"error":"Chưa phân quyền cho endpoint này"}
  ```
- **Đề xuất khắc phục:** Bổ sung middleware `requirePermission("project.member")` vào định nghĩa route tại dòng 322 file `dependencyRoutes.js`.

---

### [F-02] Bất nhất kiến trúc Router: 2 route file bỏ qua lớp bảo vệ Default-Deny của T-07
- **Vị trí:** 
  - [`backend/routes/siteGeofenceRoutes.js:4`](file:///d:/construction-management-platform/backend/routes/siteGeofenceRoutes.js#L4): `const router = express.Router();`
  - [`backend/routes/taskLogRoutes.js:14`](file:///d:/construction-management-platform/backend/routes/taskLogRoutes.js#L14): `const router = express.Router({ mergeParams: true });`
- **Mô tả:** Hai tệp route này khởi tạo bằng `express.Router()` thông thường thay vì `createProjectRouter()`.
- **Hậu quả:** Mất hoàn toàn cơ chế phòng vệ chiều sâu Default-Deny theo yêu cầu T-07. Nếu lập trình viên bổ sung thêm route thao tác dữ liệu nhạy cảm vào hai file này mà quên đặt middleware kiểm quyền, route đó sẽ mở tự do cho mọi client mà không hề bị chặn tự động.
- **Đề xuất khắc phục:** Đổi `express.Router(...)` thành `createProjectRouter()` và import hàm từ `../middleware/projectAccess`.

---

### [F-03] Lệch quyền ghi nhận chi phí thực tế (Story S-47): Chặn Ban quản lý, chỉ mở cho Kế toán
- **Vị trí:** [`backend/routes/actualCostRoutes.js:48`](file:///d:/construction-management-platform/backend/routes/actualCostRoutes.js#L48), [`backend/utils/permissions.js:124`](file:///d:/construction-management-platform/backend/utils/permissions.js#L124)
- **Mô tả:** Backlog Story S-47 ghi rõ: *"Là ban quản lý dự án tôi muốn ghi các khoản chi thực tế gắn với hạng mục để có số so với dự toán"*. Tuy nhiên trong mã nguồn đang chạy:
  `requirePermission("cost.record")` được cấu hình duy nhất: `"cost.record": [ROLES.KE_TOAN]`.
- **Hậu quả:** Ban quản lý (`ban_quan_ly`) hoàn toàn bị chặn (HTTP 403) khi ghi chi phí hoặc tải tệp CSV lên hệ thống, trái ngược với yêu cầu nghiệp vụ của Backlog S-47.
- **Tái hiện:**
  Đăng nhập bằng tài khoản `banquanly@cong-truong-360.vn` và gửi POST tới `/api/projects/1/actual-costs` -> Nhận lỗi 403 `Vai trò Ban quản lý không có quyền cost.record`.
- **Đề xuất khắc phục:** Trình xin ý kiến Product Owner xem nghiệp vụ thực tế giao cho ai (xem mục OQ-01 trong `open-questions.md`). Nếu theo đúng backlog S-47, cập nhật `PERMISSIONS["cost.record"] = [BAN_QUAN_LY, KE_TOAN]`.

---

### [F-04] Lệch quyền phê duyệt nghiệm thu chính thức (Story S-38)
- **Vị trí:** [`backend/routes/acceptanceRoutes.js:1072`](file:///d:/construction-management-platform/backend/routes/acceptanceRoutes.js#L1072), [`backend/utils/permissions.js:113`](file:///d:/construction-management-platform/backend/utils/permissions.js#L113)
- **Mô tả:** Phê duyệt phiếu nghiệm thu đợt chính thức (`POST /:projectId/acceptance-vouchers/:voucherId/approve`) đang kiểm tra `acceptance.approve_official`. Trong `permissions.js`, quyền này đang gán cho `[BAN_QUAN_LY]`.
- **Hậu quả:** Theo mô hình kiểm soát hợp đồng xây dựng và tài liệu thiết kế vai trò mục 2: Kỹ sư giám sát lập phiếu -> Ban quản lý kiểm tra nội bộ -> Chủ đầu tư ký duyệt chính thức. Mã nguồn hiện tại đang cho Ban quản lý vừa lập/kiểm tra vừa tự duyệt chính thức, tước quyền phê duyệt của Chủ đầu tư (`chu_dau_tu`).
- **Đề xuất khắc phục:** Phân định rõ 2 bước: `acceptance.review_internal` (Ban quản lý) và `acceptance.approve_official` (Chủ đầu tư hoặc người được uỷ quyền).

---

### [F-05] Không chặn gỡ bỏ Ban quản lý cuối cùng khi xóa thành viên dự án
- **Vị trí:** [`backend/routes/projectRoutes.js:762-777`](file:///d:/construction-management-platform/backend/routes/projectRoutes.js#L762-L777)
- **Mô tả:** API `DELETE /:projectId/members/:userId` có kiểm tra chặn tự xóa chính mình (`req.user.id === userId`) và chặn xóa Chủ đầu tư (`member.role === 'chu_dau_tu'`). Tuy nhiên, KHÔNG kiểm tra số lượng Ban quản lý còn lại trong dự án.
- **Hậu quả:** Trong dự án có 2 tài khoản Ban quản lý A và B, tài khoản A có thể gọi API xóa tài khoản B, hoặc một tài khoản BQL có thể bị gỡ bởi script/admin dẫn đến dự án mồ côi (không còn bất kỳ Ban quản lý nào để phê duyệt, điều hành hay phân quyền tiếp).
- **Đề xuất khắc phục:** Thêm kiểm tra: nếu người bị xóa có role `ban_quan_ly`, kiểm tra `SELECT COUNT(*) FROM project_members WHERE project_id = $1 AND role = 'ban_quan_ly'`. Nếu count <= 1 thì chặn trả lỗi 400.

---

## 2. MỨC ĐỘ: CAO (HIGH)

### [F-06] Cho phép Chỉ huy trưởng tạo/sửa/xóa hạng mục WBS (Lệch S-05)
- **Vị trí:** [`backend/utils/permissions.js:43`](file:///d:/construction-management-platform/backend/utils/permissions.js#L43), [`backend/routes/categoryRoutes.js:240`](file:///d:/construction-management-platform/backend/routes/categoryRoutes.js#L240)
- **Mô tả:** `PERMISSIONS["work_item.manage"] = [BAN_QUAN_LY, CHI_HUY_TRUONG]`. Backlog S-05 quy định cây phân rã WBS là tài sản quản lý kỹ thuật của Ban quản lý dự án. Việc cấp quyền cho Chỉ huy trưởng có thể làm thay đổi cấu trúc thanh toán/hợp đồng mà Chủ đầu tư và Ban quản lý chưa phê chuẩn.
- **Đề xuất:** Xem xét tách riêng: CHT chỉ quản lý Task con bên dưới Hạng mục, không sửa/xóa Hạng mục WBS cha.

### [F-07] Mở quyền tính lại tiến độ CPM cho toàn bộ thành viên (Lệch S-11)
- **Vị trí:** [`backend/utils/permissions.js:153`](file:///d:/construction-management-platform/backend/utils/permissions.js#L153), [`backend/routes/projectRoutes.js:400`](file:///d:/construction-management-platform/backend/routes/projectRoutes.js#L400)
- **Mô tả:** Route `POST /:projectId/schedule/recalculate` dùng quyền `schedule.recalculate` đang gán cho `ALL_MEMBERS` (bao gồm cả Đội trưởng và Kế toán). 
- **Hậu quả:** Đội trưởng thi công hoặc Kế toán có thể kích hoạt tính toán lại toàn bộ đường găng và ghi đè lịch tiến độ công trình.
- **Đề xuất:** Thu hẹp quyền `schedule.recalculate` về `[BAN_QUAN_LY, CHI_HUY_TRUONG]`.

---

## 3. MỨC ĐỘ: TRUNG BÌNH (MEDIUM)

### [F-08] Nhiều quyền "treo" đã khai báo nhưng chưa có Route/UI sử dụng
- **Vị trí:** [`backend/utils/permissions.js:58,64,77,79,84,93,96,104,115,125,126,127`](file:///d:/construction-management-platform/backend/utils/permissions.js)
- **Danh sách quyền treo:** `schedule.manage`, `schedule.view_delays`, `site_log.upload_photo`, `quantity.verify`, `issue.report`, `task.upload_photo`, `project.view`, `acceptance.view_verified`, `payment.reconcile`, `payment.prepare_dossier`, `finance.report`.
- **Đánh giá:** Đây là các quyền được định nghĩa trước cho các Story tier Later (Sprint sau). Không gây lỗi trực tiếp nhưng cần lưu ý khi xây dựng các route mới phải dùng đúng các key này.

---

## 4. MỨC ĐỘ: THẤP (LOW)

### [F-09] Tên quyền chưa đồng nhất giữa module cũ và mới
- **Mô tả:** 
  - Quản lý mốc dùng số ít `milestone.manage`, trong khi bảng là `milestones`.
  - Quản lý quan hệ phụ thuộc dùng `dependency.manage`.
  - Ghi chi phí thực tế dùng `cost.record` thay vì `actual_cost.manage`.
- **Đề xuất:** Giữ nguyên để tương thích ngược, chuẩn hóa tài liệu hướng dẫn.
