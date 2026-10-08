# Bàn giao cho Antigravity — Sprint 2 CPM + Luồng mời email thật (S-28)

> File này viết cho một AI agent (Antigravity) xử lý trực tiếp trên repo
> `construction-management-platform`. Mọi đường dẫn file đều tương đối so với
> gốc repo. Mọi kết luận "lỗi thật" dưới đây đã được kiểm chứng bằng cách
> chạy migration thật + insert dữ liệu thật trên PostgreSQL 16, KHÔNG suy từ
> đọc code suông. Phần nào chỉ đọc code mà chưa chạy thật sẽ được ghi rõ.

---

## 0. Tóm tắt 1 phút

| Hạng mục | Trạng thái |
|---|---|
| Sprint 1 (3 việc đã yêu cầu sửa trước đó: ngưỡng khoá 5 lần, T-10 đổi cha/chặn xoá, bỏ `continue-on-error`) | ✅ Cả 3 đã có trong bản zip mới, đúng AC |
| Lỗi trong ảnh bạn gửi (`buildGraph` đọc bảng `categories`, cột `work_items.duration`) | ✅ **Đã được sửa** — `algorithms/cpm.js` hiện đọc đúng `tasks`/`dependencies` |
| Lỗi thật vẫn còn, cùng họ với lỗi trong ảnh, nặng hơn | ❌ **`schedule_results` vẫn mô hình hoá theo `work_item`, phải là theo `task`** → mất dữ liệu âm thầm khi một hạng mục có từ 2 công việc trở lên |
| Lỗi thật thứ hai, mới phát hiện | ❌ `routes/publicRoutes.js` — endpoint chấp nhận lời mời cho **người đã có tài khoản** insert vào cột `role_id` **không tồn tại** trong bảng `project_members` → vỡ 500 |
| Luồng mời email thật (S-28 bạn mô tả) | 🟡 **Đã xây ~85%**, đúng gần hết luồng bạn mô tả, nhưng dính đúng lỗi `role_id` ở trên cho nhánh "email đã có tài khoản" |

---

## 1. Đánh giá Sprint 2 (T-11 → T-28) theo đúng backlog

Đối chiếu từng task với code trong `backend/`:

| Task | Nội dung | Trạng thái | Ghi chú |
|---|---|---|---|
| T-11 | Bảng `tasks`, ràng buộc `duration_days > 0` | ✅ | `migrations/1791010000000_create-tasks.js` — đã chạy migrate thật, ràng buộc CHECK hoạt động |
| T-12 | Form khai công việc, chặn 0/âm | ⚠️ Chưa kiểm (frontend) | Có `routes/taskRoutes.js` phía server, chưa xem frontend form |
| T-13 | Bảng `dependencies`, 4 loại quan hệ, unique cặp việc | ✅ | Đã chạy migrate thật, đủ CHECK + UNIQUE |
| T-14 | Form chọn quan hệ, tìm kiếm việc trước | ⚠️ Chưa kiểm (frontend) | |
| T-15 | Dựng đồ thị kề từ `dependencies` | ✅ **Đã sửa đúng** | `algorithms/cpm.js::buildGraph` — xác nhận bằng cách đọc trực tiếp file, không còn truy vấn `categories` |
| T-16 | Sắp tô-pô không đệ quy (Kahn) | ✅ | Có trong `cpm.js::topologicalSort`, có test `cpmSort.test.js` |
| T-17 | Trả về đúng danh sách việc trong vòng | ✅ | `findCycleNodes` trong `cpm.js`, có test `cpmCycle.test.js` |
| T-18 | 4 công thức duyệt xuôi tách riêng | ✅ | `utils/scheduleAlgorithms.js`, có test theo tên loại quan hệ |
| T-19 | Duyệt xuôi, lưu ES/EF | ✅ | Có test khớp bảng đáp án K-01 (`scheduleAlgorithms.k01.test.js`) |
| T-20 | Duyệt ngược, lưu LS/LF | ✅ | cùng file trên |
| T-21 | Tính float, đánh dấu găng | ✅ | |
| T-22 | Bộ ca tự động từ bảng đáp án K-01 | ✅ | `__tests__/fixtures/k01-expected.json` tồn tại, test đọc từ đó |
| T-23 | Mạng đủ 4 loại quan hệ + nhánh song song lệch | ✅ | `scheduleAlgorithms.t23.test.js` |
| T-24 | Chặn vòng khi lưu quan hệ, transaction + khoá | ✅ **Làm tốt** | `routes/dependencyRoutes.js` dùng `pg_advisory_xact_lock`, kiểm tra trong transaction trước khi ghi, trả 422 |
| T-25 | Thông báo vòng bằng tên việc, không bằng id | ✅ | `rotateCycleToStartWith` + map tên trong `dependencyRoutes.js` |
| **T-26** | **Lưu `schedule_results`, một dòng mỗi CÔNG VIỆC** | ❌ **SAI MÔ HÌNH DỮ LIỆU** | Xem mục 2 — bảng và code đang lưu một dòng mỗi **hạng mục**, không phải mỗi **công việc** như AC yêu cầu |
| T-27 | API trả mọi việc kèm 4 mốc trong 1 lần gọi | ❌ Kế thừa lỗi T-26 | `services/scheduleQuery.js` JOIN từ `work_items`, nên liệt kê theo hạng mục chứ không phải theo công việc |
| T-28 | Màn hình bảng tiến độ | ⚠️ Chưa kiểm (frontend) | Phụ thuộc T-27, nên chắc chắn cũng sai theo |

