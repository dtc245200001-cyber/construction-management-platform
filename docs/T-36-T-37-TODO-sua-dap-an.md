# TODO Sửa đáp án (T-36, T-37)

Người dùng cần thực hiện các công việc sau vào ngày mai:

- [ ] Tính tay toàn bộ 5 ca thực tế (đã liệt kê trong bảng `T-36-bang-tinh-tay.md`).
- [ ] Mở file `backend/__tests__/fixtures/k01-expected.json`.
- [ ] Ghi đè số liệu tính tay vào mảng `expected` và `projectFinish` của các phần tử trong `actualScenarios`.
- [ ] Thay đổi trường `calculatedBy` thành tên thật của người tính (thay vì "TẠM...").
- [ ] Cập nhật trường `calculatedDate` thành ngày tính toán.
- [ ] Xoá trường `"provisional": true` ở từng ca.
- [ ] Nhờ người thứ hai kiểm tra chéo (có thể thêm trường `verifiedBy`).
- [ ] (Tuỳ chọn) Xoá script tham chiếu `backend/scripts/ref-actual-scenarios.js` hoặc giữ lại làm công cụ đối chiếu sau này.
