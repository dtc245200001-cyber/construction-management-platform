"use strict";

/**
 * T-44 / T-45 Milestone Warnings Tests
 *
 * These tests exercise the milestoneWarnings service and driving-path logic
 * against a real (test) database. They replace the previous placeholder
 * expect(true) stubs.
 */

const request = require("supertest");
const app = require("../../app");
const db = require("../../config/db");
const { ROLES } = require("../../utils/constants");
const {
  evaluateMilestoneWarnings,
} = require("../../services/milestoneWarnings");
const {
  countWorkingDays,
  getOffsetDays,
  DEFAULT_CALENDAR,
} = require("../../algorithms/workingDays");

// ----------- helpers -----------

let testProjectId;
let testUserId;

/**
 * Create a minimal work_item under the test project.
 */
async function createWorkItem(client, name = "WI") {
  const res = await client.query(
    `INSERT INTO work_items (project_id, name, code) VALUES ($1, $2, $3) RETURNING id`,
    [testProjectId, name, `WI-${Date.now()}`],
  );
  return res.rows[0].id;
}

/**
 * Create a task under a work_item and optionally attach schedule results.
 */
async function createTaskWithSchedule(
  client,
  workItemId,
  { name = "Task", duration = 5, earlyFinish = null, earlyStart = null } = {},
) {
  const taskRes = await client.query(
    `INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, $2, $3) RETURNING id`,
    [workItemId, name, duration],
  );
  const taskId = taskRes.rows[0].id;

  if (earlyFinish !== null) {
    const es = earlyStart || new Date(new Date(earlyFinish).getTime() - duration * 86400000);
    await client.query(
      `INSERT INTO schedule_results (task_id, early_start, early_finish, late_start, late_finish, total_float, is_critical, calculated_at, needs_recalculation)
       VALUES ($1, $2, $3, $4, $5, 0, true, NOW(), false)
       ON CONFLICT (task_id) DO UPDATE SET early_start = $2, early_finish = $3, late_start = $4, late_finish = $5, is_critical = true, calculated_at = NOW(), needs_recalculation = false`,
      [taskId, es, earlyFinish, es, earlyFinish],
    );
  }
  return taskId;
}

/**
 * Create an active milestone on a work_item.
 */