**Kết luận Sprint 2:** 14/18 task chuẩn, nhưng **toàn bộ chuỗi T-26 → T-27 → T-28 (Story S-12, 2 SP) sai từ gốc** — đây là lỗi **cấu trúc dữ liệu**, không phải lỗi vặt, phải sửa migration chứ không chỉ sửa code.

---

## 2. LỖI QUAN TRỌNG NHẤT — `schedule_results` theo nhầm `work_item` thay vì `task`

### 2.1. Bằng chứng thật (đã chạy, không phải suy đoán)

Đã tạo trên Postgres thật: 1 dự án → 1 hạng mục lá → **2 công việc độc lập** (không phụ thuộc nhau), thời lượng 3 ngày và 5 ngày. Gọi thẳng `calculateAndSaveSchedule(projectId)`:

```
savedCount: 1          # phải là 2 (2 công việc) nhưng chỉ lưu 1
results keys: [ '1' ]  # chỉ còn 1 bộ kết quả, của công việc 5 ngày
```

Truy vấn trực tiếp bảng `schedule_results` sau khi tính: **chỉ có 1 dòng**. Kết quả của "Công việc 1" (3 ngày) biến mất hoàn toàn, không báo lỗi, không cảnh báo — **mất dữ liệu âm thầm**.

**Vì sao 140/140 test vẫn xanh:** `__tests__/schedulePersistence.test.js` và `scheduleQuery.test.js` dùng pool giả (mock), không chạy qua PostgreSQL thật với tình huống "1 hạng mục có ≥2 công việc" — đúng kiểu lỗi mà ảnh bạn gửi đã cảnh báo trước đó cho `buildGraph`. Lỗi `buildGraph` cụ thể trong ảnh đã được sửa, nhưng cùng một nguyên nhân gốc (test giả không bắt được lỗi tầng dữ liệu thật) đang lặp lại ở tầng lưu kết quả.

### 2.2. Nguyên nhân gốc (3 điểm, phải sửa cả 3)

1. **`backend/migrations/1790310000000_create-schedule-results.js`** — cột `work_item_id references work_items`, có ràng buộc `UNIQUE (work_item_id)`. Đúng ra phải là `task_id references tasks`, unique theo `task_id`, vì AC của T-26 ghi rõ **"một dòng mỗi công việc"**.
2. **`backend/services/scheduleCalculation.js`** (hàm `calculateAndSaveSchedule`) — đoạn này:
   ```js
   for (const task of tasks) {
     const result = scheduleByTask[task.id];
     if (!result) continue;
     scheduleByWorkItem[task.workItemId] = result;   // <-- GHI ĐÈ nếu 2 task cùng work_item
   }
   ```
   Dòng `scheduleByWorkItem[task.workItemId] = result` khiến công việc sau ghi đè công việc trước nếu chúng chung một hạng mục.
