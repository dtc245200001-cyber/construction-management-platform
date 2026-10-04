# Sprint 2 CPM Fixes & Email Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Khắc phục triệt để lỗi mô hình dữ liệu `schedule_results` (chuyển sang mức task_id), sửa lỗi 500 do cột `role_id` không tồn tại khi chấp nhận thư mời, bổ sung kiểm thử tích hợp trên PostgreSQL thật, kiểm chứng luồng gửi email và rà soát giao diện frontend (T-12, T-14, T-28) theo đúng tài liệu bàn giao Sprint 2.

**Architecture:** 
- Tách biệt kiểm thử hành vi với CSDL PostgreSQL thật (không mock pool) nhằm tái hiện chính xác lỗi trước khi sửa (TDD).
- Chuyển đổi mô hình dữ liệu bảng `schedule_results` từ `work_item_id` sang `task_id` qua migration nối tiếp, cập nhật các service tính toán/lưu trữ/truy vấn CPM và kiểm soát chặt chẽ nguy cơ mất mát dữ liệu bằng cơ chế phê duyệt (`@accidental-data-loss-prevention`).
- Đồng bộ hóa logic gán quyền dự án (`project_members.role`) trên toàn bộ luồng mời thành viên (`publicRoutes.js`, `adminRoutes.js`), duy trì nguyên vẹn các tính năng nâng cao đã hoàn thành ở Mục 4.1.

**Tech Stack:** Node.js (Express), PostgreSQL (pg, node-pg-migrate), Jest, Supertest, Argon2, React/Vite.

---

### Task 1: Sửa lỗi `publicRoutes.js` (Mục 3) qua TDD

**Files:**
- Test: `backend/__tests__/integration/invitationExistingUserAccept.test.js`
- Modify: `backend/routes/publicRoutes.js:215-227`

**Step 1: Write the failing test**
Tạo test tích hợp chạy trên PostgreSQL thật (`localhost:5433/construction_db_test`), tạo user đã có tài khoản, gửi lời mời và gọi endpoint `POST /api/public/invitations/:token/accept`.

```javascript
// backend/__tests__/integration/invitationExistingUserAccept.test.js
"use strict";

const request = require("supertest");
const crypto = require("crypto");
const app = require("../../app");
const pool = require("../../config/db");

describe("Invitation Acceptance for Existing User (Integration)", () => {
  let existingUserId;
  let projectId;
  let rawToken;
  let tokenHash;

  beforeAll(async () => {
    // Dọn dẹp dữ liệu test
    await pool.query("TRUNCATE TABLE email_logs, project_members, invitations, projects, users RESTART IDENTITY CASCADE");

    // Tạo 1 admin/inviter user (id=1)
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role_id, is_system_admin)
       VALUES (1, 'inviter@test.com', 'hashed_pwd', 'Inviter', 1, true)`
    );

    // Tạo 1 user đã có tài khoản sẵn trong hệ thống (id=2)
    const userRes = await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role_id, is_system_admin)
       VALUES (2, 'existing@test.com', 'hashed_pwd', 'Existing User', 2, false)
       RETURNING id`
    );
    existingUserId = userRes.rows[0].id;

    // Tạo 1 dự án
    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Dự án Test Email', 'PRJ-EMAIL', '2026-10-01')
       RETURNING id`
    );
    projectId = projRes.rows[0].id;

    // Tạo thư mời cho user đã tồn tại với role dự án 'ky_su_giam_sat'
    rawToken = "testtokenexistinguser12345678901234567890123456789012";
    tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO invitations (email, token_hash, invited_by, expires_at, project_id, project_role)
       VALUES ($1, $2, 1, $3, $4, 'ky_su_giam_sat')`,
      ['existing@test.com', tokenHash, expiresAt, projectId]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  test("người dùng đã có tài khoản chấp nhận lời mời thành công và vào project_members với đúng role", async () => {
    const res = await request(app)
      .post(`/api/public/invitations/${rawToken}/accept`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("thành công");

    // Kiểm tra DB thật: user phải có mặt trong project_members với role 'ky_su_giam_sat'
    const memberRes = await pool.query(
      "SELECT user_id, project_id, role FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, existingUserId]
    );

    expect(memberRes.rows).toHaveLength(1);
    expect(memberRes.rows[0].role).toBe("ky_su_giam_sat");
  });
});
```

