# Tài Liệu Kỹ Thuật Story S-40: Siêu Dữ Liệu Ảnh Hiện Trường (T-105 & T-106)

**Story S-40**: Ban quản lý và Chủ đầu tư muốn biết ảnh hiện trường chụp lúc nào, ở đâu để đối chiếu với hồ sơ nghiệm thu và nhật ký thi công.  
**Nhiệm vụ**:
- **T-105**: Đọc EXIF `DateTimeOriginal` và GPS từ ảnh chụp hiện trường trong luồng upload; chuẩn hoá thời gian về UTC và toạ độ thập phân; lưu metadata cùng bản ghi ảnh; xử lý ảnh không có EXIF hoặc lỗi an toàn.
- **T-106**: Hiển thị thông tin thời điểm và toạ độ khi xem ảnh trong nhật ký và phiếu nghiệm thu; phân quyền xem toạ độ thô (`photo.view_gps`) nhằm bảo vệ dữ liệu vị trí người lao động; trích xuất EXIF client-side trước khi nén; hỗ trợ ngoại tuyến qua IndexedDB.

---

## 1. Bảng truy vết tiêu chí nghiệm thu (Traceability Matrix)

| STT | Tiêu chí nghiệm thu | File triển khai | Kiểm thử chứng minh | Trạng thái |
|:---:|---|---|---|:---:|
| 1 | **Trích xuất EXIF gốc**: Đọc DateTimeOriginal, Offset, GPS (Lat, Lon, Accuracy) từ 256KB đầu file JPEG, PNG, WebP, HEIC | `backend/services/photoMetadata.js` | `backend/__tests__/photoMetadata.test.js` | **ĐẠT (PASSED)** |
| 2 | **Chuẩn hoá dữ liệu**: Thời gian về UTC (ISO 8601), toạ độ về số thập phân 6 chữ số, kiểm tra miền giá trị, loại bỏ toạ độ rác (0, 0) | `backend/services/photoMetadata.js` | `backend/__tests__/photoMetadata.test.js` | **ĐẠT (PASSED)** |
| 3 | **Độ bền bỉ & An toàn**: Ảnh không có EXIF, ảnh lỗi hoặc định dạng lạ vẫn upload thành công với trạng thái rõ ràng (`none`, `unreadable`, `unsupported`) | `backend/services/photoMetadata.js`<br>`backend/routes/diaryRoutes.js`<br>`backend/routes/acceptanceRoutes.js` | `backend/__tests__/photoMetadata.test.js` | **ĐẠT (PASSED)** |
| 4 | **Bảo vệ dữ liệu & Schema**: Migration thêm cột và CHECK constraints cho `diary_entry_attachments` và `acceptance_voucher_photos` | `backend/migrations/1799600000000_add-photo-metadata.js` | Node-pg-migrate script | **ĐẠT (PASSED)** |
| 5 | **Phân quyền bảo vệ vị trí**: Chỉ `CHU_DAU_TU` và `BAN_QUAN_LY` được xem toạ độ thô (`photo.view_gps`); các vai trò khác chỉ biết `has_gps` | `backend/utils/permissions.js`<br>`backend/routes/photoMetadataRoutes.js` | `backend/__tests__/permissions.test.js`<br>`backend/__tests__/photoMetadataRoutes.test.js` | **ĐẠT (PASSED)** |
| 6 | **API tra cứu siêu dữ liệu**: Trả về trạng thái, thời gian chụp, toạ độ (theo quyền), header `Cache-Control: no-store` | `backend/routes/photoMetadataRoutes.js`<br>`backend/app.js` | `backend/__tests__/photoMetadataRoutes.test.js` | **ĐẠT (PASSED)** |
| 7 | **Client trích xuất trước khi nén**: Đọc EXIF ảnh gốc trước khi nén qua canvas; gửi kèm fallback `exif_*` | `frontend/src/utils/imageCompressor.js` | `frontend/src/utils/__tests__/imageCompressor.test.js` | **ĐẠT (PASSED)** |
| 8 | **Đồng bộ ngoại tuyến (Offline Sync)**: Lưu metadata vào IndexedDB và tự động gửi lên server khi có mạng | `frontend/src/lib/diaryDb.js`<br>`frontend/src/services/diarySync.js`<br>`frontend/src/components/DiaryEntryForm.jsx` | `frontend/src/services/__tests__/diarySync.test.js`<br>`frontend/src/pages/__tests__/DiaryOfflineImagesT67.test.jsx` | **ĐẠT (PASSED)** |
| 9 | **Giao diện hiển thị (UI Component)**: `PhotoMetadataPanel` hiển thị thời gian chụp (giờ VN), nguồn, toạ độ, link Google Maps, cảnh báo quyền riêng tư | `frontend/src/components/PhotoMetadataPanel.jsx`<br>`frontend/src/pages/DiaryPage.jsx`<br>`frontend/src/pages/AcceptancePage.jsx` | `frontend/src/components/__tests__/PhotoMetadataPanel.test.jsx` | **ĐẠT (PASSED)** |
| 10 | **Kịch bản Backfill ảnh cũ**: Xử lý lô 100 ảnh, mặc định dry-run an toàn, không log toạ độ | `backend/scripts/backfill-photo-metadata.js` | Node.js script execution | **ĐẠT (PASSED)** |

