# Construction Management Platform

## 1. Chạy ở máy cá nhân (Local Development)

Dự án này sử dụng Docker để giả lập môi trường Database và có thể dễ dàng chạy ứng dụng trên máy cá nhân mà không cần cài đặt nhiều phụ thuộc phức tạp (ngoại trừ Docker và Node.js). 

Hãy thực hiện lần lượt các bước sau:

1. **Cài đặt Docker & Node.js:** Đảm bảo máy tính của bạn đã cài đặt [Docker Desktop](https://www.docker.com/products/docker-desktop) và [Node.js](https://nodejs.org/).
2. **Cấu hình Biến môi trường:** 
   ```bash
   cp .env.example .env
   ```
   *(Bạn có thể giữ nguyên các thông số trong `.env` để phát triển tại local).*
3. **Khởi động Database:** 
   ```bash
   docker compose up -d
   ```
   *(Lệnh này sẽ khởi động PostgreSQL và PgAdmin ở chế độ background).*
4. **Cài đặt thư viện Backend:** 
   ```bash
   cd backend
   npm ci
   ```
5. **Chạy Migration Database:**
   ```bash
   npm run migrate:up
   ```
6. **Khởi động Backend:** 
   ```bash
   npm run dev
   ```
7. **Khởi động Frontend:** Mở một terminal mới, chuyển vào thư mục `frontend` và chạy:
   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

## 2. Biến môi trường

Toàn bộ các cấu hình được quản lý qua biến môi trường. Vui lòng xem file `.env.example` để biết chi tiết. Một số biến quan trọng:
- `DATABASE_URL`: Chuỗi kết nối Database.
- `SESSION_SECRET`: Bí mật để mã hóa session (BẮT BUỘC trên môi trường Production/Staging).
- `CORS_ORIGINS`: Danh sách các domain Frontend được phép gọi API.

## 3. Khôi phục & Xử lý sự cố (Troubleshooting)

- **Lỗi Migration:** Nếu bạn chạy lỗi migration hoặc muốn lùi db, có thể dùng `npm run migrate:down`.
- **Dọn dẹp hoàn toàn Docker:** Để làm mới cơ sở dữ liệu nếu có lỗi dữ liệu nặng nề (mất toàn bộ dữ liệu ở máy local):
  ```bash
  docker compose down -v
  docker compose up -d
  ```
- **Port Conflict (Cổng đã được sử dụng):** Nếu cổng 5432, 3000 hoặc 5173 đã bị chiếm dụng, hãy tắt các dịch vụ đang chạy cổng này hoặc đổi port trong file `.env` và `docker-compose.yml`.
- **Login hoạt động trên online nhưng không hoạt động trên localhost:** Đây thường là lỗi cookie/session cross-site. Khi frontend chạy ở localhost nhưng backend đang ở domain khác, browser sẽ chặn cookie nếu `SameSite`/`Secure` không phù hợp. Cần thêm domain của frontend vào `CORS_ORIGINS` và thiết lập:
  ```bash
  CORS_ORIGINS=http://localhost:5173,https://your-online-domain.com
  COOKIE_SAMESITE=none
  COOKIE_SECURE=true
  ```
  Nếu chạy local hoàn toàn trên localhost, giữ `COOKIE_SAMESITE=lax` và `COOKIE_SECURE=false`.

## 4. Triển khai (Deployment)

Hệ thống sử dụng cơ chế Deploy Blue/Green với Docker trên môi trường Staging.
Quy trình được tự động hóa qua GitHub Actions.

### Cấu hình Secrets cho GitHub Actions
Bạn cần thiết lập 4 Secrets sau trên GitHub (Settings > Secrets and variables > Actions):
1. `STAGING_HOST`: Địa chỉ IP/Domain của máy chủ Staging.
2. `STAGING_USER`: Tên user truy cập SSH (thay cho STAGING_SSH_USER cũ).
3. `STAGING_SSH_KEY`: Private SSH Key để đăng nhập.
4. `GHCR_PAT` (hoặc bí mật thứ 4 tùy chọn nếu dùng repo private để pull image).

### Luồng Deploy tự động (Blue/Green)
1. Kéo Image mới về server.
2. Chạy container mới (phiên bản Green) song song với container cũ (Blue).
3. Container mới thực hiện **Migration DB** trực tiếp trong lúc khởi động (hoặc qua bước migrate độc lập).
4. Kiểm tra sức khỏe (Healthcheck) qua endpoint `/api/ready`.
5. Nếu container mới KHỎE và migration thành công: Chuyển lưu lượng Nginx sang container mới, sau đó tắt container cũ.
6. Nếu container mới LỖI: Hủy container mới, hệ thống vẫn dùng container cũ không bị gián đoạn.

## 5. Rollback thủ công

Trong trường hợp luồng deploy bị kẹt hoặc cần rollback về bản cũ:
1. SSH vào server staging.
2. Xác định tên container cũ đang chạy hoặc chạy lệnh lùi phiên bản image:
   ```bash
   docker stop construction_backend_staging_new || true
   docker rm construction_backend_staging_new || true
   # Đảm bảo container chính chạy lại:
   docker start construction_backend_staging
   ```

## 6. API quan hệ phụ thuộc giữa các công việc

a) Endpoint: `POST /api/projects/:projectId/dependencies`. Cần đăng nhập, chỉ vai trò ban_quan_ly của dự án đó.
b) Body JSON: `predecessor_id` (số nguyên dương, id bảng tasks), `successor_id` (như trên), `dependency_type` (FS, SS, FF hoặc SF, mặc định FS), `lead_lag_days` (số nguyên, cho phép âm, mặc định 0). Nêu rõ predecessor_id và successor_id là id của bảng tasks, không phải work_items.
c) Bảng mã phản hồi:
   - 201: tạo thành công, trả về dependency vừa tạo.
   - 400: dữ liệu sai (id không hợp lệ, loại quan hệ sai, lead_lag_days không phải số nguyên) hoặc công việc không thuộc dự án này.
   - 403: không thuộc dự án hoặc không đủ vai trò.
   - 409: cặp công việc này đã có quan hệ.
   - 422: quan hệ sẽ tạo vòng phụ thuộc (kể cả tự trỏ). Quan hệ KHÔNG được lưu.