**Step 2: Run test to verify it fails**
- Lệnh chạy: `npx jest backend/__tests__/integration/invitationExistingUserAccept.test.js --runInBand --forceExit`
- Kết quả mong đợi (RED): Test thất bại với mã lỗi HTTP 500 kèm lỗi cơ sở dữ liệu `column "role_id" of relation "project_members" does not exist`.

**Step 3: Write minimal implementation**
Sửa [backend/routes/publicRoutes.js](file:///d:/construction-management-platform/backend/routes/publicRoutes.js) tại dòng 215-227: loại bỏ truy vấn bảng `roles` lấy `roleId`, ghi trực tiếp chuỗi vai trò `invitation.project_role` vào cột `role` của bảng `project_members`.

```javascript
      // Thêm vào project nếu có
      if (invitation.project_id && invitation.project_role) {
        // Check if already in project
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

**Step 4: Run test to verify it passes**
- Lệnh chạy: `npx jest backend/__tests__/integration/invitationExistingUserAccept.test.js --runInBand --forceExit`
- Kết quả mong đợi (GREEN): Status 200, bản ghi `project_members` được tạo thành công với `role = 'ky_su_giam_sat'`.

**Step 5: Commit**
```bash
git add backend/routes/publicRoutes.js backend/__tests__/integration/invitationExistingUserAccept.test.js
git commit -m "fix(auth): fix role_id column error on invitation accept for existing user"
```

---

### Task 2: Sửa cấu trúc `schedule_results` theo `task_id` (Mục 2) qua TDD & Tuân thủ `@accidental-data-loss-prevention`

**Files:**
- Test: `backend/__tests__/integration/scheduleMultiTaskPerWorkItem.test.js`
- Create: `backend/migrations/1791100000000_fix-schedule-results-task-grain.js`
- Modify: `backend/services/scheduleCalculation.js`
- Modify: `backend/services/schedulePersistence.js`
- Modify: `backend/services/scheduleQuery.js`
- Modify: `backend/services/scheduleRecalculation.js`
- Modify: `backend/__tests__/schedulePersistence.test.js`
- Modify: `backend/__tests__/scheduleQuery.test.js`
- Modify: `backend/__tests__/scheduleRecalculation.test.js`

**Step 1: Write the failing test**
Tạo test tích hợp chạy trên PostgreSQL thật: 1 dự án, 1 hạng mục (`work_item`), tạo 2 công việc độc lập (`tasks`) có thời lượng khác nhau (3 ngày và 5 ngày), gọi `calculateAndSaveSchedule(projectId)`.

```javascript
// backend/__tests__/integration/scheduleMultiTaskPerWorkItem.test.js
"use strict";

const pool = require("../../config/db");
const { calculateAndSaveSchedule } = require("../../services/scheduleCalculation");
const { getScheduleResults } = require("../../services/scheduleQuery");

describe("Schedule Results - Task Grain Multi-Task Test (Integration)", () => {
  let projectId;
  let workItemId;
  let taskId1;
  let taskId2;

  beforeAll(async () => {
    // Dọn dẹp dữ liệu
    await pool.query("TRUNCATE TABLE schedule_results, dependencies, tasks, work_items, projects RESTART IDENTITY CASCADE");

    // 1. Tạo dự án có start_date
    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Dự án CPM Test Multi-Task', 'PRJ-CPM-01', '2026-10-01T00:00:00.000Z')
       RETURNING id`
    );
    projectId = projRes.rows[0].id;

    // 2. Tạo 1 hạng mục lá (work_item)
    const wiRes = await pool.query(
      `INSERT INTO work_items (project_id, code, name)
       VALUES ($1, 'HM-01', 'Hạng mục móng')
       RETURNING id`,
      [projectId]
    );
    workItemId = wiRes.rows[0].id;

    // 3. Tạo 2 công việc độc lập chung 1 hạng mục
    const t1Res = await pool.query(
      `INSERT INTO tasks (work_item_id, name, duration_days)
       VALUES ($1, 'Đào đất móng', 3)
       RETURNING id`,
      [workItemId]
    );
    taskId1 = t1Res.rows[0].id;

    const t2Res = await pool.query(
      `INSERT INTO tasks (work_item_id, name, duration_days)
       VALUES ($1, 'Gia công cốt thép', 5)
       RETURNING id`,
      [workItemId]
    );
    taskId2 = t2Res.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  test("calculateAndSaveSchedule phải lưu đủ 2 kết quả cho 2 công việc, không bị ghi đè mất dữ liệu", async () => {
    const result = await calculateAndSaveSchedule(projectId);

    // Kỳ vọng lưu đủ 2 công việc
    expect(result.savedCount).toBe(2);
    expect(Object.keys(result.results)).toHaveLength(2);

    // Kiểm tra trực tiếp trong DB thật
    const dbRows = await pool.query(
      "SELECT task_id, early_start, early_finish, total_float, is_critical FROM schedule_results ORDER BY task_id ASC"
    );

    expect(dbRows.rows).toHaveLength(2);
    expect(Number(dbRows.rows[0].task_id)).toBe(taskId1);
    expect(Number(dbRows.rows[1].task_id)).toBe(taskId2);

    // Kiểm tra hàm getScheduleResults trả về 2 dòng kèm work_item_name
    const scheduleQueryResults = await getScheduleResults(projectId);
    expect(scheduleQueryResults).toHaveLength(2);
    expect(scheduleQueryResults[0]).toHaveProperty("work_item_name", "Hạng mục móng");
  });
});
```

**Step 2: Run test to verify it fails**
- Lệnh chạy: `npx jest backend/__tests__/integration/scheduleMultiTaskPerWorkItem.test.js --runInBand --forceExit`
- Kết quả mong đợi (RED): Test thất bại vì `savedCount` trả về 1 thay vì 2, và bảng `schedule_results` ghi đè chỉ còn 1 dòng của `work_item_id`.

**Step 3: Checkpoint `@accidental-data-loss-prevention` trước khi can thiệp cấu trúc DB**
> **STOP AND VERIFY:**
> - Hành động: Tạo migration đổi tên cột `work_item_id` thành `task_id`, xóa ràng buộc foreign key cũ `schedule_results_work_item_id_fkey`, xóa unique index `schedule_results_work_item_unique`, tạo FK mới tham chiếu `tasks(id)`.
> - Rủi ro: Nếu trên môi trường staging/production đã có dữ liệu `schedule_results` cũ, việc đổi FK sẽ yêu cầu dữ liệu phải tương thích hoặc cần `TRUNCATE schedule_results` (vì kết quả CPM có thể tự động tính toán lại bất kỳ lúc nào bằng API `POST /recalculate`).
> - Yêu cầu: Trình bày rõ với người dùng và xin xác nhận trước khi áp dụng lệnh DDL lên DB.

**Step 4: Viết Migration mới**
Tạo file `backend/migrations/1791100000000_fix-schedule-results-task-grain.js`:
```javascript
"use strict";

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Tránh lỗi foreign key nếu dữ liệu cũ đang chứa work_item_id lệch với task_id
  pgm.sql("TRUNCATE TABLE schedule_results");

  pgm.dropConstraint("schedule_results", "schedule_results_work_item_unique", { ifExists: true });
  
  pgm.sql(`
    ALTER TABLE schedule_results
      DROP CONSTRAINT IF EXISTS schedule_results_work_item_id_fkey;
  `);

  pgm.renameColumn("schedule_results", "work_item_id", "task_id");

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
  pgm.sql("TRUNCATE TABLE schedule_results");

  pgm.dropConstraint("schedule_results", "schedule_results_task_unique", { ifExists: true });
  pgm.dropConstraint("schedule_results", "schedule_results_task_id_fkey", { ifExists: true });

  pgm.renameColumn("schedule_results", "task_id", "work_item_id");

  pgm.addConstraint("schedule_results", "schedule_results_work_item_id_fkey", {
    foreignKey: {
      columns: "work_item_id",
      references: "work_items",
      onDelete: "CASCADE",
    },
  });

  pgm.addConstraint("schedule_results", "schedule_results_work_item_unique", {
    unique: "work_item_id",
  });
};
```

**Step 5: Cập nhật các service backend**
1. **[backend/services/scheduleCalculation.js](file:///d:/construction-management-platform/backend/services/scheduleCalculation.js)**:
   - Sửa truy vấn dirty state:
     ```sql
     SELECT
       COUNT(*) AS result_count,
       COUNT(*) FILTER (WHERE sr.needs_recalculation = true) AS dirty_count
     FROM schedule_results sr
     JOIN tasks t ON t.id = sr.task_id
     JOIN work_items wi ON wi.id = t.work_item_id
     WHERE wi.project_id = $1
     ```
   - Xóa bỏ đoạn vòng lặp remap `scheduleByWorkItem[task.workItemId] = result`.
   - Lưu trực tiếp:
     ```javascript
     const savedCount = await saveScheduleResults(scheduleByTask, project.start_date);
     return {
       projectId,
       savedCount,
       results: scheduleByTask,
     };
     ```
2. **[backend/services/schedulePersistence.js](file:///d:/construction-management-platform/backend/services/schedulePersistence.js)**:
   - Đổi tham số từ `[workItemId, result]` thành `[taskId, result]`.
   - `INSERT INTO schedule_results (task_id, ...)`
   - `ON CONFLICT (task_id) DO UPDATE SET ...`
3. **[backend/services/scheduleQuery.js](file:///d:/construction-management-platform/backend/services/scheduleQuery.js)**:
   - Cập nhật câu SQL trả về theo từng task kèm `work_item_name`:
     ```sql
     SELECT
       t.id,
       t.name,
       t.work_item_id,
       wi.name AS work_item_name,
       sr.early_start,
       sr.early_finish,
       sr.late_start,
       sr.late_finish,
       sr.total_float,
       sr.is_critical,
       sr.calculated_at
     FROM tasks t
     JOIN work_items wi ON wi.id = t.work_item_id
     LEFT JOIN schedule_results sr ON sr.task_id = t.id
     WHERE wi.project_id = $1
       AND ($2::boolean IS NULL OR sr.is_critical = $2)
     ORDER BY sr.early_start NULLS LAST, t.id
     ```
4. **[backend/services/scheduleRecalculation.js](file:///d:/construction-management-platform/backend/services/scheduleRecalculation.js)**:
   - Cập nhật JOIN qua `tasks t`:
     ```sql
     UPDATE schedule_results sr
     SET needs_recalculation = true
     FROM tasks t
     JOIN work_items wi ON wi.id = t.work_item_id
     WHERE t.id = sr.task_id
       AND wi.project_id = $1
     ```
5. Cập nhật các mock unit test tương ứng:
   - `backend/__tests__/schedulePersistence.test.js`: Đổi `ON CONFLICT (work_item_id)` → `ON CONFLICT (task_id)`.
   - `backend/__tests__/scheduleQuery.test.js`: Cập nhật mock SQL kiểm tra JOIN qua `tasks`.
   - `backend/__tests__/scheduleRecalculation.test.js`: Cập nhật mock SQL kiểm tra JOIN qua `tasks`.

**Step 6: Run test to verify it passes**
- Chạy migrate: `npx node-pg-migrate up -m backend/migrations` (hoặc Jest globalSetup tự chạy).
- Chạy test tích hợp: `npx jest backend/__tests__/integration/scheduleMultiTaskPerWorkItem.test.js --runInBand --forceExit`
- Kết quả mong đợi (GREEN): `savedCount === 2`, trong DB lưu đủ 2 dòng kết quả độc lập cho 2 tasks, truy vấn `getScheduleResults` trả về đầy đủ.

**Step 7: Commit**
```bash
git add backend/migrations/ backend/services/ backend/__tests__/
git commit -m "fix(schedule): model schedule_results by task_id instead of work_item_id"
```

---

### Task 3: Chạy toàn bộ Regression Test Suites (Sprint 1 + Sprint 2)

**Step 1: Chạy kiểm tra cú pháp và Linting**
```bash
npm --prefix backend run lint
npm --prefix backend run build
```
Kỳ vọng: 0 lỗi linting, cú pháp code chuẩn xác.

**Step 2: Chạy toàn bộ 23+ test suites của Backend**
```bash
npm --prefix backend test
```
Kỳ vọng: Toàn bộ các test suite (unit + integration, bao gồm cả 2 test tích hợp mới thêm) đều PASS 100%.

**Step 3: Chạy test Frontend**
```bash
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
```
Kỳ vọng: Frontend build sạch sẽ, không có lỗi tiềm ẩn.

---

### Task 4: Kiểm thử đầu-cuối luồng mời email thật (Mục 4.2)

**Files:**
- Modify: `backend/routes/adminRoutes.js:43-55` (Bổ sung kiểm tra hợp lệ của role)
- Create: `backend/__tests__/integration/emailInviteEndToEnd.test.js`

**Step 1: Bổ sung kiểm tra role trong `adminRoutes.js` (Mục 4.2.3)**
Tại [backend/routes/adminRoutes.js](file:///d:/construction-management-platform/backend/routes/adminRoutes.js):
```javascript
    if (projectId && role) {
      if (!Object.values(ROLES).includes(role)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Vai trò dự án không hợp lệ" });
      }
      ...
    }
```

**Step 2: Viết integration test đầu-cuối cho toàn bộ luồng mời email**
Kiểm thử 3 nhánh chính theo mục 4.2:
1. **Nhánh người mới (chưa có tài khoản):**
   - PM tạo lời mời qua `POST /api/projects/:projectId/members`.
   - Kiểm tra DB có bản ghi `invitations` (`token_hash`) và `email_logs` (`status = 'sent'`).
   - Gọi `POST /api/auth/register` kèm `token` mời, mật khẩu mới, tên.
   - Xác nhận tài khoản được tạo và tự động xuất hiện trong `project_members` với đúng vai trò được mời.
2. **Nhánh người đã có tài khoản:**
   - PM mời user đã có tài khoản vào dự án.
   - Gọi `POST /api/public/invitations/:token/accept`.
   - Xác nhận trả về 200, user vào ngay `project_members`.
3. **Nhánh gửi lại lời mời (`resend`):**
   - Gọi `POST /api/projects/:projectId/invitations/:invId/resend`.
   - Xác nhận `token_hash` được làm mới, `email_logs` ghi nhận lượt gửi mới, token cũ bị vô hiệu hóa.

**Step 3: Run test to verify**
- Chạy: `npx jest backend/__tests__/integration/emailInviteEndToEnd.test.js --runInBand --forceExit`
- Kỳ vọng: PASS 100%.

**Step 4: Commit**
```bash
git add backend/routes/adminRoutes.js backend/__tests__/integration/emailInviteEndToEnd.test.js
git commit -m "test(email): add end-to-end integration tests for project invitation flows"
```

---

### Task 5: Rà soát và đánh giá Frontend T-12, T-14, T-28

**Mục tiêu:** Kiểm tra chi tiết mã nguồn frontend để xác định mức độ sẵn sàng và độ khớp API của các màn hình:
1. **T-12 (Form khai công việc):**
   - Kiểm tra UI form tạo/sửa task có input `duration_days` và validate `> 0` ở client hay chưa.
   - Kiểm tra việc gọi API backend: `POST /api/projects/:projectId/tasks` hoặc `PUT /api/projects/:projectId/tasks/:taskId`.
2. **T-14 (Form quan hệ phụ thuộc):**
   - Kiểm tra UI cho phép chọn 4 loại quan hệ (`FS`, `SS`, `FF`, `SF`) và nhập khoảng chờ/trễ (`lag/delay`).
   - Kiểm tra tích hợp API `POST /api/projects/:projectId/dependencies`.
3. **T-28 (Bảng tiến độ & đường găng):**
   - Kiểm tra màn hình `/schedule` (đang có menu trong `DashboardLayout.jsx` nhưng chưa định tuyến trong `App.jsx`).
   - Kiểm tra component hiển thị có khớp với dữ liệu mới của T-27 (`GET /api/projects/:projectId/schedule-results`: danh sách theo từng `task`, có `work_item_name`, các mốc `early_start`, `early_finish`, `late_start`, `late_finish`, `total_float`, `is_critical`).

**Output Task 5:**
- Lập tài liệu báo cáo hiện trạng chi tiết (đã có gì, thiếu gì, cần bổ sung route/component nào).
- Cập nhật định tuyến `App.jsx` và hoàn thiện component nếu thiếu để hệ thống chạy thông suốt đầu-cuối.