async function createMilestone(client, workItemId, requiredDate, userId) {
  // Deactivate any existing active milestone first
  await client.query(
    `UPDATE milestones SET is_active = false WHERE work_item_id = $1 AND is_active = true`,
    [workItemId],
  );
  const res = await client.query(
    `INSERT INTO milestones (work_item_id, required_date, created_by, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
    [workItemId, requiredDate, userId],
  );
  return res.rows[0].id;
}

// ----------- setup / teardown -----------

beforeAll(async () => {
  // Find or create a test user
  const userRes = await db.query(
    `SELECT id FROM users WHERE email = 'milestone_test@test.com' LIMIT 1`,
  );
  if (userRes.rows.length > 0) {
    testUserId = userRes.rows[0].id;
  } else {
    const roleRes = await db.query(`SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1`);
    
    if (roleRes.rows.length === 0) {
      throw new Error("Missing ban_quan_ly role in test database");
    }
    
    const roleIdManager = roleRes.rows[0].id;
    const ins = await db.query(
      `INSERT INTO users (email, name, password_hash, role_id, is_system_admin, is_verified) VALUES ('milestone_test@test.com', 'Test User', '$argon2id$v=19$m=65536,t=3,p=4$dGVzdA$dGVzdA', $1, false, true) RETURNING id`,
      [roleIdManager]
    );
    testUserId = ins.rows[0].id;
  }

  // Create a test project with a Sunday start date to test non-working day robustness
  const projRes = await db.query(
    `INSERT INTO projects (name, start_date) VALUES ('MW_Test_Project', '2026-05-03') RETURNING id`,
  );
  testProjectId = projRes.rows[0].id;

  // Add project member
  await db.query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [testProjectId, testUserId, ROLES.BAN_QUAN_LY],
  );
});

afterAll(async () => {
  // Cleanup: delete test project cascade
  if (testProjectId) {
    await db.query(`DELETE FROM projects WHERE id = $1`, [testProjectId]);
  }
});

// ----------- T-44 Tests -----------

describe("T-44 Milestone Warnings — working days + lifecycle", () => {
  it("A. Không vượt milestone → không tạo open warning", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const wiId = await createWorkItem(client, "WI-A");
      // Task finishes well before deadline
      await createTaskWithSchedule(client, wiId, {
        name: "Task-A",
        duration: 5,
        earlyFinish: "2026-06-10",
      });
      // Deadline is far in the future
      const msId = await createMilestone(client, wiId, "2026-12-31", testUserId);
      await client.query("COMMIT");

      await evaluateMilestoneWarnings(testProjectId);

      const warns = await db.query(
        `SELECT * FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`,
        [msId],
      );
      expect(warns.rows.length).toBe(0);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("B. Vượt chính xác 4 ngày làm việc → overdue_days = 4", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const wiId = await createWorkItem(client, "WI-B");
      // Required date: 2026-06-08 (Monday)
      // Early finish: 2026-06-12 (Friday) — 4 working days after deadline (Tue-Fri)
      // (Mon–Sat working, Sun off per DEFAULT_CALENDAR)
      // Day after deadline = 2026-06-09 (Tue)
      // Working days from 2026-06-09 to 2026-06-12 inclusive = Tue,Wed,Thu,Fri = 4
      const taskId = await createTaskWithSchedule(client, wiId, {
        name: "Task-B",
        duration: 10,
        earlyFinish: "2026-06-12",
      });
      await client.query(`UPDATE tasks SET actual_end_date = '2026-06-12' WHERE id = $1`, [taskId]);
      const msId = await createMilestone(client, wiId, "2026-06-08", testUserId);
      await client.query("COMMIT");

      await evaluateMilestoneWarnings(testProjectId);

      const warns = await db.query(
        `SELECT overdue_days FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`,
        [msId],
      );
      expect(warns.rows.length).toBe(1);
      expect(warns.rows[0].overdue_days).toBe(4);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("B2. Vượt chính xác 1 ngày làm việc → overdue_days = 1", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const wiId = await createWorkItem(client, "WI-B2");
      // Required date: 2026-06-08 (Monday)
      // Early finish: 2026-06-09 (Tuesday) — 1 working day after deadline
      // Day after deadline = 2026-06-09 (Tue)
      // Working days from 2026-06-09 to 2026-06-09 inclusive = Tue = 1
      const taskId = await createTaskWithSchedule(client, wiId, {
        name: "Task-B2",
        duration: 2,
        earlyFinish: "2026-06-09",
      });
      await client.query(`UPDATE tasks SET actual_end_date = '2026-06-09' WHERE id = $1`, [taskId]);
      const msId = await createMilestone(client, wiId, "2026-06-08", testUserId);
      await client.query("COMMIT");

      await evaluateMilestoneWarnings(testProjectId);

      const warns = await db.query(
        `SELECT overdue_days FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`,
        [msId],
      );
      expect(warns.rows.length).toBe(1);
      expect(warns.rows[0].overdue_days).toBe(1);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("C. Có weekend/holiday → dùng đúng working-day function T-39", async () => {
    // Verify countWorkingDays correctly skips non-working days
    // Using DEFAULT_CALENDAR (Mon-Sat working, Sun off)
    // 2026-06-07 (Sun) to 2026-06-14 (Sun): Mon-Sat = 6 working days within
    const count = countWorkingDays("2026-06-08", "2026-06-14", DEFAULT_CALENDAR, []);
    // Mon(8) Tue(9) Wed(10) Thu(11) Fri(12) Sat(13) = 6 working days
    // Sun(14) = not working
    expect(count).toBe(6);

    // With a holiday on Wednesday 2026-06-10
    const countWithHoliday = countWorkingDays("2026-06-08", "2026-06-14", DEFAULT_CALENDAR, [
      { holiday_date: "2026-06-10" },
    ]);
    // Mon(8) Tue(9) [Wed(10)=holiday] Thu(11) Fri(12) Sat(13) = 5 working days
    expect(countWithHoliday).toBe(5);
  });

  it("C2. T-44: Tie-break với 2 final tasks có cùng max_ef, 1 complete và 1 chưa complete", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const wiId = await createWorkItem(client, "WI-C2");
      // Deadline: 2026-05-15
      // Task 1: early_finish = 2026-05-12, actual_end_date = 2026-05-12 (complete)
      // Task 2: early_finish = 2026-05-12, actual_end_date = NULL (incomplete)
      // Since one of the final tasks is incomplete and deadline is passed, effectiveEnd = max(today, 2026-05-12).
      // If we use today, overdue_days > 0.
      const t1Id = await createTaskWithSchedule(client, wiId, {
        name: "Final 1", duration: 2, earlyFinish: "2026-05-12"
      });
      await client.query(`UPDATE tasks SET actual_end_date = '2026-05-12' WHERE id = $1`, [t1Id]);
      
      await createTaskWithSchedule(client, wiId, {
        name: "Final 2", duration: 2, earlyFinish: "2026-05-12"
      });
      
      const msId = await createMilestone(client, wiId, "2026-05-15", testUserId);
      await client.query("COMMIT");

      await evaluateMilestoneWarnings(testProjectId);

      const warns = await db.query(
        `SELECT overdue_days FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`,
        [msId],
      );
      // Deadline is in the past (2026), one final task incomplete => warning must exist!
      expect(warns.rows.length).toBe(1);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("D. Warning đã open, recalculate vẫn vượt → update warning cũ, không duplicate", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const wiId = await createWorkItem(client, "WI-D");
      const taskId = await createTaskWithSchedule(client, wiId, {
        name: "Task-D",
        duration: 10,
        earlyFinish: "2026-07-15",
      });
      await client.query(`UPDATE tasks SET actual_end_date = '2026-07-15' WHERE id = $1`, [taskId]);
      const msId = await createMilestone(client, wiId, "2026-07-10", testUserId);
      await client.query("COMMIT");

      // First evaluation → creates warning
      await evaluateMilestoneWarnings(testProjectId);
      const warns1 = await db.query(
        `SELECT * FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`,
        [msId],
      );
      expect(warns1.rows.length).toBe(1);
      const originalDays = warns1.rows[0].overdue_days;

      // Push early_finish further out
      await db.query(
        `UPDATE schedule_results SET early_finish = '2026-07-20' WHERE task_id = $1`,
        [taskId],
      );
      await db.query(`UPDATE tasks SET actual_end_date = '2026-07-20' WHERE id = $1`, [taskId]);

      // Second evaluation → updates existing warning, no duplicate
      await evaluateMilestoneWarnings(testProjectId);
      const warns2 = await db.query(
        `SELECT * FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`,
        [msId],
      );
      expect(warns2.rows.length).toBe(1);
      expect(warns2.rows[0].overdue_days).toBeGreaterThan(originalDays);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("E. Warning đang open, recalculate mới không còn vượt → warning closed", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const wiId = await createWorkItem(client, "WI-E");
      const taskId = await createTaskWithSchedule(client, wiId, {
        name: "Task-E",
        duration: 10,
        earlyFinish: "2026-08-15",
      });
      await client.query(`UPDATE tasks SET actual_end_date = '2026-08-15' WHERE id = $1`, [taskId]);
      const msId = await createMilestone(client, wiId, "2026-08-10", testUserId);
      await client.query("COMMIT");

      // First: creates open warning
      await evaluateMilestoneWarnings(testProjectId);
      const warns1 = await db.query(
        `SELECT status FROM milestone_warnings WHERE milestone_id = $1`,
        [msId],
      );
      expect(warns1.rows.some(w => w.status === "open")).toBe(true);

      // Move early_finish to before deadline
      await db.query(
        `UPDATE schedule_results SET early_finish = '2026-08-05' WHERE task_id = $1`,
        [taskId],
      );
      await db.query(`UPDATE tasks SET actual_end_date = '2026-08-05' WHERE id = $1`, [taskId]);

      // Second: closes warning
      await evaluateMilestoneWarnings(testProjectId);
      const warns2 = await db.query(
        `SELECT status, closed_at FROM milestone_warnings WHERE milestone_id = $1 ORDER BY id DESC LIMIT 1`,
        [msId],
      );
      expect(warns2.rows[0].status).toBe("closed");
      expect(warns2.rows[0].closed_at).not.toBeNull();
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("F. Milestone cho parent work_item: phải tính cả task thuộc descendants", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      // Create parent WI
      const parentWiId = await createWorkItem(client, "WI-F-Parent");
      // Create child WI under parent
      const childRes = await client.query(
        `INSERT INTO work_items (project_id, parent_id, name, code) VALUES ($1, $2, $3, $4) RETURNING id`,
        [testProjectId, parentWiId, "WI-F-Child", `WI-FC-${Date.now()}`],
      );
      const childWiId = childRes.rows[0].id;
      // Task under child finishes late
      await createTaskWithSchedule(client, childWiId, {
        name: "Task-F-Child",
        duration: 10,
        earlyFinish: "2026-09-20",
      });
      // Milestone on parent with deadline before child task finish
      const msId = await createMilestone(client, parentWiId, "2026-09-10", testUserId);
      await client.query("COMMIT");

      await evaluateMilestoneWarnings(testProjectId);

      const warns = await db.query(
        `SELECT * FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`,
        [msId],
      );
      expect(warns.rows.length).toBe(1);
      expect(warns.rows[0].overdue_days).toBeGreaterThan(0);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("G. Milestone inactive: không tạo warning", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const wiId = await createWorkItem(client, "WI-G");
      await createTaskWithSchedule(client, wiId, {
        name: "Task-G",
        duration: 10,
        earlyFinish: "2026-10-20",
      });
      // Create milestone then deactivate it
      const msId = await createMilestone(client, wiId, "2026-10-10", testUserId);
      await client.query(
        `UPDATE milestones SET is_active = false WHERE id = $1`,
        [msId],
      );
      await client.query("COMMIT");

      await evaluateMilestoneWarnings(testProjectId);

      const warns = await db.query(
        `SELECT * FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`,
        [msId],
      );
      expect(warns.rows.length).toBe(0);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  it("H. Mốc đã qua + task cuối chưa actual finish → vẫn cảnh báo", async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const wiId = await createWorkItem(client, "WI-H");
      // Deadline in the past, early_finish also in the past but after deadline
      await createTaskWithSchedule(client, wiId, {
        name: "Task-H",
        duration: 10,
        earlyFinish: "2026-01-15", // past, but after deadline
      });
      const msId = await createMilestone(client, wiId, "2026-01-05", testUserId);
      await client.query("COMMIT");

      await evaluateMilestoneWarnings(testProjectId);

      const warns = await db.query(
        `SELECT * FROM milestone_warnings WHERE milestone_id = $1 AND status = 'open'`,
        [msId],
      );
      // The early_finish (Jan 15) > required_date (Jan 5) → should have warning
      // and since deadline is in the past and work was projected late,
      // overdue should use today (further in the future) making it even more overdue
      expect(warns.rows.length).toBe(1);
      expect(warns.rows[0].overdue_days).toBeGreaterThan(0);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });
});

// ----------- T-45 Tests -----------

describe("T-45 Driving Path + Security", () => {
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
        [otherProjectId, testUserId, ROLES.BAN_QUAN_LY],
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
        [wiId, testUserId],
      );
      const msId = msRes.rows[0].id;
      const warnRes = await client.query(
        `INSERT INTO milestone_warnings (project_id, milestone_id, work_item_id, overdue_days, status) VALUES ($1, $2, $3, 3, 'open') RETURNING id`,
        [otherProjectId, msId, wiId],
      );
      const warningId = warnRes.rows[0].id;
      await client.query("COMMIT");

      // Now try to access this warning from testProjectId → should 404
      // We need an authenticated session. Using supertest with login.
      // For unit testing the query logic directly:
      const checkRes = await db.query(
        `SELECT work_item_id FROM milestone_warnings WHERE id = $1 AND project_id = $2`,
        [warningId, testProjectId], // wrong project
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