---

## 2. Kiến trúc giải pháp kỹ thuật

### 2.1. Chuẩn hoá thời gian chụp (`captured_at`)
- **Độ ưu tiên 1 (`exif_offset`)**: Thẻ `DateTimeOriginal` kết hợp `OffsetTimeOriginal`.
- **Độ ưu tiên 2 (`gps_utc`)**: Thẻ `GPSDateStamp` và `GPSTimeStamp` từ vệ tinh GPS.
- **Độ ưu tiên 3 (`assumed_local`)**: Chỉ có `DateTimeOriginal` không có múi giờ -> Giả định múi giờ công trường Việt Nam (`UTC+07:00`) rồi quy đổi về UTC.
- **Độ ưu tiên 4 (`client_reported`)**: Ảnh đã bị nén mất EXIF -> nhận fallback từ client gửi kèm.
- **Quy tắc biên**: Từ chối chuỗi rỗng, `0000:00:00 00:00:00`, năm < 2000 hoặc thời điểm trong tương lai vượt quá hiện tại + 24 giờ.

### 2.2. Chuẩn hoá toạ độ GPS (`gps_latitude`, `gps_longitude`)
- Chuyển đổi định dạng DMS (độ, phút, giây) sang số thập phân (Decimal Degrees).
- Áp dụng ký hiệu tham chiếu hướng: Nam (`S`) và Tây (`W`) đổi thành số âm.
- Làm tròn 6 chữ số thập phân (`NUMERIC(9,6)` - sai số khoảng 0.11 mét trên thực địa).
- Kiểm tra miền giá trị: Vĩ độ $\in [-90, 90]$, Kinh độ $\in [-180, 180]$.
- Loại trừ toạ độ rác giả lập $(0, 0)$. Cả hai toạ độ phải cùng tồn tại đồng thời (`(lat IS NULL) = (lon IS NULL)`).
- Sai số vị trí `gps_accuracy_m`: Trích xuất từ `GPSHPositioningError` trong khoảng $(0, 10000]$ mét, làm tròn 2 chữ số thập phân.

### 2.3. Trạng thái siêu dữ liệu (`metadata_status`)
- `complete`: Có đầy đủ cả thời gian chụp và toạ độ GPS hợp lệ.
- `time_only`: Chỉ có thời gian chụp, không có GPS.
- `gps_only`: Chỉ có toạ độ GPS, không có thời gian chụp.
- `none`: Ảnh trơn hợp lệ không có bất kỳ thẻ EXIF/GPS nào.
- `unreadable`: Ảnh có thẻ EXIF nhưng dữ liệu bên trong bị hỏng hoặc cấu trúc không phân tích được.
- `unsupported`: Định dạng tệp không thuộc danh sách hỗ trợ đọc siêu dữ liệu.
- `not_processed`: Ảnh cũ chưa chạy qua script trích xuất siêu dữ liệu.

---

## 3. Phân quyền và Bảo vệ Quyền riêng tư Vị trí

Do toạ độ GPS của ảnh chụp tại công trường phản ánh chính xác vị trí địa lý của người lao động tại thời điểm làm việc, hệ thống áp dụng cơ chế bảo vệ quyền riêng tư nghiêm ngặt:

```
                                  [ Yêu cầu xem ảnh hiện trường ]
                                                │
                                  ┌─────────────┴─────────────┐
                                  ▼                           ▼
                        [ Xem ảnh & thông tin ]     [ Xem toạ độ GPS thô ]
                        Quyền: photo.view_metadata   Quyền: photo.view_gps
                                  │                           │
                                  ▼                           ▼
                           MỌI THÀNH VIÊN            CHỈ CĐT & BAN QUẢN LÝ
                       (CĐT, BQL, KGS, CHT, ĐT, KT)   (chu_dau_tu, ban_quan_ly)
                                  │                           │
                                  ▼                           ▼
                        Nhận: thời gian chụp,      Nhận: vĩ độ, kinh độ,
                        trạng thái, has_gps        sai số, link bản đồ
```

- **Quy tắc API**: Đối với người dùng không có quyền `photo.view_gps`, API tuyệt đối **không trả về khoá `gps`** trong payload JSON (hoàn toàn loại bỏ khỏi object thay vì gán giá trị null).
- **Quy tắc Cache**: Toàn bộ endpoint tra cứu siêu dữ liệu được gắn header HTTP `Cache-Control: no-store` để ngăn chặn các proxy hoặc trình duyệt lưu đệm toạ độ nhạy cảm.
- **Quy tắc Nhật ký (Logging)**: Tuyệt đối không log toạ độ, bán kính sai số hay thời gian chụp vào console hay tệp nhật ký hệ thống.

---

