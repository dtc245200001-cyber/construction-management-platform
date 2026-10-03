const db = require("../config/db");

async function getScheduleResults(projectId, criticalOnly = null) {
  const result = await db.query(
    `
      SELECT
        w.id,
        w.project_id,
        w.name,
        w.code,
        sr.early_start,
        sr.early_finish,
        sr.late_start,
        sr.late_finish,
        sr.total_float,
        sr.is_critical,
        sr.calculated_at
      FROM work_items w
      LEFT JOIN schedule_results sr
        ON sr.work_item_id = w.id
      WHERE w.project_id = $1
        AND (
          $2::boolean IS NULL
          OR sr.is_critical = $2
        )
      ORDER BY sr.early_start NULLS LAST, w.id
    `,
    [projectId, criticalOnly]
  );

  return result.rows;
}

module.exports = {
  getScheduleResults,
};