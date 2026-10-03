const pool = require("../config/db");

/**
 * Convert a schedule offset (number of days) to a Date.
 *
 * @param {Date|string} projectStart
 * @param {number} offsetDays
 * @returns {Date|null}
 */
function addDays(projectStart, offsetDays) {
  if (projectStart === null || projectStart === undefined) {
    return null;
  }

  const date = new Date(projectStart);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid projectStart");
  }

  date.setDate(date.getDate() + Number(offsetDays || 0));
  return date;
}

/**
 * Persist calculated schedule results into schedule_results.
 *
 * After a successful calculation, needs_recalculation is set to false.
 *
 * ES/EF/LS/LF are calculated by T-21 as day offsets.
 * They are converted to timestamps using projectStart before persistence.
 *
 * @param {Object} scheduleResults
 * @param {Date|string} projectStart
 * @returns {Promise<number>} number of persisted results
 */
async function saveScheduleResults(scheduleResults, projectStart) {
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

    for (const [workItemId, result] of entries) {
      await client.query(
        `
        INSERT INTO schedule_results (
          work_item_id,
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
        ON CONFLICT (work_item_id)
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
          Number(workItemId),
          addDays(projectStart, result.ES),
          addDays(projectStart, result.EF),
          addDays(projectStart, result.LS),
          addDays(projectStart, result.LF),
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