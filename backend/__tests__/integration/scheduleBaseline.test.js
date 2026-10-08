const db = require("../../config/db");
const { calculateAndSaveSchedule } = require("../../services/scheduleCalculation");

describe("T-37 Baseline Schedule Tests", () => {
  let projectId;
  let workItemId;
  let taskId1;
  let taskId2;
  let userId;

  beforeAll(async () => {
    // 0. Create a user
    const userRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role_id) VALUES ('Baseline User', 'baseline_${Date.now()}@example.com', 'pwd_hash', 1) RETURNING id`
    );
    userId = userRes.rows[0].id;

    // 1. Create a project
    const projRes = await db.query(
      `INSERT INTO projects (name, location, start_date) VALUES ('Test Project T-37', 'HN', '2026-10-01') RETURNING id`
    );
    projectId = projRes.rows[0].id;

    // 2. Add calendar
    await db.query(
      `INSERT INTO calendars (project_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday) 
       VALUES ($1, true, true, true, true, true, true, false)`,
      [projectId]
    );

    // 3. Create work item
    const wiRes = await db.query(
      `INSERT INTO work_items (project_id, name) VALUES ($1, 'WI 1') RETURNING id`,
      [projectId]
    );
    workItemId = wiRes.rows[0].id;

    // 4. Create tasks
    const t1Res = await db.query(
      `INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task 1', 2) RETURNING id`,
      [workItemId]
    );
    taskId1 = t1Res.rows[0].id;

    const t2Res = await db.query(
      `INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task 2', 3) RETURNING id`,
      [workItemId]
    );
    taskId2 = t2Res.rows[0].id;

    // Dependency Task 1 -> Task 2
    await db.query(
      `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days) VALUES ($1, $2, 'FS', 0)`,
      [taskId1, taskId2]
    );
  });

  afterAll(async () => {
    await db.query("DELETE FROM dependencies WHERE predecessor_id IN ($1, $2)", [taskId1, taskId2]);
    await db.query("DELETE FROM tasks WHERE id IN ($1, $2)", [taskId1, taskId2]);
    await db.query("DELETE FROM work_items WHERE id = $1", [workItemId]);
    await db.query("DELETE FROM calendars WHERE project_id = $1", [projectId]);
    await db.query("DELETE FROM projects WHERE id = $1", [projectId]);
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
  });

  it("Lưu baseline ngay lần chạy đầu tiên, và không ghi đè ở lần sau", async () => {
    // Lần 1
    await calculateAndSaveSchedule(projectId);

    // Kiểm tra đã có baseline
    const proj1 = await db.query(`SELECT planned_finish_date FROM projects WHERE id = $1`, [projectId]);
    const baselineDate = proj1.rows[0].planned_finish_date;
    expect(baselineDate).not.toBeNull();

    const t1_1 = await db.query(`SELECT was_critical_baseline FROM tasks WHERE id = $1`, [taskId1]);
    expect(t1_1.rows[0].was_critical_baseline).not.toBeNull();

    // Sửa duration của task 2 để thay đổi kế hoạch
    await db.query(`UPDATE tasks SET duration_days = 5 WHERE id = $1`, [taskId2]);

    // Lần 2
    await calculateAndSaveSchedule(projectId);

    // Kiểm tra baseline KHÔNG BỊ ĐỔI
    const proj2 = await db.query(`SELECT planned_finish_date FROM projects WHERE id = $1`, [projectId]);
    expect(new Date(proj2.rows[0].planned_finish_date).getTime()).toBe(new Date(baselineDate).getTime());
  });
});
