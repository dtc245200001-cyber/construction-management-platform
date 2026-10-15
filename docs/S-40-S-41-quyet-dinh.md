# CÁC QUYẾT ĐỊNH THIẾT KẾ VÀ KIẾN TRÚC CHO STORY S-40 & S-41 (GEOFENCE & PHOTO METADATA HARDENING)

Tài liệu này ghi nhận rõ ràng các quyết định thiết kế đã áp dụng ngầm trong mã nguồn của Story S-40 (T-105, T-106) và Story S-41 (T-107, T-108) để người hướng dẫn và các bên liên quan xác nhận.

---

## 1. Phân quyền xem toạ độ thô (`photo.view_gps`)
- **Quyết định:** Chỉ có vai trò **Chủ đầu tư (`chu_dau_tu`)** và **Ban quản lý (`ban_quan_ly`)** mới được phép xem toạ độ GPS thô (kinh độ, vĩ độ dạng thập phân và đường dẫn mở Google Maps).
- **Các vai trò khác:** Kỹ sư giám sát (`ky_su_giam_sat`), Chỉ huy trưởng (`chi_huy_truong`), Đội trưởng (`doi_truong`), Kế toán (`ke_toan`) chỉ được biết ảnh chụp lúc nào, trạng thái có toạ độ hay không (`has_gps: true/false`), và kết quả đối chiếu phạm vi (`inside`/`outside`/`no_gps`/`no_site_config`).
- **Lý do:** Toạ độ GPS là dữ liệu vị trí cá nhân của người lao động tại hiện trường, cần bảo vệ quyền riêng tư theo quy định pháp luật và tránh lạm dụng giám sát vị trí cá nhân chi tiết. Mọi API danh sách ảnh công khai (nhật ký, phiếu nghiệm thu) tuyệt đối không trả về `gps_latitude`/`gps_longitude`.

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
- **Quyết định:** Khi phát hiện ảnh chụp ngoài phạm vi công trường hoặc có ảnh chưa xác thực toạ độ, hệ thống chỉ hiển thị banner và badge cảnh báo tham khảo cho người duyệt phiếu (Chủ đầu tư / Ban quản lý), **không chặn** thao tác gửi duyệt hoặc phê duyệt phiếu nghiệm thu.
- **Giọng văn giao diện:** Giữ giọng văn trung tính, khách quan: *"Dấu hiệu này nhằm tham khảo khi đối chiếu bằng chứng (không chặn quy trình duyệt phiếu)"*, không sử dụng từ ngữ mang tính quy chụp, kết luận gian lận.
- **Lý do:** Trên thực tế có thể xảy ra trường hợp trôi GPS (GPS drift) dưới tầng hầm, công trình nhà cao tầng che khuất sóng vệ tinh, hoặc chụp cấu kiện gia công sẵn tại bãi đúc lân cận công trường. Quyết định cuối cùng thuộc về người có thẩm quyền nghiệm thu.

---

## 5. Phạm vi Story S-40 & S-41 tách biệt với Story S-42
- **Quyết định:** Các tính năng phát hiện bất thường ảnh chuyên sâu (chụp lại màn hình, ảnh thiếu EXIF máy ảnh chuẩn, thời điểm chụp cách quá xa ngày lập biên bản nghiệm thu) thuộc về **Story S-42 (Dấu hiệu bất thường ảnh)** và **chưa làm** trong đợt triển khai này.
- **Tập trung:** Lần này giải quyết triệt để vấn đề xác thực nguồn toạ độ (`file_exif` vs `client_reported`), chống giả mạo GPS và hoàn thiện kiểm thử upload ảnh thực tế.