3. **`backend/services/schedulePersistence.js`** — `saveScheduleResults` insert vào cột `work_item_id` (biến đặt tên `workItemId` nhưng giá trị thực chất đến từ object đã lệch nghĩa ở bước 2).

### 2.3. Việc Antigravity cần làm — theo đúng thứ tự

**Bước 1 — Migration mới** (không sửa migration cũ đã chạy trên môi trường khác, tạo migration mới nối tiếp):

```js
// backend/migrations/<timestamp>_fix-schedule-results-task-grain.js
exports.up = (pgm) => {
  pgm.dropConstraint("schedule_results", "schedule_results_work_item_unique");
  pgm.renameColumn("schedule_results", "work_item_id", "task_id");
  // Đổi FK sang tasks
  pgm.sql(`
    ALTER TABLE schedule_results
      DROP CONSTRAINT IF EXISTS schedule_results_work_item_id_fkey;
  `);
  pgm.addConstraint("schedule_results", "schedule_results_task_id_fkey", {
    foreignKey: {
      columns: "task_id",
      references: "tasks",
      onDelete: "CASCADE",
    },
  });
  pgm.addConstraint("schedule_results", "schedule_results_task_unique", {
    unique: "task_id",
  });
};

exports.down = (pgm) => {
  // viết ngược lại tương ứng — đổi tên cột về work_item_id, đổi FK về work_items
};
```
Lưu ý: nếu môi trường staging/production đã có dữ liệu `schedule_results` thật, cần thêm bước `UPDATE` chuyển `work_item_id` cũ sang `task_id` tương ứng (join qua `tasks.work_item_id`) **trước khi** đổi FK, để không mất dữ liệu đang có. Nếu staging chưa có dữ liệu nghiệm thu thật nào dựa trên bảng này (khả năng cao vì tính năng đang lỗi), có thể `TRUNCATE schedule_results` trước khi đổi cột.

**Bước 2 — `services/scheduleCalculation.js`:** xoá hẳn bước gộp theo `workItemId`, lưu thẳng theo `task.id`:
```js
const scheduleByTask = calculateSchedule(tasks, dependencies, sortedOrder, 0);
// Không remap theo work_item nữa — persist thẳng theo task
const savedCount = await saveScheduleResults(scheduleByTask, project.start_date);
```

**Bước 3 — `services/schedulePersistence.js`:** đổi tên biến + cột insert từ `work_item_id` sang `task_id`, bỏ hẳn liên hệ tới `work_items` trong câu `INSERT`/`ON CONFLICT`.

**Bước 4 — `services/scheduleQuery.js`** (T-27): sửa lại để trả về theo **từng công việc**, kèm tên hạng mục cha để hiển thị, đúng AC "mọi việc kèm bốn mốc":
```sql
SELECT
  t.id, t.name, t.work_item_id,
  wi.name AS work_item_name,
  sr.early_start, sr.early_finish, sr.late_start, sr.late_finish,
  sr.total_float, sr.is_critical, sr.calculated_at
FROM tasks t
JOIN work_items wi ON wi.id = t.work_item_id
LEFT JOIN schedule_results sr ON sr.task_id = t.id
WHERE wi.project_id = $1
  AND ($2::boolean IS NULL OR sr.is_critical = $2)
ORDER BY sr.early_start NULLS LAST, t.id
```

**Bước 5 — Cập nhật toàn bộ nơi join `work_items` ↔ `schedule_results`:** grep `sr.work_item_id` và `schedule_results sr ON sr.work_item_id` trong toàn bộ `backend/` (gồm `services/scheduleRecalculation.js` và bất kỳ route nào khác) — đổi hết sang `task_id`.

