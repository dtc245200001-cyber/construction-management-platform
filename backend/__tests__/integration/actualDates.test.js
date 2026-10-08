const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const { getScheduleResults } = require("../../services/scheduleQuery");
const { calculateAndSaveSchedule } = require("../../services/scheduleCalculation");

describe("Actual Dates Integration (A1)", () => {
  let projectId;
  let workItemId;

  beforeEach(async () => {
    // Seed project
    const projRes = await pool.query(
      `INSERT INTO projects (name, start_date) VALUES ('Test Project', '2026-10-01') RETURNING id`
    );
    projectId = projRes.rows[0].id;

    const wiRes = await pool.query(
      `INSERT INTO work_items (project_id, name) VALUES ($1, 'WI 1') RETURNING id`,
      [projectId]
    );
    workItemId = wiRes.rows[0].id;

    // Seed tasks (A -> B)
    // A: 3 days, B: 2 days. A -> B FS.
    // Early finish = 5 days from 2026-10-01
    const taskARes = await pool.query(
      `INSERT INTO tasks (work_item_id, name, duration_days, actual_start_date, actual_end_date, percent_complete) VALUES ($1, 'A', 3, NULL, NULL, 0) RETURNING id`,
      [workItemId]
    );
    const taskAId = taskARes.rows[0].id;

    const taskBRes = await pool.query(
      `INSERT INTO tasks (work_item_id, name, duration_days, actual_start_date, actual_end_date, percent_complete) VALUES ($1, 'B', 2, NULL, NULL, 0) RETURNING id`,
      [workItemId]
    );
    const taskBId = taskBRes.rows[0].id;

    // Dependency
    await pool.query(
      `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type) VALUES ($1, $2, 'FS')`,
      [taskAId, taskBId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
  });

  test("delaying a critical task delays project finish", async () => {
    // 1. Initial calculation
    await calculateAndSaveSchedule(projectId);
    let results = await getScheduleResults(projectId);
    // Expected max(early_finish): 2026-10-01 + 5 working days (minus 1 for finish date)
    // Oct 1 is Thursday. 
    // Thu(1), Fri(2), Mon(5), Tue(6), Wed(7). 5 days.
    const initialFinish = new Date(results.find(t => t.name === 'B').early_finish).getTime();

    // 2. Patch Task A with actual start date and end date (delay by 3 working days)
    // A originally takes 3 days (Thu, Fri, Mon).
    // Delaying by 3 working days means it ends on Thu(8). 6 days total.
    const taskARes = await pool.query(`SELECT t.id FROM tasks t JOIN work_items w ON w.id = t.work_item_id WHERE w.project_id = $1 AND t.name = 'A'`, [projectId]);
    const taskAId = taskARes.rows[0].id;
    await pool.query(
      `UPDATE tasks SET actual_start_date = '2026-10-01', actual_end_date = '2026-10-08', percent_complete = 100 WHERE id = $1`,
      [taskAId]
    );
    await pool.query(
      `UPDATE schedule_results SET needs_recalculation = true WHERE task_id = $1`,
      [taskAId]
    );

    // 3. Recalculate
    await calculateAndSaveSchedule(projectId);
    results = await getScheduleResults(projectId);

    const finalFinish = new Date(results.find(t => t.name === 'B').early_finish).getTime();
    
    // finalFinish should be > initialFinish (specifically 3 working days later)
    expect(finalFinish).toBeGreaterThan(initialFinish);
  });

  test("delaying non-critical task less than float does not change project finish", async () => {
    // Add parallel task C (1 day) running alongside A (3 days)
    const taskCRes = await pool.query(
      `INSERT INTO tasks (work_item_id, name, duration_days, percent_complete) VALUES ($1, 'C', 1, 0) RETURNING id`,
      [workItemId]
    );
    const taskCId = taskCRes.rows[0].id;
    // C connects to B (so C has float of 2 days)
    const taskBRes = await pool.query(`SELECT id FROM tasks WHERE name = 'B' AND work_item_id = $1`, [workItemId]);
    await pool.query(
      `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type) VALUES ($1, $2, 'FS')`,
      [taskCId, taskBRes.rows[0].id]
    );
    
    await calculateAndSaveSchedule(projectId);
    let results = await getScheduleResults(projectId);
    const initialFinish = new Date(results.find(t => t.name === 'B').early_finish).getTime();

    // Delay C by 1 day (actual duration = 2 days, less than 3 days of A)
    await pool.query(
      `UPDATE tasks SET actual_start_date = '2026-10-01', actual_end_date = '2026-10-02', percent_complete = 100 WHERE id = $1`,
      [taskCId]
    );
    await pool.query(`UPDATE schedule_results SET needs_recalculation = true WHERE task_id = $1`, [taskCId]);

    await calculateAndSaveSchedule(projectId);
    results = await getScheduleResults(projectId);
    const finalFinish = new Date(results.find(t => t.name === 'B').early_finish).getTime();
    
    expect(finalFinish).toEqual(initialFinish);
  });

  test("delaying non-critical task more than float delays project finish", async () => {
    // Add parallel task D (1 day) running alongside A (3 days)
    const taskDRes = await pool.query(
      `INSERT INTO tasks (work_item_id, name, duration_days, percent_complete) VALUES ($1, 'D', 1, 0) RETURNING id`,
      [workItemId]
    );
    const taskDId = taskDRes.rows[0].id;
    const taskBRes = await pool.query(`SELECT id FROM tasks WHERE name = 'B' AND work_item_id = $1`, [workItemId]);
    await pool.query(
      `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type) VALUES ($1, $2, 'FS')`,
      [taskDId, taskBRes.rows[0].id]
    );
    
    await calculateAndSaveSchedule(projectId);
    let results = await getScheduleResults(projectId);
    const initialFinish = new Date(results.find(t => t.name === 'B').early_finish).getTime();

    // Delay D by 4 days (actual duration = 5 days, more than 3 days of A)
    // Oct 1 to Oct 7 = 5 working days
    await pool.query(
      `UPDATE tasks SET actual_start_date = '2026-10-01', actual_end_date = '2026-10-07', percent_complete = 100 WHERE id = $1`,
      [taskDId]
    );
    await pool.query(`UPDATE schedule_results SET needs_recalculation = true WHERE task_id = $1`, [taskDId]);

    await calculateAndSaveSchedule(projectId);
    results = await getScheduleResults(projectId);
    const finalFinish = new Date(results.find(t => t.name === 'B').early_finish).getTime();
    
    expect(finalFinish).toBeGreaterThan(initialFinish);
    expect(results.find(t => t.name === 'D').is_critical).toBe(true);
  });

  test("in-progress task uses clockDate for remaining duration", async () => {
    await calculateAndSaveSchedule(projectId);
    let results = await getScheduleResults(projectId);
    const initialFinish = new Date(results.find(t => t.name === 'B').early_finish).getTime();

    // A is in progress (50% complete), started on Oct 1
    const taskARes = await pool.query(`SELECT id FROM tasks WHERE name = 'A' AND work_item_id = $1`, [workItemId]);
    const taskAId = taskARes.rows[0].id;
    await pool.query(
      `UPDATE tasks SET actual_start_date = '2026-10-01', actual_end_date = NULL, percent_complete = 50 WHERE id = $1`,
      [taskAId]
    );
    await pool.query(`UPDATE schedule_results SET needs_recalculation = true WHERE task_id = $1`, [taskAId]);

    // Suppose today is Oct 7 (Day 6 from start). A originally took 3 days.
    // 50% complete means remaining = ceil(3 * 0.5) = 2 days.
    // So A finishes 2 days after Oct 7 = Oct 9. Project finishes later.
    await calculateAndSaveSchedule(projectId, "2026-10-07T12:00:00Z");
    results = await getScheduleResults(projectId);
    const finalFinish = new Date(results.find(t => t.name === 'B').early_finish).getTime();
    
    expect(finalFinish).toBeGreaterThan(initialFinish);
  });

  test("timezone logic uses Asia/Ho_Chi_Minh correctly for clockDate", async () => {
    const taskARes = await pool.query(`SELECT id FROM tasks WHERE name = 'A' AND work_item_id = $1`, [workItemId]);
    const taskAId = taskARes.rows[0].id;
    await pool.query(
      `UPDATE tasks SET actual_start_date = '2026-10-01', actual_end_date = NULL, percent_complete = 50 WHERE id = $1`,
      [taskAId]
    );
    await pool.query(`UPDATE schedule_results SET needs_recalculation = true WHERE task_id = $1`, [taskAId]);

    // 23:30 UTC on Oct 7 is 06:30 AM on Oct 8 in Vietnam.
    // If it uses UTC, it sees Oct 7. If it uses Vietnam time, it sees Oct 8.
    await calculateAndSaveSchedule(projectId, "2026-10-07T23:30:00Z");
    const results = await getScheduleResults(projectId);
    
    const taskA = results.find(t => t.name === 'A');
    // If today is Oct 8 (Day 7 from Oct 1). A remaining = 2 days.
    // So A finishes on Oct 10. (Oct 1 to Oct 10 = 8 working days).
    // ES for A is 0, duration = 8, EF = 8.
    // Wait, Oct 8 is Thursday. 2 remaining days -> Thu, Fri -> finishes on Friday end.
    // Working days between Oct 1 and Oct 9 (Friday):
    // Thu 1, Fri 2, Sat 3, Mon 5, Tue 6, Wed 7, Thu 8, Fri 9 -> 8 days.
    expect(taskA.early_finish.toISOString()).toBe("2026-10-09T00:00:00.000Z");
  });
});