## 4. Danh mục API

### `GET /api/projects/:projectId/photo-metadata/:kind/:photoId`
- **Mục đích**: Tra cứu siêu dữ liệu của một ảnh hiện trường (nhật ký hoặc nghiệm thu).
- **Tham số đường dẫn**:
  - `projectId`: ID dự án (số nguyên dương).
  - `kind`: Loại ảnh (`diary` cho nhật ký, `acceptance` cho nghiệm thu).
  - `photoId`: ID của bản ghi ảnh.
- **Quyền yêu cầu**: Thành viên dự án (`photo.view_metadata`).
- **Phản hồi mẫu cho Ban Quản lý / Chủ đầu tư (Có quyền xem GPS)**:
  ```json
  {
    "status": "complete",
    "status_label": "Đầy đủ thời gian và toạ độ",
    "captured_at": "2026-03-15T07:30:00.000Z",
    "captured_at_source": "exif_offset",
    "source": "file",
    "has_gps": true,
    "gps": {
      "latitude": 10.762622,
      "longitude": 106.660172,
      "accuracy_m": 4.5
    }
  }
  ```
- **Phản hồi mẫu cho Kỹ sư giám sát / Đội trưởng / Kế toán (Không có quyền xem GPS)**:
  ```json
  {
    "status": "complete",
    "status_label": "Đầy đủ thời gian và toạ độ",
    "captured_at": "2026-03-15T07:30:00.000Z",
    "captured_at_source": "exif_offset",
    "source": "file",
    "has_gps": true
  }
  ```

---

## 5. Hướng dẫn Vận hành & Backfill Dữ liệu Cũ

Hệ thống cung cấp kịch bản bảo trì để trích xuất lại siêu dữ liệu cho các ảnh đã tải lên trước khi có Story S-40:

1. **Chạy thử nghiệm (Dry-run - Mặc định, an toàn không ghi DB)**:
   ```bash
   node backend/scripts/backfill-photo-metadata.js
   ```
   Kịch bản sẽ quét qua tất cả các ảnh có `metadata_status = 'not_processed'`, thống kê số lượng và tỷ lệ các trạng thái mà không thay đổi bất kỳ bản ghi nào trong cơ sở dữ liệu.

2. **Chạy cập nhật thực tế vào cơ sở dữ liệu**:
   ```bash
   node backend/scripts/backfill-photo-metadata.js --apply
   ```
   Kịch bản sẽ xử lý theo từng lô 100 ảnh, trích xuất siêu dữ liệu và cập nhật các cột `captured_at`, `gps_latitude`, `gps_longitude`, `metadata_status`.

---

## 6. Báo Cáo Đề Xuất Xử Lý Cho Các Luồng Chưa Triển Khai

Theo phạm vi nhiệm vụ, Story S-40 tập trung hoàn thiện triệt để hai bảng cốt lõi là `diary_entry_attachments` và `acceptance_voucher_photos`. Dưới đây là phương án kiến trúc đề xuất khi mở rộng sang hai luồng còn lại:

### 6.1. Luồng `task_attachments` (Tệp đính kèm nhật ký công việc của Đội trưởng)
- **Hiện trạng**: Bảng `task_attachments` lưu trữ tệp đính kèm của bảng `task_logs` (thường tải qua modal báo cáo tiến độ công việc).
- **Phương án đề xuất**:
  1. Tạo migration bổ sung các cột tương tự: `captured_at`, `captured_at_source`, `gps_latitude`, `gps_longitude`, `gps_accuracy_m`, `metadata_status`, `metadata_source` vào bảng `task_attachments`.
  2. Trong `backend/routes/taskLogRoutes.js`, khi nhận upload qua `multer`, gọi `extractPhotoMetadata(file.buffer, file.mimetype, req.body)` và lưu metadata vào câu lệnh `INSERT`.
  3. Mở rộng `photoMetadataRoutes.js` hỗ trợ thêm `kind = 'task'` nối với `task_logs` và `tasks` để kiểm tra quyền dự án.

### 6.2. Luồng `uploadSessionRoutes` (Tải lên phân đoạn theo Chunk)
- **Hiện trạng**: Hỗ trợ tải các tệp dung lượng lớn theo từng chunk 512KB qua `upload_sessions`.
- **Phương án đề xuất**:
  1. Khi chunk đầu tiên (chunk 0) được gửi lên, hoặc khi toàn bộ các chunks được ghép lại (ghép buffer hoàn chỉnh tại sự kiện hoàn thành session): đọc 256KB đầu tiên của tệp đã ghép để gọi `extractPhotoMetadata`.
  2. Bổ sung các cột metadata vào bảng đích mà `upload_sessions` liên kết tới (dựa trên `diary_entry_id` hoặc `attachment_id`).
  3. Do phiên tải lên có thể hoàn tất bất đồng bộ sau thời điểm người dùng tải, trạng thái ban đầu của session có thể đặt là `not_processed` và chuyển thành `complete`/`time_only`/`none` ngay sau khi ghép file thành công.
