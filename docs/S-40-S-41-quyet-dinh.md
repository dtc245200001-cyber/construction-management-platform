# CÁC QUYẾT ĐỊNH THIẾT KẾ VÀ KIẾN TRÚC CHO STORY S-40 & S-41 (GEOFENCE & PHOTO METADATA HARDENING)

Tài liệu này ghi nhận rõ ràng các quyết định thiết kế đã áp dụng ngầm trong mã nguồn của Story S-40 (T-105, T-106) và Story S-41 (T-107, T-108) để người hướng dẫn và các bên liên quan xác nhận.

---

## 1. Phân quyền xem toạ độ thô (`photo.view_gps`)
- **Quyết định:** Chỉ có vai trò **Chủ đầu tư (`chu_dau_tu`)** và **Ban quản lý (`ban_quan_ly`)** mới được phép xem toạ độ GPS thô (kinh độ, vĩ độ dạng thập phân và đường dẫn mở Google Maps).
- **Các vai trò khác:** Kỹ sư giám sát (`ky_su_giam_sat`), Chỉ huy trưởng (`chi_huy_truong`), Đội trưởng (`doi_truong`), Kế toán (`ke_toan`) chỉ được biết ảnh chụp lúc nào, trạng thái có toạ độ hay không (`has_gps: true/false`), và kết quả đối chiếu phạm vi (`inside`/`outside`/`no_gps`/`no_site_config`).
- **Lý do:** Toạ độ GPS là dữ liệu vị trí cá nhân của người lao động tại hiện trường, cần bảo vệ quyền riêng tư theo quy định pháp luật và tránh lạm dụng giám sát vị trí cá nhân chi tiết. Mọi API danh sách ảnh công khai (nhật ký, phiếu nghiệm thu) tuyệt đối không trả về `gps_latitude`/`gps_longitude`.
- **Ghi nhận điểm lệch cần người hướng dẫn xác nhận:** Ma trận phân quyền trung tâm `backend/utils/permissions.js` ghi nhận `photo.view_gps: [CHU_DAU_TU, BAN_QUAN_LY]`. Tuy nhiên trong mã nguồn hiện hành của `main` (route `photoMetadataRoutes.js`), endpoint xem chi tiết ảnh nghiệm thu (`GET /photo-metadata/acceptance/:photoId`) chặn 403 với mọi vai trò khác `chu_dau_tu` (`if (kind === 'acceptance' && req.projectRole !== ROLES.CHU_DAU_TU)`). Do đó, `ban_quan_ly` hiện chỉ xem được toạ độ thô đối với ảnh nhật ký (`diary`), còn ảnh nghiệm thu chỉ `chu_dau_tu` được xem chi tiết. Nhánh giữ nguyên logic của `main` và ghi nhận điểm này để chờ người hướng dẫn thống nhất.

---

## 2. Công thức ngưỡng chấp nhận và xử lý sai số định vị (Geofence Tolerance)
- **Công thức:**
  $$\text{threshold\_m} = \text{radius\_m} + \text{tolerance\_m}$$
- **Dung sai (`tolerance_m`):**
  - **Với ảnh có EXIF gốc (`file_exif`):** Lấy từ sai số định vị thiết bị ghi nhận trong EXIF (`GPSHPositioningError`), được kẹp chặt trong khoảng $[30\text{ m}, 500\text{ m}]$. Nếu không có giá trị sai số trong file, áp dụng mức tối thiểu $30\text{ m}$.
  - **Với toạ độ do thiết bị client báo (`client_reported`):** Dung sai cố định luôn là $30\text{ m}$, **hoàn toàn bỏ qua** trường `exif_accuracy_m` do client gửi lên.
- **Miền bán kính khai báo công trường:** Từ $1\text{ m}$ đến $20.000\text{ m}$ ($20\text{ km}$), số nguyên dương. Toạ độ tâm nằm trong khoảng $[-90, 90]$ và $[-180, 180]$, loại trừ toạ độ rác $(0, 0)$ (Null Island).
- **Lý do:** Kẻ giả mạo có thể cố tình gửi sai số định vị giả (ví dụ $500\text{ m}$) kèm toạ độ nằm ngoài công trường để nới rộng ngưỡng chấp nhận. Việc cố định dung sai $30\text{ m}$ cho dữ liệu client ngăn chặn hoàn toàn lỗ hổng nới ngưỡng này.

---

