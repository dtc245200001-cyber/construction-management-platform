# TODO Sửa đáp án (T-36, T-37)

Người dùng cần thực hiện các công việc sau vào ngày mai:

- [ ] Tính tay toàn bộ 5 ca thực tế (T-36) (đã liệt kê trong bảng `T-36-bang-tinh-tay.md`).
- [ ] Tính tay toàn bộ 5 ca chênh lệch và ngày mới găng (T-37):
  - `T37_ca1_gang_tre_3_ngay_lam_viec`: Việc găng trễ 3 ngày làm việc.
  - `T37_ca2_khong_gang_tre_it_hon_float`: Việc không găng trễ ít hơn float, delay = 0.
  - `T37_ca3_ngay_khoi_cong_chenh_vat_qua_chu_nhat`: Ngày khởi công + chênh vắt qua chủ nhật.
  - `T37_ca4_co_ngay_le_giua_hai_moc`: Ca có ngày lễ giữa hai mốc.
  - `T37_ca5_le_trung_chu_nhat`: Ca lễ trùng chủ nhật.
- [ ] Mở file `backend/__tests__/fixtures/k01-expected.json`.
- [ ] Ghi đè số liệu tính tay vào mảng `expected` và `projectFinish` của các phần tử trong `actualScenarios`.
- [ ] Thay đổi trường `calculatedBy` thành tên thật của người tính (thay vì "TẠM...").
- [ ] Cập nhật trường `calculatedDate` thành ngày tính toán.
- [ ] Xoá trường `"provisional": true` ở từng ca.
- [ ] Nhờ người thứ hai kiểm tra chéo (có thể thêm trường `verifiedBy`).
- [ ] (Tuỳ chọn) Xoá script tham chiếu `backend/scripts/ref-actual-scenarios.js` hoặc giữ lại làm công cụ đối chiếu sau này.