d) Ví dụ phản hồi 422:
```json
{
  "code": "DEPENDENCY_CYCLE",
  "message": "Không thể tạo quan hệ vì sẽ tạo vòng phụ thuộc: A → B → A",
  "cycleIds": [1, 2],
  "cycleNames": ["A", "B"],
  "cyclePath": "A → B → A"
}
```
e) Giải thích: việc kiểm tra chạy trong cùng giao dịch, trước khi INSERT, có khoá theo dự án để hai yêu cầu đồng thời không tạo vòng; dùng detectCycle ở backend/algorithms/cpm.js (T-17).
f) Ví dụ curl cho trường hợp tạo vòng:
```bash
curl -X POST http://localhost:3000/api/projects/PID/dependencies \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your_cookie" \
  -d '{
    "predecessor_id": B_ID,
    "successor_id": A_ID,
    "dependency_type": "FS",
    "lead_lag_days": 0
  }'
```
g) Lưu ý: hệ thống chỉ chặn khi chính quan hệ mới nằm trên một vòng; nếu dữ liệu cũ đã có vòng ở chỗ khác thì quan hệ không liên quan vẫn lưu được, và vòng cũ sẽ được báo ở màn hình tính tiến độ.

## 7. Quyết định kỹ thuật — T-29 (Chọn SVG hay Canvas cho Gantt Chart)

**Bảng số đo với 500 thanh công việc (Tạo bằng CDP CPU Throttling Rate = 4)**

| Công nghệ | Trạng thái CPU | Thời gian Render (ms) | FPS khi cuộn ngang (3s) |
| :--- | :--- | :--- | :--- |
| **SVG** | Bình thường | 415.90 ms | 61.00 |
| **SVG** | Throttle 4x | 967.30 ms | 61.33 |
| **Canvas** | Bình thường | 246.40 ms | 60.33 |
| **Canvas** | Throttle 4x | 968.60 ms | 60.33 |

