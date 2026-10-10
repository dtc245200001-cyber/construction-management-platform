const db = require("../config/db");

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
        sr.calculated_at,
        bi.planned_early_start,
        bi.planned_early_finish,
        bi.planned_late_start,
        bi.planned_late_finish,
        bi.was_critical AS was_critical_baseline,
        (p.current_baseline_version IS NOT NULL) AS has_baseline
      FROM tasks t
      JOIN work_items wi ON wi.id = t.work_item_id
      JOIN projects p ON p.id = wi.project_id
      LEFT JOIN schedule_results sr ON sr.task_id = t.id
      LEFT JOIN baselines b ON b.project_id = p.id AND b.version = p.current_baseline_version
      LEFT JOIN baseline_items bi ON bi.baseline_id = b.id AND bi.task_id = t.id
      WHERE p.id = $1
        AND (
          $2::boolean IS NULL
          OR sr.is_critical = $2
        )
      ORDER BY sr.early_start NULLS LAST, t.id
    `,
    [projectId, criticalOnly]
  );

  let currentFinish = null;
  let plannedFinish = await getPlannedFinish(projectId);
  
  const currentRes = await db.query(
    `SELECT MAX(sr.early_finish) as max_current 
     FROM schedule_results sr 
     JOIN tasks t ON t.id = sr.task_id 
     JOIN work_items wi ON wi.id = t.work_item_id 
     WHERE wi.project_id = $1`,
    [projectId]
  );
  if (currentRes.rows.length > 0) {
    currentFinish = currentRes.rows[0].max_current;
  }

  const { workingDayDiff, DEFAULT_CALENDAR } = require("../algorithms/workingDays");
  const calRes = await db.query("SELECT * FROM calendars WHERE project_id = $1", [projectId]);
  const holRes = await db.query("SELECT holiday_date FROM holidays WHERE project_id = $1", [projectId]);
  const calendar = calRes.rows.length > 0 ? calRes.rows[0] : DEFAULT_CALENDAR;
  const holidays = holRes.rows.map(r => r.holiday_date);

  let delayWorkingDays = 0;
  let status = "on_track";

  if (currentFinish && plannedFinish) {
    delayWorkingDays = workingDayDiff(plannedFinish, currentFinish, calendar, holidays);
    if (delayWorkingDays > 0) status = "late";
    else if (delayWorkingDays < 0) status = "early";
  }

  const rows = result.rows;
  rows.summary = { currentFinish, plannedFinish, delayWorkingDays, status, hasBaseline: rows.length > 0 && rows[0].has_baseline === true };
  return rows;
}

async function getPlannedFinish(projectId) {
  const result = await db.query(
    `SELECT MAX(bi.planned_early_finish) as max_planned 
     FROM baseline_items bi
     JOIN baselines b ON b.id = bi.baseline_id
     JOIN projects p ON p.id = b.project_id AND p.current_baseline_version = b.version
     WHERE p.id = $1`,
    [projectId]
  );
  return result.rows[0]?.max_planned || null;
}

module.exports = {
  getScheduleResults,
  getPlannedFinish,
};