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
    await pool.query(
      "TRUNCATE TABLE schedule_results, dependencies, tasks, work_items, projects RESTART IDENTITY CASCADE"
    );

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
    await pool.query(
      "TRUNCATE TABLE schedule_results, dependencies, tasks, work_items, projects RESTART IDENTITY CASCADE"
    );
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