**Bước 6 — Sửa lại test, và quan trọng hơn: thêm test tích hợp thật (không mock) đúng kịch bản "1 hạng mục có ≥2 công việc"** — đây chính là ca kiểm thử đang thiếu khiến lỗi không bị bắt:
```js
// __tests__/integration/scheduleMultiTaskPerWorkItem.test.js
// Setup thật qua Postgres test DB (không mock pool), tạo 1 work_item có 2 task
// độc lập, gọi calculateAndSaveSchedule, assert savedCount === 2 và
// SELECT COUNT(*) FROM schedule_results WHERE ... = 2
```

**Bước 7 — Kiểm tra frontend (T-28)** có đang hiển thị theo `work_item_id` hay không, nếu có thì sửa theo cấu trúc trả về mới ở Bước 4.

---

## 3. LỖI THẬT THỨ HAI — chấp nhận lời mời cho người đã có tài khoản bị vỡ 500

### 3.1. Bằng chứng thật
`project_members` trên database thật chỉ có cột `role` (varchar), **không có cột `role_id`**:
```
id, project_id, user_id, role, created_at, last_opened_at
```
Chạy thẳng câu SQL y hệt trong code:
```
INSERT INTO project_members (project_id, user_id, role_id) VALUES (1,1,1)
→ LỖI THẬT: column "role_id" of relation "project_members" does not exist
```

### 3.2. Vị trí lỗi
`backend/routes/publicRoutes.js`, endpoint `POST /api/public/invitations/:token/accept` (nhánh dành cho người **đã có tài khoản** bấm link mời) — đoạn:
```js
const roleRes = await client.query('SELECT id FROM roles WHERE name = $1', [invitation.project_role]);
const roleId = roleRes.rows.length > 0 ? roleRes.rows[0].id : 3;
...
'INSERT INTO project_members (project_id, user_id, role_id) VALUES ($1, $2, $3)',
[invitation.project_id, userId, roleId]
```
Trong khi route đúng mẫu ở `routes/authRoutes.js` (nhánh người **mới**, tự đặt mật khẩu) lại làm đúng:
```js
'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
[invitation.project_id, newUser.id, invitation.project_role]
```

### 3.3. Cách sửa (chỉ 1 chỗ, không cần migration)
Trong `routes/publicRoutes.js`, xoá đoạn tra `roles` table lấy `roleId`, insert thẳng bằng `invitation.project_role` (chuỗi, ví dụ `"ky_su_giam_sat"`) giống hệt cách `authRoutes.js` đang làm đúng:
```js
if (invitation.project_id && invitation.project_role) {
  const memberCheck = await client.query(
    'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
    [invitation.project_id, userId]
  );
  if (memberCheck.rows.length === 0) {
    await client.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
      [invitation.project_id, userId, invitation.project_role]
    );
  }
}
```
Sau khi sửa, thêm test tích hợp thật gọi đúng endpoint này với DB thật (không mock), vì đây chính xác là loại lỗi mà test mock đã để lọt.

---

## 4. Luồng mời email thật (S-28) — hiện trạng so với yêu cầu của bạn

Tin tốt: **phần lớn luồng bạn mô tả đã được xây sẵn**, khá sát với đúng mô tả 3 bước của bạn. Đối chiếu:

| Bạn mô tả | Đã có trong code | File |
|---|---|---|
| Ban quản lý nhập email + chọn vai trò trên màn hình thành viên dự án | ✅ | `routes/projectRoutes.js`, `POST /:projectId/members`, quyền giới hạn `BAN_QUAN_LY`/`CHU_DAU_TU` |
| Email đã có tài khoản → thêm thẳng vào `project_members` | 🟡 Có code, nhưng gọi sang `publicRoutes.js` accept thì **vỡ lỗi mục 3** | như trên |
| Email chưa có tài khoản → tạo token mời, lưu hạn dùng, gửi email thật | ✅ | Bảng `invitations` (`token_hash`, `expires_at`), outbox pattern qua bảng `email_logs`, gửi nền bằng `lib/emailSender.js` + `lib/mailer.js` (hỗ trợ SMTP thật qua Brevo, có hướng dẫn trong `EMAIL_SETUP.md`) |
| Bấm link → tự đặt mật khẩu, băm Argon2id, tự vào dự án | ✅ | `routes/authRoutes.js` nhánh `token` — đã băm bằng `argon2.hash`, đã insert đúng cột `role` (không dính lỗi mục 3) |

