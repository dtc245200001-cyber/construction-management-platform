# Các điểm chưa chốt cần Người Quyết Định Sản Phẩm (Product Owner) xác nhận

Tài liệu này tổng hợp các quyết định phân quyền then chốt đang có sự sai lệch giữa Mã nguồn thực tế và Backlog dự án.

---

### [OQ-01] Ai có thẩm quyền ghi nhận và nạp chi phí thực tế (Story S-47)?
- **Hiện trạng mã nguồn:** Chỉ có **Kế toán** (`ke_toan`) được phép qua quyền `cost.record`. Ban quản lý bị chặn (403).
- **Yêu cầu theo Backlog S-47:** Ban quản lý (`ban_quan_ly`) trực tiếp ghi nhận và nạp tệp CSV để đối chiếu với dự toán.
- **Phương án lựa chọn:**
  - *Phương án A (Khuyến nghị):* Cho phép cả **Ban quản lý** và **Kế toán** (`[BAN_QUAN_LY, KE_TOAN]`). Kế toán hạch toán chứng từ, Ban quản lý theo dõi phân bổ hạng mục.
  - *Phương án B:* Chỉ Ban quản lý (sửa mã để khớp hoàn toàn Backlog S-47).
  - *Phương án C:* Giữ nguyên chỉ Kế toán (cần cập nhật lại User Story trong Backlog).
- **Đề xuất mặc định:** **Phương án A**.

---

### [OQ-02] Phê duyệt phiếu nghiệm thu đợt chính thức (Story S-38) thuộc về ai?
- **Hiện trạng mã nguồn:** Route `POST /acceptance-vouchers/:id/approve` đang gán cho **Ban quản lý** (`ban_quan_ly`).
- **Yêu cầu theo Hợp đồng xây dựng:** Chủ đầu tư (`chu_dau_tu`) hoặc Tư vấn giám sát đại diện Chủ đầu tư mới là người ký nghiệm thu chính thức; Ban quản lý nhà thầu chỉ duyệt nội bộ.
- **Phương án lựa chọn:**
  - *Phương án A (Khuyến nghị):* Quy trình 2 bước: Ban quản lý duyệt nội bộ (`acceptance.review_internal`), sau đó Chủ đầu tư duyệt chính thức (`acceptance.approve_official`).
  - *Phương án B:* Cho phép cả Ban quản lý và Chủ đầu tư cùng có quyền duyệt.
  - *Phương án C:* Giữ nguyên như mã hiện tại (Ban quản lý duyệt).
- **Đề xuất mặc định:** **Phương án A**.

---

### [OQ-03] Chỉ huy trưởng có được phép tạo, sửa, xóa Hạng mục WBS (Story S-05)?
- **Hiện trạng mã nguồn:** `work_item.manage` đang cấp cho cả Ban quản lý và Chỉ huy trưởng (`[BAN_QUAN_LY, CHI_HUY_TRUONG]`).
- **Yêu cầu theo Backlog S-05:** Chỉ Ban quản lý quản lý cơ cấu WBS.
- **Đề xuất mặc định:** **Cho phép cả hai** (giữ theo mã hiện tại), vì ngoài công trường Chỉ huy trưởng cần chủ động phân chia các gói việc nhỏ.

---

### [OQ-04] Thu hẹp quyền kích hoạt tính toán lại tiến độ CPM (Story S-11)
- **Hiện trạng mã nguồn:** Tuyến `POST /schedule/recalculate` đang mở cho tất cả thành viên (`ALL_MEMBERS`), bao gồm cả Đội trưởng và Kế toán.
- **Rủi ro:** Đội trưởng bấm tính lại có thể làm thay đổi các mốc thời gian đã được chốt.
- **Đề xuất mặc định:** Thu hẹp về **Chỉ huy trưởng và Ban quản lý** (`[CHI_HUY_TRUONG, BAN_QUAN_LY]`).

---

### [OQ-05] Chính sách hiển thị danh sách dự án cho vai trò `khach` (Guest)
- **Hiện trạng mã nguồn:** Route `GET /api/projects` trả về các dự án mà user là thành viên (`JOIN project_members`). Nếu tài khoản khách được gán vào dự án, khách vẫn thấy tên và mã dự án nhưng khi bấm vào chi tiết bị 403 toàn bộ.
- **Đề xuất mặc định:** Giữ nguyên hành vi hiện tại. Nếu cần giấu hoàn toàn, bổ sung điều kiện `WHERE pm.role != 'khach'` trong câu truy vấn `GET /api/projects`.