## 3. Bản chất dữ liệu toạ độ client báo và nhãn "chưa xác thực"
- **Quyết định:** Toạ độ và thời gian do thiết bị báo (khi file không có EXIF) chỉ mang tính chất tham khảo, không được đối xử ngang hàng với dữ liệu trích xuất từ ảnh gốc.
- **Quy tắc ưu tiên (File EXIF luôn thắng):** Khi file ảnh gốc có dữ liệu GPS trong EXIF, hệ thống hoàn toàn bỏ qua mọi toạ độ GPS do client gửi lên trong request body.
- **Thời gian client:** Thời gian chụp do client gửi nếu vượt quá thời điểm hiện tại quá 10 phút sẽ bị từ chối/bỏ qua để ngăn chặn gian lận thời gian tương lai.
- **Hiển thị giao diện:**
  - Nguồn toạ độ phải hiển thị rõ bằng chữ: `"Toạ độ từ ảnh gốc"` hoặc `"Toạ độ do thiết bị báo, chưa xác thực từ ảnh gốc"`.
  - Trạng thái `"Trong phạm vi"` khi nguồn là client phải hiển thị nhãn `"Trong phạm vi (chưa xác thực)"` với màu cảnh báo (amber/vàng), không hiển thị màu xanh đã kiểm chứng.

---

## 4. Dấu nghi vấn geofence không chặn quy trình duyệt phiếu
- **Quyết định:** Khi phát hiện ảnh chụp ngoài phạm vi công trường hoặc có ảnh chưa xác thực toạ độ, hệ thống hiển thị banner và badge cảnh báo tham khảo cho người duyệt phiếu (Chủ đầu tư / Ban quản lý), **không chặn** thao tác gửi duyệt hoặc phê duyệt phiếu nghiệm thu.
- **Quyền xem cờ geofence (AC S-41):** Cả `chu_dau_tu` và `ban_quan_ly` (người có quyền duyệt `acceptance.approve_official`) đều thấy banner `photo_flags` và khoảng cách ngoài bán kính của từng ảnh để phục vụ duyệt phiếu. Kỹ sư giám sát hoặc vai trò khác không nhận các trường này.
- **Giọng văn giao diện:** Giữ giọng văn trung tính, khách quan: *"Dấu hiệu này nhằm tham khảo khi đối chiếu bằng chứng (không chặn quy trình duyệt phiếu)"*, không sử dụng từ ngữ mang tính quy chụp, kết luận gian lận.
- **Lý do:** Trên thực tế có thể xảy ra trường hợp trôi GPS (GPS drift) dưới tầng hầm, công trình nhà cao tầng che khuất sóng vệ tinh, hoặc chụp cấu kiện gia công sẵn tại bãi đúc lân cận công trường. Quyết định cuối cùng thuộc về người có thẩm quyền nghiệm thu.

---

## 5. Đổi tên Migration tránh xung đột
- Migration bổ sung `gps_source` và `geofence_basis` được đổi tên từ `1799800000000_add-photo-gps-source-and-basis.js` sang `1800000000000_add-photo-gps-source-and-basis.js` để đứng sau tất cả các migration mới của `main` (`1799800000000_create-payment-requests.js` và `1799900000000_create-actual-costs.js`).
- **Lưu ý triển khai:** Bất kỳ ai đã chạy migration tên cũ trên DB local cá nhân cần chạy `npm run migrate:down` hoặc xoá bản ghi cũ tương ứng trong bảng `pgmigrations`.

---

## 6. Rủi ro ngoài phạm vi: Giả mạo siêu dữ liệu máy ảnh client báo (S-42)
- **Hiện trạng:** Trên `main`, `services/photoMetadata.js` cho phép nhận `make`, `model`, `software`, `iso` do client gửi lên khi file ảnh thiếu EXIF.
- **Rủi ro:** Kẻ gian có thể lợi dụng cơ chế này để qua mặt quy tắc kiểm tra ảnh của Story S-42 (như quy tắc cảnh báo thiếu metadata máy ảnh) bằng cách chủ động gửi các trường giả mạo từ client.
- **Đề xuất giải pháp cho giai đoạn sau:** Tương tự như toạ độ GPS (`gps_source`), cần bổ sung trường đánh dấu nguồn gốc thiết bị (`camera_source: 'file_exif' | 'client_reported'`), đồng thời không coi metadata máy ảnh do client báo là dữ liệu đã xác thực khi chạy kiểm tra bất thường.
