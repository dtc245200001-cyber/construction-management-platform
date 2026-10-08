const db = require("../config/db");

const { workingDayDiff, DEFAULT_CALENDAR } = require("../algorithms/workingDays");

async function getPlannedFinish(projectId, client = db) {
  const result = await client.query(
    `
      SELECT MAX(sr.planned_early_finish) as max_finish
      FROM tasks t
      JOIN work_items wi ON wi.id = t.work_item_id
      JOIN schedule_results sr ON sr.task_id = t.id
      WHERE wi.project_id = $1
    `,
    [projectId]
  );
  return result.rows[0]?.max_finish;
}

async function getScheduleResults(projectId, criticalOnly = null) {
  const result = await db.query(
    `
      SELECT
        t.id,
        t.name,
        t.duration_days,
        t.work_item_id,
        wi.name AS work_item_name,
        to_char(t.actual_start_date, 'YYYY-MM-DD') AS actual_start_date,
        to_char(t.actual_end_date, 'YYYY-MM-DD') AS actual_end_date,
        COALESCE(t.percent_complete, 0) AS percent_complete,
        sr.early_start,
        sr.early_finish,
        sr.late_start,
        sr.late_finish,
        sr.total_float,
        sr.is_critical,
        sr.planned_early_start,
        sr.planned_early_finish,
        sr.planned_is_critical,
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

  return result.rows.map(row => ({
    ...row,
    newly_critical: row.is_critical && !row.planned_is_critical
  }));
}

module.exports = {
  getScheduleResults,
  getPlannedFinish,
};