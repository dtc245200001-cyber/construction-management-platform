const db = require("../config/db");

async function getScheduleResults(projectId, criticalOnly = null) {
  const result = await db.query(
    `
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
      JOIN work_items wi
        ON wi.id = t.work_item_id
      LEFT JOIN schedule_results sr
        ON sr.task_id = t.id
      WHERE wi.project_id = $1
        AND (
          $2::boolean IS NULL
          OR sr.is_critical = $2
        )
      ORDER BY sr.early_start NULLS LAST, t.id
    `,
    [projectId, criticalOnly]
  );

  return result.rows;
}

module.exports = {
  getScheduleResults,
};