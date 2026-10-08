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
  projectId,
  scheduleResults,
  projectStart,
  calendar = DEFAULT_CALENDAR,
  holidays = [],
  expectedVersion = null,
  clockDate = null
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

    // Lấy version hiện tại
    const versionRes = await client.query(
      `SELECT schedule_version FROM projects WHERE id = $1 FOR UPDATE`,
      [projectId]
    );

    if (versionRes.rows.length === 0) {
      throw new Error("Project not found");
    }

    const currentVersion = versionRes.rows[0].schedule_version;
    const isStale = expectedVersion !== null && currentVersion !== expectedVersion;

    const taskIds = [];
    const earlyStarts = [];
    const earlyFinishes = [];
    const lateStarts = [];
    const lateFinishes = [];
    const totalFloats = [];
    const isCriticals = [];
    const plannedEarlyStarts = [];
    const plannedEarlyFinishes = [];
    const plannedIsCriticals = [];

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

      taskIds.push(Number(taskId));
      earlyStarts.push(new Date(`${earlyStartStr}T00:00:00.000Z`));
      earlyFinishes.push(new Date(`${earlyFinishStr}T00:00:00.000Z`));
      lateStarts.push(new Date(`${lateStartStr}T00:00:00.000Z`));
      lateFinishes.push(new Date(`${lateFinishStr}T00:00:00.000Z`));
      totalFloats.push(result.float);
      isCriticals.push(result.critical);

      if (result.planned) {
        const plannedDuration = result.planned.EF !== undefined && result.planned.ES !== undefined 
          ? Math.max(0, result.planned.EF - result.planned.ES) 
          : 0;

        const plannedEarlyStartStr = addWorkingDays(projectStart, result.planned.ES || 0, calendar, holidays);
        const plannedEarlyFinishStr = plannedDuration > 0
          ? addWorkingDays(plannedEarlyStartStr, plannedDuration - 1, calendar, holidays)
          : plannedEarlyStartStr;

        plannedEarlyStarts.push(new Date(`${plannedEarlyStartStr}T00:00:00.000Z`));
        plannedEarlyFinishes.push(new Date(`${plannedEarlyFinishStr}T00:00:00.000Z`));
        plannedIsCriticals.push(result.planned.critical);
      } else {
        plannedEarlyStarts.push(null);
        plannedEarlyFinishes.push(null);
        plannedIsCriticals.push(false);
      }
    }

    // Bulk upsert
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
        needs_recalculation,
        planned_early_start,
        planned_early_finish,
        planned_is_critical
      )
      SELECT * FROM UNNEST(
        $1::int[], $2::timestamp[], $3::timestamp[], $4::timestamp[],
        $5::timestamp[], $6::int[], $7::boolean[],
        $8::timestamp[], $9::timestamp[], $10::boolean[]
      ) AS t(task_id, early_start, early_finish, late_start, late_finish, total_float, is_critical, planned_early_start, planned_early_finish, planned_is_critical)
      ON CONFLICT (task_id)
      DO UPDATE SET
        early_start = EXCLUDED.early_start,
        early_finish = EXCLUDED.early_finish,
        late_start = EXCLUDED.late_start,
        late_finish = EXCLUDED.late_finish,
        total_float = EXCLUDED.total_float,
        is_critical = EXCLUDED.is_critical,
        calculated_at = CURRENT_TIMESTAMP,
        needs_recalculation = $11,
        planned_early_start = EXCLUDED.planned_early_start,
        planned_early_finish = EXCLUDED.planned_early_finish,
        planned_is_critical = EXCLUDED.planned_is_critical
      `,
      [
        taskIds,
        earlyStarts,
        earlyFinishes,
        lateStarts,
        lateFinishes,
        totalFloats,
        isCriticals,
        plannedEarlyStarts,
        plannedEarlyFinishes,
        plannedIsCriticals,
        isStale // Nếu đã có thay đổi (stale), không xóa cờ dirty
      ]
    );

    // Cập nhật last_schedule_calculated_date cho dự án nếu không stale
    if (!isStale) {
      await client.query(
        `
        UPDATE projects
        SET last_schedule_calculated_date = $1
        WHERE id = $2
        `,
        [clockDate ? new Date(clockDate) : new Date(), projectId]
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