**Quyết định:** Chọn **SVG**.
**Lý do:**
1. Cả SVG và Canvas đều đạt FPS tối đa (~60 FPS) khi cuộn ngang, ngay cả khi CPU bị bóp nghẹt 4 lần (mô phỏng điện thoại tầm trung).
2. Thời gian render ban đầu của Canvas nhanh hơn ở CPU bình thường, nhưng khi throttle 4x thì cả hai đều ngang ngửa nhau (~960ms). Với 500 DOM nodes (của SVG), trình duyệt hiện đại hoàn toàn có thể xử lý mượt mà.
3. Việc dùng SVG với React giúp code dễ bảo trì hơn, hỗ trợ tốt các tương tác (onClick, hover, tooltip, styling CSS) so với Canvas. Bù đắp cho việc tăng một chút xíu thời gian render lần đầu.

## 8. Bộ ca kiểm thử tiến độ (S-10)

Tệp `backend/__tests__/fixtures/k01-expected.json` là nơi chứa đáp án tính tay của K-01, hai mạng T-23 và năm ca từng loại quan hệ.
Ý nghĩa các trường `calculatedBy`/`calculatedDate`/`verifiedBy`/`verifiedDate`: dùng để ghi nhận con người đã tính toán và kiểm tra chéo các con số (không tự động điền bằng máy).
Quy tắc: "đáp án không được sinh từ chính mã", mọi con số phải do người tính tay và nhập vào JSON. Người không viết mã chỉ cần đọc JSON này để đối chiếu.

Cách chạy bộ ca:
```bash
cd backend
npx jest __tests__/scheduleAlgorithms
```

Cách thêm một mạng mới: thêm một phần tử vào mảng `networks` theo cấu trúc hiện có.

## Khôi phục khi mất dữ liệu

Hệ thống hỗ trợ khôi phục PostgreSQL từ file backup `.dump` được tạo bởi cơ chế backup định kỳ.

### Điều kiện

- Backup được lưu trong thư mục `/backups` của backup container.
- Chỉ khôi phục vào một database rỗng, không phải database đang được ứng dụng sử dụng.
- Không khôi phục trực tiếp vào database `construction_db`.

### Thực hiện khôi phục

Tạo hoặc sử dụng một database đích rỗng và chạy:

```bash
docker exec construction_db_backup_staging \
  sh /usr/local/bin/restore.sh construction_restore_test
```

Script sẽ:

1. Chọn file backup mới nhất.
2. Kiểm tra database đích.
3. Từ chối nếu database đích là database đang chạy của ứng dụng.
4. Từ chối nếu database đích đã có dữ liệu.
5. Restore backup bằng `pg_restore`.
6. In số lượng bản ghi của từng bảng sau khi restore.

### Kiểm tra sau khi khôi phục

Trong quá trình kiểm thử T-47, kết quả sau khi restore khớp với database nguồn:

| Bảng | Database nguồn | Database restore |
|---|---:|---:|
| `users` | 3 | 3 |
| `projects` | 2 | 2 |
| `project_members` | 4 | 4 |
| `roles` | 6 | 6 |

Việc kiểm thử cũng xác nhận rằng script từ chối restore trực tiếp vào database đang chạy của ứng dụng.

## Khối lượng và đơn giá hợp đồng (S-35, T-85)

### Bảng cấu trúc cột (bảng `work_items`)

| Tên cột | Kiểu dữ liệu | Ý nghĩa | Ràng buộc |
|---|---|---|---|
| `quantity` | `NUMERIC(14,3)` | Khối lượng hợp đồng của hạng mục lá | Cho phép `NULL`, `>= 0` (`work_items_quantity_non_negative`) |
| `unit` | `VARCHAR(30)` | Đơn vị tính hợp đồng (m3, m2, tấn...) | Cho phép `NULL`, không rỗng, đã trim khoảng trắng đầu/cuối (`work_items_unit_trimmed_not_empty`) |
| `unit_price` | `NUMERIC(16,2)` | Đơn giá hợp đồng của hạng mục lá | Cho phép `NULL`, `>= 0` (`work_items_unit_price_non_negative`) |
| `contract_value` | `NUMERIC(30,2)` | Thành tiền / giá trị hợp đồng của hạng mục lá | Cột sinh tự động: `GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED` |

