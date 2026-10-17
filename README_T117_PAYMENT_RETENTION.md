# T-117 — Quy tắc tạm giữ thanh toán

Tài liệu này chốt quy tắc được dùng cho S-45/T-116/T-117.

## 1. Tỷ lệ tạm giữ

- Cấu hình theo dự án/hợp đồng.
- Khoảng hợp lệ: **0% đến 100%**, bao gồm hai biên.
- Tối đa **2 chữ số thập phân**.
- Ví dụ hợp lệ: `0`, `5`, `5.25`, `100`.

## 2. Quy tắc làm tròn

Mọi phép tính tiền dùng decimal/BigInt, không dùng `Number`, `parseFloat` hoặc `Math.round`.

Tạm giữ của một đề nghị:

```text
tạm_giữ_gốc = ROUND_HALF_UP(tổng_đề_nghị × tỷ_lệ / 100, 0 VND)
```

Làm tròn **half-up tới đồng VND**:

- `1.010 × 5% = 50,5` → `51 VND`
- `1.001 × 5% = 50,05` → `50 VND`
- tỷ lệ `0%` → tạm giữ `0`
- tỷ lệ `100%` → tạm giữ bằng tổng đề nghị

## 3. Trần tạm giữ

`payment_retention_cap_amount` là tùy chọn:

- `NULL`: không có trần tiền riêng.
- Có giá trị: tổng tạm giữ của các đề nghị **đã duyệt** không vượt trần.

Khi duyệt:

```text
đã_tạm_giữ_trước = SUM(retention_amount của các đề nghị APPROVED trước đó)
còn_lại_theo_trần = MAX(trần - đã_tạm_giữ_trước, 0)
tạm_giữ_kỳ_này = MIN(tạm_giữ_gốc, còn_lại_theo_trần)
```

## 4. Số thực trả và lũy kế

```text
số_thực_trả = tổng_đề_nghị - tạm_giữ_kỳ_này
tạm_giữ_lũy_kế = đã_tạm_giữ_trước + tạm_giữ_kỳ_này
```

Đề nghị `RETURNED` không được tính vào lũy kế đã duyệt.

## 5. Snapshot và khóa dữ liệu

Mỗi đề nghị lưu snapshot:

- `retention_rate`
- `retention_cap_amount`
- `retention_amount`
- `payable_amount`
- `cumulative_retention_amount`

Thay đổi cấu hình của dự án **không cập nhật ngược** các đề nghị đã duyệt.
Khi duyệt, backend khóa dự án trong transaction và tính lại lũy kế từ các đề nghị `APPROVED` để tránh sai số khi có hai thao tác duyệt đồng thời.
