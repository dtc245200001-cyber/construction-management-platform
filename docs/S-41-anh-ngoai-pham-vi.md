# STORY S-41: CẤU HÌNH PHẠM VI CÔNG TRƯỜNG & ĐÁNH DẤU ẢNH NGOÀI BÁN KÍNH

## 1. Mục tiêu nghiệp vụ

Chủ đầu tư và Ban quản lý muốn phát hiện ảnh hiện trường chụp không phải tại công trường để không nghiệm thu dựa trên bằng chứng sai lệch.
- **T-107:** Dự án khai toạ độ tâm (`site_latitude`, `site_longitude`) và bán kính công trường (`site_radius_m`). API GET/PUT/DELETE phân quyền chặt chẽ (`site_geofence.manage`).
- **T-108:** Tính khoảng cách theo công thức Haversine thuần túy ($R = 6.371.000$ m) kèm bù trừ sai số định vị di động (dung sai từ 30m đến 500m). Đánh dấu nghi vấn và khoảng cách trên phiếu nghiệm thu mà không chặn thao tác duyệt.

---

## 2. Thiết kế cơ sở dữ liệu & Migration

File migration: `backend/migrations/1799700000000_add-site-geofence.js`

### 2.1. Bảng `projects`
- `site_latitude numeric(9,6) NULL`
- `site_longitude numeric(9,6) NULL`
- `site_radius_m integer NULL`
- `site_geofence_updated_at timestamptz NULL`
- `site_geofence_updated_by integer NULL REFERENCES users(id) ON DELETE SET NULL`
- Constraint `chk_projects_site_geofence`: Cả 3 trường cùng `NULL` hoặc cùng `NOT NULL`; vĩ độ $[-90, 90]$; kinh độ $[-180, 180]$; bán kính $[1, 20000]$ m; từ chối toạ độ `(0, 0)` (Null Island).

### 2.2. Bảng `acceptance_voucher_photos` & `diary_entry_attachments`
- `geofence_status varchar(20) NULL` với constraint `chk_*_geofence` nhận các giá trị:
  - `'inside'`: Ảnh nằm trong bán kính + dung sai định vị.
  - `'outside'`: Ảnh nằm ngoài ngưỡng cho phép.
  - `'no_gps'`: Ảnh không có toạ độ GPS.
  - `'no_site_config'`: Dự án chưa thiết lập tâm và bán kính.
- `geofence_distance_m numeric(10,1) NULL`: Khoảng cách tính từ toạ độ ảnh tới tâm công trường (mét, làm tròn 0.1m).
- `geofence_checked_at timestamptz NULL`: Thời điểm đối chiếu geofence.
- Chỉ mục `idx_*_geofence_status` tăng tốc tra cứu thống kê.

---

## 3. Công thức tính toán & Thuật toán Haversine (`backend/utils/geo.js`)

Bán kính Trái Đất: $R = 6.371.000$ mét.
$$\Delta\phi = (\text{lat}_2 - \text{lat}_1) \times \frac{\pi}{180},\quad \Delta\lambda = (\text{lon}_2 - \text{lon}_1) \times \frac{\pi}{180}$$
$$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\text{lat}_1 \times \frac{\pi}{180}) \cdot \cos(\text{lat}_2 \times \frac{\pi}{180}) \cdot \sin^2\left(\frac{\Delta\lambda}{2}\right)$$
$$d = 2R \cdot \text{atan2}(\sqrt{a}, \sqrt{1-a})$$

Dung sai định vị di động:
$$\text{tolerance\_m} = \min(500, \max(30, \text{accuracy\_m} \parallel 0))$$
$$\text{threshold\_m} = \text{radius\_m} + \text{tolerance\_m}$$

Trạng thái:
- Nếu $d \le \text{threshold\_m} \implies \text{'inside'}$
- Nếu $d > \text{threshold\_m} \implies \text{'outside'}$

---

## 4. API Endpoints & Phân quyền

### 4.1. `GET /api/projects/:projectId/site-geofence`
- Quyền: `project.member` (mọi thành viên dự án xem được).
- Trả về: `{ site_latitude, site_longitude, site_radius_m, site_geofence_updated_at, site_geofence_updated_by }`.

### 4.2. `PUT /api/projects/:projectId/site-geofence`
- Quyền: `site_geofence.manage` (`[BAN_QUAN_LY, CHU_DAU_TU]`).
- Body: `{ latitude, longitude, radius_m }`.
- Validation:
  - Vĩ độ $[-90, 90]$, tối đa 6 chữ số thập phân.
  - Kinh độ $[-180, 180]$, tối đa 6 chữ số thập phân.
  - Bán kính nguyên $[1, 20000]$ mét.
  - Từ chối toạ độ `(0, 0)`.
- Transaction:
  1. `SELECT ... FROM projects WHERE id = $1 FOR UPDATE`.
  2. Cập nhật `projects`.
  3. Tính lại toàn bộ ảnh hiện có trong `acceptance_voucher_photos` và `diary_entry_attachments` theo từng lô 500 ảnh (TUYỆT ĐỐI không `SELECT file_data`).
  4. Ghi nhận `audit_logs` với action `'SITE_GEOFENCE_SET'` chứa thông tin trước/sau.
  5. `COMMIT`. Nếu lỗi, tự động `ROLLBACK`.

### 4.3. `DELETE /api/projects/:projectId/site-geofence`
- Quyền: `site_geofence.manage` (`[BAN_QUAN_LY, CHU_DAU_TU]`).
- Transaction:
  1. Khóa row dự án `FOR UPDATE`.
  2. Set `NULL` các trường cấu hình trong `projects`.
  3. Cập nhật trạng thái ảnh: ảnh có GPS chuyển thành `no_site_config`, ảnh không GPS thành `no_gps`.
  4. Ghi nhận `audit_logs` với action `'SITE_GEOFENCE_CLEAR'`.

---

## 5. Hiển thị Frontend

1. **`SiteGeofencePage.jsx` (Route `/site-geofence`, mục "Phạm vi công trường" trong menu Quản lý):**
   - Form nhập vĩ độ, kinh độ, bán kính.
   - Nút "Lấy vị trí GPS hiện tại của tôi" (`navigator.geolocation.getCurrentPosition`).
   - Thẻ hiển thị trạng thái hiện tại kèm link xem tâm công trường trên Google Maps.
   - Nút Xóa cấu hình có hộp thoại xác nhận.
   - Tự động hiển thị banner số lượng ảnh đã tính lại sau thao tác.
   - Phân quyền: các vai trò khác Ban quản lý / Chủ đầu tư ở chế độ xem, vô hiệu hoá các trường sửa.
2. **`AcceptancePage.jsx`:**
   - Khung cảnh báo ở đầu phiếu khi có ảnh `outside`: *"Phát hiện X ảnh chụp ngoài bán kính công trường. Dấu hiệu này nhằm tham khảo khi đối chiếu bằng chứng (không chặn quy trình duyệt phiếu)."*
   - Huy hiệu (badge) trên từng ảnh:
     - `⚠️ Ngoài phạm vi (X m)` (nền đỏ nhạt, viền đỏ).
     - `✓ Đúng vị trí (X m)` (nền xanh lá).
     - `Không có GPS` (nền xám).
     - `Chưa cấu hình tâm` (nền xám).
3. **`PhotoMetadataPanel.jsx`:**
   - Bổ sung khối "Đối chiếu phạm vi công trường", hiển thị trạng thái và khoảng cách mét (định dạng số tiếng Việt `toLocaleString('vi-VN')`).
