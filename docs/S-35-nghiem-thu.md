# Tài Liệu Nghiệm Thu Story S-35 (Task T-88)

**Story S-35**: Quản lý khối lượng và đơn giá hợp đồng cho các hạng mục công việc.  
**Task T-88**: Kiểm thử tính tổng giá trị hợp đồng (số lẻ, cây nhiều tầng, sửa đơn giá và hạng mục cha).

---

## 1. Bảng truy vết tiêu chí nghiệm thu (Traceability Matrix)

| STT | Tiêu chí nghiệm thu của S-35 | File Test chứng minh | Nhóm test / Test case cụ thể | Trạng thái |
|---|---|---|---|---|
| 1 | **(1) Khai được khối lượng, đơn vị, đơn giá cho hạng mục lá** | `backend/__tests__/integration/contractTotals.test.js`<br>`frontend/src/pages/__tests__/ContractQuantityPage.test.jsx` | • T2 (Khai từng lá cây A qua PUT hợp lệ)<br>• Test 5 (Form điền sẵn giá trị, gửi payload chuẩn) | **ĐẠT (PASSED)** |
| 2 | **(2) Hạng mục cha hiện giá trị hợp đồng cộng từ các lá** | `backend/__tests__/integration/contractTotals.test.js`<br>`frontend/src/pages/__tests__/ContractQuantityTotals.test.jsx` | • T2 (Kiểm tra cây A nguyên vẹn & S1-S4)<br>• T3 (V1, V2, V5 - Kiểm chéo ba chiều API, Oracle, SQL CTE)<br>• F1 & F2 (Màn hình hiển thị đúng tổng cha và tổng dự án) | **ĐẠT (PASSED)** |
| 3 | **(3) Hạng mục cha không khai trực tiếp được** | `backend/__tests__/integration/contractGuardsAndPermissions.test.js`<br>`frontend/src/pages/__tests__/ContractQuantityTotals.test.jsx` | • T6a (DB Constraint 23514 chặn UPDATE/INSERT cha)<br>• T6b (API PUT lên cha trả 422 Unprocessable Entity)<br>• T6c (WBS POST/PUT bỏ qua trường tiền, chặn tạo/chuyển con dưới lá có giá trị)<br>• F6 (Không dòng cha nào có nút Khai/Sửa/Xoá) | **ĐẠT (PASSED)** |
| 4 | **NFR: Số thập phân chính xác, không dùng số thực dấu phẩy động** | `backend/__tests__/exactDecimal.test.js`<br>`backend/__tests__/contractFloatGuard.test.js`<br>`backend/__tests__/integration/contractTotalsFuzz.test.js`<br>`frontend/src/pages/__tests__/ContractQuantityTotals.test.jsx` | • T1 (Máy tính đối chứng BigInt tự kiểm V1-V4)<br>• T4 (V3 biên cực đại 27 chữ số, V4 quy mô 2000 lá)<br>• T5 (Fuzz testing 30 hạt giống, bất biến I1-I6)<br>• T10 & F8 (Quét mã nguồn tĩnh cấm `parseFloat`, `toFixed`, `Math.round`, kiểu `float/real`) | **ĐẠT (PASSED)** |

---

## 2. Quy tắc làm tròn tiền tệ và khối lượng

* **Nguyên tắc số học**:
  * Mỗi hạng mục lá: $\text{contract\_value} = \text{ROUND}(\text{quantity} \times \text{unit\_price}, 2)$ (làm tròn nửa lên ra xa số 0 — *round half-up* tại từng lá riêng biệt).
  * Hạng mục cha: $\text{contract\_total} = \sum \text{contract\_value}$ (cộng dồn các giá trị đã làm tròn của toàn bộ cây con cháu).
* **Phân biệt cách làm tròn đúng vs làm tròn sai**:
  * Ví dụ với Cây A (nhánh A gồm 3 lá: A1 = $333.333 \times 3.00 \to 1000.00$, A2 = $2.675 \times 1.00 \to 2.68$, A3 = $1.005 \times 1.00 \to 1.01$):
    * **Cách tính ĐÚNG (Hệ thống áp dụng)**: $1000.00 + 2.68 + 1.01 = \mathbf{1003.69}$.
    * **Cách tính SAI (cộng gộp chưa làm tròn)**: $999.999 + 2.675 + 1.005 = 1003.679 \to \text{làm tròn thành } 1003.68$ *(SAI lệch 1 xu so với nguyên tắc kế toán từng dòng)*.

---

## 3. Bảng quyết định thiết kế (Design Decisions)

1. **Danh sách đơn vị tính hợp lệ (15 đơn vị)**:
   * `m`, `m2`, `m3`, `md`, `kg`, `tấn`, `lít`, `cái`, `bộ`, `cây`, `viên`, `tấm`, `công`, `ca`, `trọn gói`.
