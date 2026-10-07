const db = require('../config/db');

// T-39 is pending, so using a simple date diff for now.
function calculateWorkingDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

async function evaluateMilestoneWarnings(projectId) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

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

      let maxEf = maxEfRes.rows[0].max_ef;
      if (!maxEf) continue;

      let daysExceeded = calculateWorkingDays(row.required_date, maxEf);

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

module.exports = {
  evaluateMilestoneWarnings,
  calculateWorkingDays
};
