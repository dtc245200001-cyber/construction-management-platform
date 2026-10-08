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

    const columns = [
      { name: 'task_id', type: 'int[]' },
      { name: 'early_start', type: 'timestamp[]' },
      { name: 'early_finish', type: 'timestamp[]' },
      { name: 'late_start', type: 'timestamp[]' },
      { name: 'late_finish', type: 'timestamp[]' },
      { name: 'total_float', type: 'int[]' },
      { name: 'is_critical', type: 'boolean[]' },
      { name: 'planned_early_start', type: 'timestamp[]' },
      { name: 'planned_early_finish', type: 'timestamp[]' },
      { name: 'planned_is_critical', type: 'boolean[]' }
    ];

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

      // Planned dates (T-37)
      let plannedEsDate = null;
      let plannedEfDate = null;
      let plannedCrit = null;
      
      if (result.planned_ES !== undefined) {
        const pDuration = Math.max(0, (result.planned_EF || 0) - result.planned_ES);
        const pStartStr = addWorkingDays(projectStart, result.planned_ES, calendar, holidays);
        const pFinishStr = pDuration > 0 ? addWorkingDays(pStartStr, pDuration - 1, calendar, holidays) : pStartStr;
        plannedEsDate = new Date(`${pStartStr}T00:00:00.000Z`);
        plannedEfDate = new Date(`${pFinishStr}T00:00:00.000Z`);
        plannedCrit = result.planned_critical || false;
      }

      taskIds.push(Number(taskId));
      earlyStarts.push(new Date(`${earlyStartStr}T00:00:00.000Z`));
      earlyFinishes.push(new Date(`${earlyFinishStr}T00:00:00.000Z`));
      lateStarts.push(new Date(`${lateStartStr}T00:00:00.000Z`));
      lateFinishes.push(new Date(`${lateFinishStr}T00:00:00.000Z`));
      totalFloats.push(result.float);
      isCriticals.push(result.critical);
      plannedEarlyStarts.push(plannedEsDate);
      plannedEarlyFinishes.push(plannedEfDate);
      plannedIsCriticals.push(plannedCrit);
    }

    const unnestArgs = columns.map((c, i) => `$${i + 1}::${c.type}`).join(', ');
    const asList = columns.map(c => c.name).join(', ');
    const insertCols = [...columns.map(c => c.name), 'calculated_at', 'needs_recalculation'].join(', ');
    const selectCols = [...columns.map(c => c.name), 'CURRENT_TIMESTAMP', `$${columns.length + 1}`].join(', ');
    const updateSets = columns
      .filter(c => c.name !== 'task_id')
      .map(c => `${c.name} = EXCLUDED.${c.name}`)
      .join(',\n        ');

    // Bulk upsert
    await client.query(
      `
      INSERT INTO schedule_results (${insertCols})
      SELECT ${selectCols} FROM UNNEST(${unnestArgs}) AS t(${asList})
      ON CONFLICT (task_id)
      DO UPDATE SET
        ${updateSets},
        calculated_at = CURRENT_TIMESTAMP,
        needs_recalculation = $${columns.length + 1}
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