- Ràng buộc phối hợp `work_items_contract_all_or_none`: hoặc cả 3 cột (`quantity`, `unit`, `unit_price`) đều `NULL`, hoặc cả 3 cột đều `NOT NULL`.
- Cột sinh `contract_value` được bảo vệ: PostgreSQL từ chối can thiệp trực tiếp (lỗi mã `428C9`).

### Định nghĩa hạng mục lá
- Hạng mục lá là `work_item` không có bất kỳ hạng mục con nào (`parent_id = item.id`).
- Công việc ở bảng `tasks` trực thuộc hạng mục KHÔNG tính là hạng mục con. Hạng mục lá có chứa tasks vẫn được phép khai báo khối lượng, đơn vị và đơn giá hợp đồng bình thường.

### Quy tắc làm tròn của `contract_value`
- Giá trị hợp đồng của từng lá được làm tròn bằng hàm `ROUND` của PostgreSQL: `ROUND(quantity * unit_price, 2)` (quy tắc làm tròn nửa ra xa số 0 - round half away from zero).
- Mỗi hạng mục lá làm tròn độc lập trước khi lưu trữ (`STORED`).
- Giá trị hợp đồng của hạng mục cha sau này sẽ bằng tổng (`SUM`) các giá trị `contract_value` đã làm tròn của các hạng mục lá con cháu. Nhờ đó, tổng ở cha luôn khớp tuyệt đối 100% với các lá, không có độ lệch số học do làm tròn sau phép cộng.

### Ba lưu ý quan trọng cho lập trình viên T-86 (API) và T-87 (Giao diện)
1. **Kiểu dữ liệu và định dạng chuỗi**:
   - Thư viện `pg` trả về kiểu `NUMERIC` dưới dạng `string` (chuỗi ký tự).
   - **TUYỆT ĐỐI KHÔNG** dùng `Number()`, `parseFloat()`, hay các phép toán số thực (`+`, `-`, `*`, `/`) nguyên bản của JavaScript trên các cột này để tránh lỗi mất độ chính xác dấu phẩy động nhị phân (binary floating-point).
   - Nếu cần tính toán ở tầng backend/frontend, hãy sử dụng thư viện số học thập phân chính xác (như `decimal.js`, `bignumber.js`) hoặc ủy quyền cho SQL (`SUM()`, `ROUND()`).
2. **Kiểm tra số chữ số thập phân ở API (chống làm tròn im lặng)**:
   - PostgreSQL tự động làm tròn im lặng các số vượt quá scale của cột (ví dụ `1.0005` thành `1.001` cho `numeric(14,3)` và `0.005` thành `0.01` cho `numeric(16,2)`).
   - Do database không chủ động từ chối, tầng API (T-86) **BẮT BUỘC** phải validate dữ liệu đầu vào: từ chối các giá trị có quá 3 chữ số thập phân đối với `quantity` và quá 2 chữ số thập phân đối với `unit_price`.
3. **Ánh xạ lỗi cơ sở dữ liệu sang thông báo người dùng**:
   - Khi trigger hoặc constraint cơ sở dữ liệu phát hiện vi phạm, Postgres trả về mã lỗi:
     - `23514` (`check_violation`):
       - `work_items_contract_leaf_only`: Ánh xạ sang thông báo tiếng Việt giải thích hạng mục cha không được khai giá trị hoặc không được thêm con vào cha đã có giá trị.
       - `work_items_contract_all_or_none`: Phải nhập đồng thời cả khối lượng, đơn vị tính và đơn giá.
       - `work_items_quantity_non_negative`: Khối lượng hợp đồng không được âm.
       - `work_items_unit_price_non_negative`: Đơn giá hợp đồng không được âm.
       - `work_items_unit_trimmed_not_empty`: Đơn vị tính không được rỗng hoặc chứa khoảng trắng thừa.
     - `22003` (`numeric_value_out_of_range`): Số lượng hoặc đơn giá vượt quá giới hạn lưu trữ cho phép.
     - `22001` (`string_data_right_truncation`): Đơn vị tính vượt quá 30 ký tự.

