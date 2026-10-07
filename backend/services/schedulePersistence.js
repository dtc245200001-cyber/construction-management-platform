const pool = require("../config/db");
const {
  addWorkingDays,
  parseDate,
  DEFAULT_CALENDAR,
} = require("../algorithms/workingDays");

/**
 * Convert a schedule offset (number of working days) to a Date.
 *
 * @param {Date|string} projectStart
 * @param {number} offsetDays
 * @param {Object} [calendar=DEFAULT_CALENDAR]
 * @param {Array} [holidays=[]]
 * @returns {Date|null}
 */
function addDays(
  projectStart,
  offsetDays,
  calendar = DEFAULT_CALENDAR,
  holidays = []
) {
  if (projectStart === null || projectStart === undefined) {
    return null;
  }

  const parsed = parseDate(projectStart);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid projectStart");
  }

  const dateStr = addWorkingDays(
    parsed,
    Number(offsetDays || 0),
    calendar,
    holidays
  );
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Persist calculated schedule results into schedule_results using working days calculations.
 *
 * After a successful calculation, needs_recalculation is set to false.
 *
 * @param {Object} scheduleResults
 * @param {Date|string} projectStart
 * @param {Object} [calendar=DEFAULT_CALENDAR]
 * @param {Array} [holidays=[]]
 * @returns {Promise<number>} number of persisted results
 */
async function saveScheduleResults(
  scheduleResults,
  projectStart,
  calendar = DEFAULT_CALENDAR,
  holidays = []
) {
  const entries = Object.entries(scheduleResults || {});

  if (entries.length === 0) {
    return 0;
  }

  if (!projectStart) {
    throw new Error("projectStart is required");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const [taskId, result] of entries) {
      const duration =
        result.EF !== undefined && result.ES !== undefined
          ? Math.max(0, result.EF - result.ES)
          : 0;

      // Early dates
      const earlyStartStr = addWorkingDays(
        projectStart,
        result.ES || 0,
        calendar,
        holidays
      );
      const earlyFinishStr =
        duration > 0
          ? addWorkingDays(earlyStartStr, duration - 1, calendar, holidays)
          : earlyStartStr;

      // Late dates
      const lateStartStr = addWorkingDays(
        projectStart,
        result.LS || 0,
        calendar,
        holidays
      );
      const lateFinishStr =
        duration > 0
          ? addWorkingDays(lateStartStr, duration - 1, calendar, holidays)
          : lateStartStr;

      await client.query(
        `
        INSERT INTO schedule_results (
          task_id,
          early_start,
          early_finish,
          late_start,
          late_finish,
          total_float,
          is_critical,
          calculated_at,
          needs_recalculation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, false)
        ON CONFLICT (task_id)
        DO UPDATE SET
          early_start = EXCLUDED.early_start,
          early_finish = EXCLUDED.early_finish,
          late_start = EXCLUDED.late_start,
          late_finish = EXCLUDED.late_finish,
          total_float = EXCLUDED.total_float,
          is_critical = EXCLUDED.is_critical,
          calculated_at = CURRENT_TIMESTAMP,
          needs_recalculation = false
        `,
        [
          Number(taskId),
          new Date(`${earlyStartStr}T00:00:00.000Z`),
          new Date(`${earlyFinishStr}T00:00:00.000Z`),
          new Date(`${lateStartStr}T00:00:00.000Z`),
          new Date(`${lateFinishStr}T00:00:00.000Z`),
          result.float,
          result.critical,
        ]
      );
    }

    await client.query("COMMIT");

    return entries.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  saveScheduleResults,
  addDays,
};