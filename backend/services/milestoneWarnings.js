const db = require('../config/db');
const { countWorkingDays, DEFAULT_CALENDAR } = require('../algorithms/workingDays');

async function evaluateMilestoneWarnings(projectId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Lịch + ngày lễ của dự án (giống cách scheduleCalculation.js đang lấy)
    const [calRes, holRes] = await Promise.all([
      client.query("SELECT * FROM calendars WHERE project_id = $1", [projectId]),
      client.query("SELECT holiday_date FROM holidays WHERE project_id = $1", [projectId]),
    ]);
    const calendar = calRes.rows[0] || DEFAULT_CALENDAR;
    const holidays = holRes.rows.map((r) => r.holiday_date);

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

      const maxEfRes = await client.query(`
        SELECT MAX(sr.early_finish) as max_ef
        FROM schedule_results sr
        JOIN tasks t ON t.id = sr.task_id
        WHERE t.work_item_id = ANY($1::int[])
      `, [workItemIds]);

      const maxEf = maxEfRes.rows[0].max_ef;
      if (!maxEf) continue;

      // Đếm đúng số NGÀY LÀM VIỆC vượt mốc (không phải ngày lịch).
      // required_date là ngày bắt buộc; nếu early_finish rơi đúng ngày đó thì
      // chưa vượt — chỉ đếm từ ngày SAU required_date tới early_finish.
      let daysExceeded = 0;
      const requiredDateStr = new Date(row.required_date).toISOString().slice(0, 10);
      const maxEfStr = new Date(maxEf).toISOString().slice(0, 10);
      if (maxEfStr > requiredDateStr) {
        const dayAfterRequired = new Date(row.required_date);
        dayAfterRequired.setUTCDate(dayAfterRequired.getUTCDate() + 1);
        daysExceeded = countWorkingDays(
          dayAfterRequired.toISOString().slice(0, 10),
          maxEfStr,
          calendar,
          holidays
        );
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

module.exports = { evaluateMilestoneWarnings };