### Phân biệt với `tasks.planned_quantity`
- `work_items.quantity` / `unit` / `unit_price`: Khối lượng và đơn giá HỢP ĐỒNG ký kết với chủ đầu tư/nhà thầu cho từng hạng mục công việc WBS (Story S-35).
- `tasks.planned_quantity` / `quantity_unit`: Khối lượng KẾ HOẠCH thi công chi tiết của từng đầu việc (task) do đội thi công thực hiện (Story S-26). Hai khái niệm này độc lập và không thay thế cho nhau.

## API khối lượng và đơn giá hợp đồng (S-35, T-86)

### 1. Bảng phân quyền (Server-side Role Matrix)

| Endpoint | Phương thức | Quyền xem/thao tác | Mô tả phản hồi |
|---|---|---|---|
| `/api/projects/:projectId/contract-quantities` | `GET` | `CHU_DAU_TU`, `BAN_QUAN_LY`, `KE_TOAN` | Đầy đủ: gồm `quantity`, `unit`, `unit_price`, `contract_value`, `contract_total` và `project_total`. |
| `/api/projects/:projectId/contract-quantities` | `GET` | `KY_SU_GIAM_SAT`, `CHI_HUY_TRUONG` | Chỉ khối lượng: BỎ HẲN các khoá giá (`unit_price`, `contract_value`, `contract_total`, `project_total`). |
| `/api/projects/:projectId/contract-quantities` | `GET` | `DOI_TRUONG`, người ngoài dự án | Từ chối: `403 Forbidden`. |
| `/api/projects/:projectId/work-items/:workItemId/contract-quantity` | `PUT` | `CHU_DAU_TU`, `BAN_QUAN_LY` | Cập nhật khối lượng, đơn vị, đơn giá cho hạng mục lá (`200 OK`). Các vai trò khác: `403`. |
| `/api/projects/:projectId/work-items/:workItemId/contract-quantity` | `DELETE` | `CHU_DAU_TU`, `BAN_QUAN_LY` | Xoá giá trị (đưa về NULL - idempotent `200 OK`). Các vai trò khác: `403`. |

### 2. Danh sách Endpoint & Định dạng dữ liệu

#### 2.1. GET `/api/projects/:projectId/contract-quantities`
- Header: `Cache-Control: no-store`
- Phản hồi mẫu (đầy đủ giá - `can_view_prices = true`):
```json
{
  "project_id": 1,
  "can_view_prices": true,
  "units": ["m", "m2", "m3", "md", "kg", "tấn", "lít", "cái", "bộ", "cây", "viên", "tấm", "công", "ca", "trọn gói"],
  "items": [
    {
      "id": 10,
      "parent_id": null,
      "code": "HM-01",
      "name": "Phần ngầm",
      "is_leaf": false,
      "quantity": null,
      "unit": null,
      "unit_price": null,
      "contract_value": null,
      "contract_total": "1003.69"
    },
    {
      "id": 11,
      "parent_id": 10,
      "code": "HM-01.01",
      "name": "Đào đất móng",
      "is_leaf": true,
      "quantity": "333.333",
      "unit": "bộ",
      "unit_price": "3.00",
      "contract_value": "1000.00",
      "contract_total": "1000.00"
    }
  ],
  "project_total": "1003.69"
}
```
- Phản hồi mẫu (chỉ khối lượng - `can_view_prices = false`):
```json
{
  "project_id": 1,
  "can_view_prices": false,
  "units": ["m", "m2", "m3", "md", "kg", "tấn", "lít", "cái", "bộ", "cây", "viên", "tấm", "công", "ca", "trọn gói"],
  "items": [
    {
      "id": 11,
      "parent_id": 10,
      "code": "HM-01.01",
      "name": "Đào đất móng",
      "is_leaf": true,
      "quantity": "333.333",
      "unit": "bộ"
    }
  ]
}
```

