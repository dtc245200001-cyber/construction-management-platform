const db = require('../config/db');
const {
  countWorkingDays,
  DEFAULT_CALENDAR,
} = require('../algorithms/workingDays');

/**
 * Load the project's working calendar from the `calendars` table.
 * Falls back to DEFAULT_CALENDAR (Mon–Sat working, Sun off) when no row exists.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} projectId
 * @returns {Promise<object>}
 */
async function loadProjectCalendar(client, projectId) {
  const res = await client.query(
    `SELECT monday, tuesday, wednesday, thursday, friday, saturday, sunday
     FROM calendars WHERE project_id = $1 LIMIT 1`,
    [projectId],
  );
  return res.rows.length > 0 ? res.rows[0] : DEFAULT_CALENDAR;
}

/**
 * Load the project's holiday list from the `holidays` table.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} projectId
 * @returns {Promise<Array<{holiday_date: string}>>}
 */
async function loadProjectHolidays(client, projectId) {
  const res = await client.query(
    `SELECT holiday_date FROM holidays WHERE project_id = $1`,
    [projectId],
  );
  return res.rows;
}

/**
 * Evaluate milestone warnings for a project.
 *
 * Rules:
 * - Only active milestones are evaluated.
 * - Descendants of the milestone's work_item are included (recursive CTE).
 * - overdue = working days between (required_date + 1) and effectiveEnd (exclusive of deadline itself).
 * - effectiveEnd = max(early_finish) among descendant tasks when all tasks have actual_end_date,
 *   OR today's date if any task in the subtree is still missing actual_end_date and the deadline has passed.
 * - Only 1 open warning per milestone (DB unique partial index enforces this).
 * - If still overdue → upsert (insert or update overdue_days).
 * - If no longer overdue → close existing open warning.
 * - Inactive/deleted/deactivated milestones are not selected; their open warnings stay as-is
 *   (caller should close them separately when deactivating).
 *
 * @param {number} projectId
 */
async function evaluateMilestoneWarnings(projectId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const calendar = await loadProjectCalendar(client, projectId);
    const holidays = await loadProjectHolidays(client, projectId);

    const milestonesRes = await client.query(`
      SELECT m.id as milestone_id, m.work_item_id, m.required_date
      FROM milestones m
      JOIN work_items w ON w.id = m.work_item_id
      WHERE w.project_id = $1 AND m.is_active = true
    `, [projectId]);

    for (const row of milestonesRes.rows) {
      const descendantsRes = await client.query(`
        WITH RECURSIVE work_item_tree AS (
          SELECT id FROM work_items WHERE id = $1
          UNION ALL
          SELECT w.id FROM work_items w
          INNER JOIN work_item_tree wt ON w.parent_id = wt.id
        )
        SELECT id FROM work_item_tree
      `, [row.work_item_id]);

      const workItemIds = descendantsRes.rows.map(r => r.id);

      const taskInfoRes = await client.query(`
        WITH max_ef_val AS (
          SELECT MAX(sr.early_finish) as max_ef
          FROM tasks t
          LEFT JOIN schedule_results sr ON sr.task_id = t.id
          WHERE t.work_item_id = ANY($1::int[])
        )
        SELECT
          (SELECT max_ef FROM max_ef_val) as max_ef,
          MAX(t.actual_end_date) as max_actual_end,
          COUNT(t.id) as task_count,
          COUNT(t.id) FILTER (WHERE sr.early_finish = (SELECT max_ef FROM max_ef_val) AND t.actual_end_date IS NULL) as final_tasks_unfinished_count
        FROM tasks t
        LEFT JOIN schedule_results sr ON sr.task_id = t.id
        WHERE t.work_item_id = ANY($1::int[])
      `, [workItemIds]);

      const { max_ef: maxEf, max_actual_end: maxActualEnd, task_count: taskCount, final_tasks_unfinished_count: finalTasksUnfinishedCount } = taskInfoRes.rows[0];
      const today = new Date();

      // No tasks or no schedule data → skip
      if (Number(taskCount) === 0 || !maxEf) {
        const requiredDate = new Date(row.required_date);
        if (requiredDate < today && Number(taskCount) === 0) {
          await client.query(`
            UPDATE milestone_warnings
            SET status = 'closed', closed_at = NOW()
            WHERE milestone_id = $1 AND status = 'open'
          `, [row.milestone_id]);
        }
        continue;
      }

      let effectiveEnd = new Date(maxEf);
      const requiredDate = new Date(row.required_date);

      if (Number(finalTasksUnfinishedCount) === 0 && maxActualEnd) {
        // All final scheduled tasks have an actual end date, consider milestone complete
        effectiveEnd = new Date(maxActualEnd);
      } else {
        // Not finished yet
        if (requiredDate < today) {
          // If deadline is passed, effective end is at least today (since it's ongoing)
          // But if forecast is even later than today, use forecast
          effectiveEnd = new Date(Math.max(today.getTime(), new Date(maxEf).getTime()));
        }
      }

      // Calculate overdue: working days from day after required_date to effectiveEnd
      // "overdue phải là số ngày LÀM VIỆC sau required_date, không tính chính deadline"
      // So we count from the day after required_date to effectiveEnd (inclusive)
      const dayAfterDeadline = new Date(requiredDate);
      dayAfterDeadline.setUTCDate(dayAfterDeadline.getUTCDate() + 1);

      let daysExceeded = 0;
      if (effectiveEnd > requiredDate) {
        daysExceeded = countWorkingDays(dayAfterDeadline, effectiveEnd, calendar, holidays);
      }

      if (daysExceeded > 0) {
        await client.query(`
          INSERT INTO milestone_warnings (project_id, milestone_id, work_item_id, overdue_days, status, created_at)
          VALUES ($1, $2, $3, $4, 'open', NOW())
          ON CONFLICT (milestone_id) WHERE status = 'open'
          DO UPDATE SET overdue_days = $4
        `, [projectId, row.milestone_id, row.work_item_id, daysExceeded]);
      } else {
        await client.query(`
          UPDATE milestone_warnings
          SET status = 'closed', closed_at = NOW()
          WHERE milestone_id = $1 AND status = 'open'
        `, [row.milestone_id]);
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error evaluating milestone warnings:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close all open warnings for a specific milestone.
 * Called when milestone is deleted, deactivated, or modified.
 *
 * @param {number} milestoneId
 * @param {import('pg').PoolClient} [client]
 */
async function closeMilestoneWarnings(milestoneId, client) {
  const queryRunner = client || db;
  await queryRunner.query(`
    UPDATE milestone_warnings
    SET status = 'closed', closed_at = NOW()
    WHERE milestone_id = $1 AND status = 'open'
  `, [milestoneId]);
}

module.exports = {
  evaluateMilestoneWarnings,
  closeMilestoneWarnings,
  loadProjectCalendar,
  loadProjectHolidays,
};