2. **Phân quyền truy cập khối lượng & giá trị hợp đồng**:
   * `chu_dau_tu`, `ban_quan_ly`: Xem đầy đủ đơn giá, thành tiền; được phép khai/sửa/xoá (`PUT`, `DELETE`).
   * `ke_toan`: Xem đầy đủ (`can_view_prices: true`), chỉ đọc (không có nút Khai/Sửa, `PUT`/`DELETE` trả `403`).
   * `ky_su_giam_sat`, `chi_huy_truong`: Chỉ xem khối lượng và đơn vị (`can_view_prices: false`), hoàn toàn không thấy và không nhận được dữ liệu đơn giá/thành tiền/tổng tiền (quét JSON sạch 100%).
   * `doi_truong`: Bị cấm truy cập (`403 Forbidden`).
3. **Định nghĩa hạng mục lá**:
   * Hạng mục lá là hạng mục **không có bất kỳ work_item con nào** trực thuộc.
   * Các công việc thi công ở bảng `tasks` trực thuộc một hạng mục **không** làm hạng mục đó trở thành cha (lá có task vẫn khai báo khối lượng hợp đồng bình thường).
4. **Hành vi khi xoá và chuyển cấu trúc WBS**:
   * `DELETE /api/categories/:projectId/:id`: Trả về `409 Conflict` nếu hạng mục đang chứa con (chặn xoá lan). Khi xoá hạng mục lá, nếu nó là con duy nhất thì nút cha trở thành nút lá chưa khai báo giá trị.
   * `PATCH /api/categories/:projectId/:id/move`: Chặn chu trình, khoá giao dịch chống race condition. Chặn di chuyển con vào dưới lá đã khai báo giá trị (`422`).

---

## 4. Hướng dẫn chạy kiểm thử (Test Execution Guide)

### Biến môi trường bắt buộc (PowerShell)
```powershell
$env:CI="true"
$env:DATABASE_URL="postgres://postgres:postgres123@localhost:5433/construction_db_test"
$env:SESSION_SECRET="ci-test-secret"
$env:ALLOW_PUBLIC_REGISTER="true"
```

### Chạy các nhóm kiểm thử
1. **Kiểm tra máy tính đối chứng và quét mã cấm số thực**:
   ```powershell
   cd backend
   npx jest exactDecimal.test.js contractFloatGuard.test.js --runInBand --forceExit
   ```
2. **Kiểm tra cây cố định Cây A và kịch bản S1-S4 (T2, T3, T4)**:
   ```powershell
   npx jest contractTotals.test.js --runInBand --forceExit
   ```
3. **Kiểm thử ngẫu nhiên Fuzz Testing (T5)**:
   * Chạy mặc định 30 hạt giống:
     ```powershell
     npx jest contractTotalsFuzz.test.js --runInBand --forceExit
     ```
   * Chạy mở rộng số hạt giống (ví dụ 50 hạt giống):
     ```powershell
     $env:CONTRACT_FUZZ_SEEDS="50"
     npx jest contractTotalsFuzz.test.js --runInBand --forceExit
     ```
   * **Cách tái hiện hạt giống bị lỗi**: Nếu Seed #X bị lỗi, terminal sẽ in toàn bộ `Action History` và mã seed. Chỉ cần đặt cấu hình chạy seed đó để debug.
4. **Kiểm tra cửa sau, phân quyền, cô lập, tranh chấp (T6, T7, T8, T9)**:
   ```powershell
   npx jest contractGuardsAndPermissions.test.js --runInBand --forceExit
   ```
5. **Kiểm thử giao diện Frontend (F1 đến F8)**:
   ```powershell
   cd ../frontend
   npm test
   ```

---

## 5. Ghi chú chuyển tiếp cho Story S-36 và Story S-46

1. **Lấy tổng trực tiếp từ API**:
   * Các story tiếp theo (S-36 nghiệm thu theo tiến độ, S-46 thanh toán khối lượng) khi hiển thị hoặc tính tỷ lệ giải ngân **phải sử dụng trực tiếp trường `contract_total` và `project_total` do API backend trả về**.
   * **Tuyệt đối KHÔNG tự cộng dồn lại** các dòng trên giao diện frontend để tránh sai số hiển thị hoặc lệch pha quy tắc làm tròn.
2. **Xử lý số học phía client/server**:
   * Mọi phép tính nếu có ở client phải dùng thư viện chuỗi `BigInt` (như `frontend/src/utils/decimal.js`), tuyệt đối không ép kiểu sang số thực `Number()` hay `parseFloat()`.

---

## 6. Giới hạn đã biết (Known Limitations)

1. Cột `contract_value` trong PostgreSQL được sinh tự động (`GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED`), do đó không thể và không được phép can thiệp ghi đè bằng lệnh INSERT/UPDATE thủ công.
2. Hiệu năng tính cây đệ quy qua CTE trên Postgres phản hồi dưới 200 ms cho cây 1000 hạng mục. Nếu quy mô dự án vượt trên 10.000 hạng mục, khuyến nghị bổ sung bảng snapshot materialized view cho báo cáo kế toán.

---

### Xác nhận kiểm thử tay độc lập:
* **Người kiểm lại bằng tay**: `____________________________________`
* **Ngày kiểm**: `________________________`
