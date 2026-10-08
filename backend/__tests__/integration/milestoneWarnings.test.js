"use strict";

const request = require("supertest");
const app = require("../../app");
const db = require("../../config/db");
const { evaluateMilestoneWarnings } = require("../../services/milestoneWarnings");
const { countWorkingDays, DEFAULT_CALENDAR } = require("../../algorithms/workingDays");

describe("T-44 Milestone Warnings Tests", () => {
  let projectId;
  let workItemId;
  let taskId;
  let milestoneId;

  beforeAll(async () => {
    // 0. Create a user
    const userRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role_id) VALUES ('Test User', 'test_t44_${Date.now()}@example.com', 'pwd_hash', 1) RETURNING id`
    );
    const userId = userRes.rows[0].id;

    // 1. Create a project
    const projRes = await db.query(
      `INSERT INTO projects (name, location, start_date) VALUES ('Test Project T-44', 'HN', '2026-10-01') RETURNING id`
    );
    projectId = projRes.rows[0].id;

    // 2. Set calendar to 6 days/week (default)
    await db.query(
      `INSERT INTO calendars (project_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
       VALUES ($1, true, true, true, true, true, true, false)`,
      [projectId]
    );

    // 3. Set a holiday on Wednesday, 2026-10-14
    await db.query(
      `INSERT INTO holidays (project_id, holiday_date, name) VALUES ($1, '2026-10-14', 'Test Holiday')`,
      [projectId]
    );

    // 4. Create a work item
    const wiRes = await db.query(
      `INSERT INTO work_items (project_id, parent_id, name, type) VALUES ($1, NULL, 'Phan mong', 'category') RETURNING id`,
      [projectId]
    );
    workItemId = wiRes.rows[0].id;

    // 5. Create a task under it
    const taskRes = await db.query(
      `INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Dao mong', 10) RETURNING id`,
      [workItemId]
    );
    taskId = taskRes.rows[0].id;
  });

  it("Vượt qua ngày lễ và chủ nhật -> tính đúng ngày làm việc", async () => {
    // Required date: 2026-10-10 (Saturday)
    const reqDate = '2026-10-10';
    const userRes = await db.query(`SELECT id FROM users LIMIT 1`);
    const uId = userRes.rows[0].id;

    const msRes = await db.query(
      `INSERT INTO milestones (work_item_id, required_date, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [workItemId, reqDate, uId]
    );
    milestoneId = msRes.rows[0].id;

    // Task finishes late on 2026-10-15 (Thursday)
    // Between 11th and 15th:
    // 11th: Sunday (Off)
    // 12th: Monday (Work - 1)
    // 13th: Tuesday (Work - 2)
    // 14th: Wednesday (Holiday - Off)
    // 15th: Thursday (Work - 3)
    // Total working days exceeded = 3.
    const maxEf = '2026-10-15';
    
    // Create schedule result
    await db.query(
      `INSERT INTO schedule_results (task_id, early_finish)
       VALUES ($1, $2)`,
      [taskId, maxEf]
    );

    // Evaluate
    await evaluateMilestoneWarnings(projectId);

    // Check warnings
    const warnRes = await db.query(`SELECT * FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`, [milestoneId]);
    expect(warnRes.rows.length).toBe(1);
    
    // We expect EXACTLY 3 days
    expect(warnRes.rows[0].overdue_days).toBe(3);
  });

  afterAll(async () => {
    // Cleanup
    await db.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
    await db.end();
  });
});