#### 2.2. PUT `/api/projects/:projectId/work-items/:workItemId/contract-quantity`
- Body mẫu:
```json
{
  "quantity": "1234.567",
  "unit": "m3",
  "unit_price": "89000.50"
}
```
- Phản hồi thành công `200 OK`:
```json
{
  "id": 11,
  "quantity": "1234.567",
  "unit": "m3",
  "unit_price": "89000.50",
  "contract_value": "109877080.28"
}
```

#### 2.3. DELETE `/api/projects/:projectId/work-items/:workItemId/contract-quantity`
- Phản hồi thành công `200 OK` (idempotent):
```json
{
  "id": 11,
  "quantity": null,
  "unit": null,
  "unit_price": null,
  "contract_value": null
}
```

### 3. Quy tắc kiểm tra số thập phân và đơn vị tính
- **Số thập phân**:
  - `quantity`: tối đa 11 chữ số nguyên, tối đa 3 chữ số thập phân (`NUMERIC(14,3)`).
  - `unit_price`: tối đa 14 chữ số nguyên, tối đa 2 chữ số thập phân (`NUMERIC(16,2)`).
  - Từ chối số âm, phân tách hàng nghìn bằng dấu chấm `"1.000.000"`, dấu phẩy, dạng khoa học `"1e3"`, chuỗi rỗng.
  - Phần thập phân thừa toàn số 0 được chấp nhận và cắt gọn (ví dụ `"1.2300"` -> lưu `"1.230"`). Phần thập phân thừa khác 0 bị từ chối để chống Postgres làm tròn im lặng.
- **Đơn vị tính**:
  - Tự động chuẩn hoá Unicode NFC, trim khoảng trắng, hỗ trợ ký hiệu mũ `"m²" -> "m2"`, `"m³" -> "m3"`.
  - So khớp không phân biệt hoa thường với danh mục chuẩn: `m`, `m2`, `m3`, `md`, `kg`, `tấn`, `lít`, `cái`, `bộ`, `cây`, `viên`, `tấm`, `công`, `ca`, `trọn gói`.

### 4. Bảng mã lỗi HTTP trả về
- `200 OK`: Thành công.
- `400 Bad Request`: Tham số ID sai, đơn vị tính không hợp lệ, hoặc dữ liệu số sai định dạng (trả về `{ message, errors: { quantity, unit, unit_price } }` gom toàn bộ lỗi).
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Người dùng không có quyền trên endpoint này hoặc không thuộc dự án.
- `404 Not Found`: Không tìm thấy hạng mục trong dự án (`"Không tìm thấy hạng mục"`).
- `422 Unprocessable Entity`: Cố tình khai khối lượng cho hạng mục cha (`"Hạng mục cha không khai khối lượng hợp đồng trực tiếp; hãy khai ở các hạng mục lá bên dưới (hiện có N hạng mục con)."`).

### 5. Lệnh cURL mẫu
```bash
# 1. Đăng nhập lấy cookie
curl -i -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bql@company.com","password":"Password123"}'

# 2. Đọc danh sách khối lượng và giá trị hợp đồng
curl -X GET http://localhost:5000/api/projects/1/contract-quantities \
  -b "cmp.sid=s%3AosBnnoMXD1SJEj56..."

# 3. Cập nhật khối lượng hợp đồng cho hạng mục lá ID 5
curl -X PUT http://localhost:5000/api/projects/1/work-items/5/contract-quantity \
  -b "cmp.sid=s%3AosBnnoMXD1SJEj56..." \
  -H "Content-Type: application/json" \
  -d '{"quantity":"1234.567","unit":"m3","unit_price":"89000.50"}'

# 4. Xoá khối lượng hợp đồng
curl -X DELETE http://localhost:5000/api/projects/1/work-items/5/contract-quantity \
  -b "cmp.sid=s%3AosBnnoMXD1SJEj56..."
```