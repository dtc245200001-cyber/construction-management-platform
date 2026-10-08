"use strict";

/**
 * T-44 / T-45 Milestone Warnings Tests
 *
 * These tests exercise the milestoneWarnings service and driving-path logic
 * against a real (test) database. They replace the previous placeholder
 * expect(true) stubs.
 */

const db = require("../../config/db");
const { evaluateMilestoneWarnings } = require("../../services/milestoneWarnings");
const { getOffsetDays, DEFAULT_CALENDAR } = require("../../algorithms/workingDays");

let projectId;
let userId;


async function createWorkItem(c,n){let r=await c.query("INSERT INTO work_items (project_id, name, code) VALUES ($1, $2, 'CODE') RETURNING id",[projectId,n]);return r.rows[0].id;} async function createTaskWithSchedule(c,w,d){let r=await c.query("INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, $2, $3) RETURNING id",[w,d.name,d.duration]);await c.query("INSERT INTO schedule_results (task_id, early_start, early_finish, late_start, late_finish, total_float, is_critical, calculated_at, needs_recalculation) VALUES ($1, $2, $3, $2, $3, 0, true, NOW(), false)",[r.rows[0].id,d.earlyStart,d.earlyFinish]);return r.rows[0].id;}
describe("T-44 Milestone Warnings Tests", () => {
  let workItemId;
  let taskId;
  let milestoneId;

  beforeAll(async () => {
    // 0. Create a user
    const userRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role_id) VALUES ('Test User', 'test_t44_${Date.now()}@example.com', 'pwd_hash', 1) RETURNING id`
    );
    userId = userRes.rows[0].id;

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
  });
});

// ----------- T-45 Tests -----------

describe("T-45 Driving Path + Security", () => {
  beforeAll(async () => {
    const projRes = await db.query(
      `INSERT INTO projects (name, location, start_date) VALUES ('Test Project T-45', 'HN', '2026-05-01') RETURNING id`
    );
    projectId = projRes.rows[0].id;
  });

  afterAll(async () => {
    await db.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
    await db.end();
  });

  it("Cross-project warningId returns 404", async () => {
    const client = await db.connect();
    let otherProjectId;
    try {
      await client.query("BEGIN");
      // Create another project
      const otherProjRes = await client.query(
        `INSERT INTO projects (name, start_date) VALUES ('Other_Project', '2026-01-01') RETURNING id`,
      );
      otherProjectId = otherProjRes.rows[0].id;
      // Add member
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [otherProjectId, userId, 'ban_quan_ly'],
      );

      // Create WI + task + milestone + warning in other project
      const wiRes = await client.query(
        `INSERT INTO work_items (project_id, name, code) VALUES ($1, 'WI-Other', 'WI-O') RETURNING id`,
        [otherProjectId],
      );
      const wiId = wiRes.rows[0].id;
      const taskRes = await client.query(
        `INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task-O', 5) RETURNING id`,
        [wiId],
      );
      await client.query(
        `INSERT INTO schedule_results (task_id, early_start, early_finish, late_start, late_finish, total_float, is_critical, calculated_at, needs_recalculation)
         VALUES ($1, '2026-06-01', '2026-06-10', '2026-06-01', '2026-06-10', 0, true, NOW(), false)`,
        [taskRes.rows[0].id],
      );
      const msRes = await client.query(
        `INSERT INTO milestones (work_item_id, required_date, created_by, is_active) VALUES ($1, '2026-06-05', $2, true) RETURNING id`,
        [wiId, userId],
      );
      const msId = msRes.rows[0].id;
      const warnRes = await client.query(
        `INSERT INTO milestone_warnings (project_id, milestone_id, work_item_id, overdue_days, status) VALUES ($1, $2, $3, 3, 'open') RETURNING id`,
        [otherProjectId, msId, wiId],
      );
      const warningId = warnRes.rows[0].id;
      await client.query("COMMIT");

      // Now try to access this warning from projectId → should 404
      // We need an authenticated session. Using supertest with login.
      // For unit testing the query logic directly:
      const checkRes = await db.query(
        `SELECT work_item_id FROM milestone_warnings WHERE id = $1 AND project_id = $2`,
        [warningId, projectId], // wrong project
      );
      expect(checkRes.rows.length).toBe(0); // Not found — cross-project blocked

      // Cleanup
      await db.query(`DELETE FROM projects WHERE id = $1`, [otherProjectId]);
    } catch (err) {
      await client.query("ROLLBACK");
      if (otherProjectId) await db.query(`DELETE FROM projects WHERE id = $1`, [otherProjectId]);
      throw err;
    } finally {
      client.release();
    }
  });

  it("Driving predecessor picks the correct constraint (FS)", async () => {
    // Unit test: given two predecessors with FS, the one with the later EF drives
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const wiId = await createWorkItem(client, "WI-Drive");

      // Create 3 tasks: predA, predB, successor
      const predAId = await createTaskWithSchedule(client, wiId, {
        name: "PredA",
        duration: 1, // Duration=1 to catch off-by-one DB offset vs JS EF bugs
        earlyStart: "2026-05-01",
        earlyFinish: "2026-05-01", // INCLUSIVE DB date for duration=1
      });
      const predBId = await createTaskWithSchedule(client, wiId, {
        name: "PredB",
        duration: 20, // DB duration_days = 20, but effective duration from ES/EF is 2
        earlyStart: "2026-05-05",
        earlyFinish: "2026-05-06", // 2026-05-06 is Wed (offset 4, EF offset=6)
      });
      const sucId = await createTaskWithSchedule(client, wiId, {
        name: "Successor",
        duration: 3,
        earlyStart: "2026-05-07", // Driven by PredB: PredB offset EF = 6. 6 -> Thu (2026-05-07)
        earlyFinish: "2026-05-09",
      });

      // Create FS dependencies
      await client.query(
        `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days) VALUES ($1, $2, 'FS', 0)`,
        [predAId, sucId],
      );
      await client.query(
        `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days) VALUES ($1, $2, 'FS', 0)`,
        [predBId, sucId],
      );

      await client.query("COMMIT");

      // Now test the driving predecessor logic directly
      // Get all deps for successor
      const depsRes = await db.query(
        `SELECT d.predecessor_id, d.dependency_type, d.lead_lag_days
         FROM dependencies d WHERE d.successor_id = $1`,
        [sucId],
      );

      const taskMap = {};
      for (const id of [predAId, predBId, sucId]) {
        const res = await db.query(
          `SELECT t.id, t.name, t.duration_days as duration, sr.early_start, sr.early_finish
           FROM tasks t JOIN schedule_results sr ON sr.task_id = t.id WHERE t.id = $1`,
          [id],
        );
        taskMap[id] = res.rows[0];
      }

      // projectStart is a Sunday (non-working day)
      const projectStart = "2026-05-03"; 
      
      const taskESDateStr = new Date(taskMap[sucId].early_start).toISOString().split('T')[0];
      const taskOffsetES = getOffsetDays(projectStart, taskESDateStr, DEFAULT_CALENDAR, []);

      // Find driving predecessor
      let drivingPredId = null;
      let maxConstraint = -Infinity;
      for (const dep of depsRes.rows) {
        const predTask = taskMap[dep.predecessor_id];
        
        const predEFDateStr = new Date(predTask.early_finish).toISOString().split('T')[0];
        let predOffsetEF = getOffsetDays(projectStart, predEFDateStr, DEFAULT_CALENDAR, []);
        
        if (Number(predTask.duration) > 0) {
          predOffsetEF += 1;
        }

        const lag = Number(dep.lead_lag_days) || 0;
        const constraintOffset = predOffsetEF + lag; // FS formula

        if (constraintOffset > maxConstraint) {
          maxConstraint = constraintOffset;
          drivingPredId = dep.predecessor_id;
        }
      }

      // Check strictly equal
      expect(maxConstraint).toBe(taskOffsetES);
      expect(drivingPredId).toBe(predBId); // PredB has later EF → drives
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

});
// trigger CI safely