### 4.1. Những điểm đã làm **tốt hơn** mức tối thiểu bạn mô tả (giữ nguyên, không cần sửa)
- Token 32-byte ngẫu nhiên, **chỉ lưu bản băm SHA-256** trong DB, không lưu token gốc.
- Outbox pattern: ghi `invitations` + `email_logs` trong transaction, gửi email bất đồng bộ sau `COMMIT`, không block request.
- Rate limit riêng cho endpoint liên quan lời mời (10 lần/15 phút/IP).
- Chống bấm đúp bằng `SELECT ... FOR UPDATE` khi accept.
- Có endpoint gửi lại lời mời (`POST /:projectId/invitations/:invId/resend`), hủy token cũ khi gửi lại.

### 4.2. Việc Antigravity cần làm để hoàn thiện đúng luồng bạn mô tả
1. **Bắt buộc:** sửa lỗi mục 3 (`role_id` → `role`) — nếu không sửa, nhánh "email đã có tài khoản" của chính luồng bạn mô tả sẽ luôn trả lỗi 500 trên môi trường thật.
2. **Kiểm thử thật đầu-cuối** (không mock `emailSender`, dùng `EMAIL_PROVIDER=memory` hoặc SMTP thật theo `EMAIL_SETUP.md`):
   - Mời một email **chưa có tài khoản** → xác nhận có bản ghi `email_logs.status = 'sent'` → xác nhận link trong nội dung email đúng `APP_BASE_URL` + token → gọi `/register` với token đó → xác nhận user mới xuất hiện trong `project_members` với đúng vai trò đã chọn lúc mời.
   - Mời một email **đã có tài khoản** → sau khi sửa lỗi mục 3, xác nhận gọi `/api/public/invitations/:token/accept` trả 200 và user đó xuất hiện ngay trong `project_members`.
3. **Đồng bộ vai trò hiển thị**: `adminRoutes.js` (luồng mời của System Admin, khác với luồng PM bạn mô tả) đang nhận `role` tự do từ body không kiểm tra theo danh sách `ROLES` hợp lệ — nên áp cùng một hàm kiểm tra `Object.values(ROLES).includes(role)` đang dùng ở `projectRoutes.js` để tránh lưu vào `invitations.project_role` một giá trị không khớp 6 vai trò chuẩn.
4. Xác nhận biến môi trường production thật sự có `SMTP_HOST/SMTP_USER/SMTP_PASS/APP_BASE_URL (https://)` trước khi deploy — `lib/mailer.js` đã tự chặn khởi động (`process.exit(1)`) nếu thiếu, đây là điểm tốt, chỉ cần đảm bảo secrets đã được set đúng ở nơi deploy thật (Render/staging).

---

## 5. Thứ tự ưu tiên đề xuất cho Antigravity

1. Sửa mục 3 (`role_id` → `role` trong `publicRoutes.js`) — 1 dòng, rủi ro thấp, chặn ngay một lỗi 500 thật.
2. Sửa mục 2 (migration + 3 file service cho `schedule_results` theo `task_id`) — việc lớn nhất, ảnh hưởng đúng mục tiêu Sprint 2 ("hệ thống chỉ ra đúng đường găng theo đáp án tính tay... chạy được từ đầu đến cuối với dữ liệu thật").
3. Thêm 2 test tích hợp thật (không mock) cho đúng 2 lỗi trên, để CI từ nay bắt được loại lỗi này thay vì chỉ xanh giả.
4. Kiểm thử đầu-cuối luồng mời email thật theo mục 4.2.
5. Rà lại frontend T-12/T-14/T-28 (ngoài phạm vi đã kiểm trong backend lần này).
