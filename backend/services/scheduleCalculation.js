const pool = require("../config/db");
const {
  buildGraph,
  topologicalSort,
  findCycleNodes,
} = require("../algorithms/cpm");
const { calculateSchedule } = require("../utils/scheduleAlgorithms");
const { saveScheduleResults } = require("./schedulePersistence");
const { evaluateMilestoneWarnings } = require("./milestoneWarnings");
const {
  countWorkingDays,
  parseDate,
  DEFAULT_CALENDAR,
} = require("../algorithms/workingDays");

/**
 * Calculate and persist schedule results for a project.
 *
 * Flow:
 * buildGraph -> topologicalSort -> calculateSchedule
 * -> persist schedule results by task_id using project calendar & holidays
 */
async function calculateAndSaveSchedule(projectId, clockDate = null, expectedVersion = null) {
  const projectResult = await pool.query(
    `
      SELECT id, start_date, schedule_version, last_schedule_calculated_date
      FROM projects
      WHERE id = $1
    `,
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    const error = new Error("Project not found");
    error.status = 404;
    throw error;
  }

  const project = projectResult.rows[0];

  const currentVersion = expectedVersion !== null ? expectedVersion : project.schedule_version;
  const todayDateStr = clockDate ? new Date(clockDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const lastCalcDateStr = project.last_schedule_calculated_date ? new Date(project.last_schedule_calculated_date).toISOString().split('T')[0] : null;

  const scheduleState = await pool.query(
    `
      SELECT
        COUNT(*) AS result_count,
        COUNT(*) FILTER (WHERE sr.needs_recalculation = true) AS dirty_count,
        COUNT(*) FILTER (WHERE t.actual_start_date IS NOT NULL AND t.actual_end_date IS NULL) as in_progress_count
      FROM schedule_results sr
      JOIN tasks t ON t.id = sr.task_id
      JOIN work_items wi ON wi.id = t.work_item_id
      WHERE wi.project_id = $1
    `,
    [projectId]
  );

  const { result_count, dirty_count, in_progress_count } = scheduleState.rows[0];

  const forceRecalculate = Number(in_progress_count) > 0 && lastCalcDateStr !== todayDateStr;

  if (Number(result_count) > 0 && Number(dirty_count) === 0 && !forceRecalculate) {
    return {
      projectId,
      savedCount: 0,
      recalculated: false,
      results: {},
    };
  }

  if (!project.start_date) {
    const error = new Error("Project start_date is required");
    error.status = 400;
    throw error;
  }

  // Load project calendar & holidays (T-38 / T-40)
  const [calRes, holRes] = await Promise.all([
    pool.query("SELECT * FROM calendars WHERE project_id = $1", [projectId]),
    pool.query(
      "SELECT holiday_date FROM holidays WHERE project_id = $1",
      [projectId]
    ),
  ]);

  const calendar = calRes.rows[0] || DEFAULT_CALENDAR;
  const holidays = holRes.rows.map((r) => r.holiday_date);

  const graph = await buildGraph(projectId, pool);

  const { sortedOrder, unresolvedNodes } = topologicalSort(graph);

  if (unresolvedNodes.length > 0) {
    const cycleNodes = findCycleNodes(graph, unresolvedNodes);

    const cycleNames = cycleNodes.map(
      (id) => graph.nodes[id]?.name || `#${id}`
    );

    const waitPairs = [];

    for (let i = 0; i < cycleNames.length; i++) {
      const current = cycleNames[i];
      const next = cycleNames[(i + 1) % cycleNames.length];

      waitPairs.push(`${current} chờ ${next}`);
    }

    // Đóng vòng cho giống route tạo quan hệ: A → C → B → A
    const closedNames = [...cycleNames, cycleNames[0]];
    const cyclePath = closedNames.join(" → ");

    const error = new Error(
      `Không thể tính tiến độ vì dữ liệu có vòng phụ thuộc: ${waitPairs.join(", ")}.`
    );

    error.status = 422;
    error.code = "DEPENDENCY_CYCLE";
    error.cycleNodes = cycleNodes;
    error.cycleNames = closedNames;
    error.cyclePath = cyclePath;

    throw error;
  }

    const projStart = parseDate(project.start_date);
  let todayOffset = 0;
  if (parseDate(todayDateStr).getTime() >= projStart.getTime()) {
    todayOffset = countWorkingDays(project.start_date, todayDateStr, calendar, holidays) - 1;
  }

  const tasks = Object.values(graph.nodes).map((task) => {
    // Logic thuc te (Buoc 3)
    if (task.actual_start_date) {
      let offsetStart = 0;
      const taskStart = parseDate(task.actual_start_date);
      if (taskStart.getTime() >= projStart.getTime()) {
        offsetStart = countWorkingDays(project.start_date, task.actual_start_date, calendar, holidays) - 1;
      } else {
        offsetStart = -(countWorkingDays(task.actual_start_date, project.start_date, calendar, holidays) - 1);
      }
      offsetStart = Math.max(0, offsetStart);

      if (task.actual_end_date) {
        // Da hoan thanh
        let offsetEnd = 0;
        const taskEnd = parseDate(task.actual_end_date);
        if (taskEnd.getTime() >= projStart.getTime()) {
          offsetEnd = countWorkingDays(project.start_date, task.actual_end_date, calendar, holidays) - 1;
        } else {
          offsetEnd = -(countWorkingDays(task.actual_end_date, project.start_date, calendar, holidays) - 1);
        }
        
        const ES = offsetStart;
        const EF = offsetEnd + 1;
        
        return {
          ...task,
          manualOffset: ES,
          duration: Math.max(0, EF - ES),
          isActual: true,
          schedulingMode: 'manual'
        };
      } else {
        // Dang lam
        const ES = offsetStart;
        const percent = task.percent_complete || 0;
        const remaining = Math.ceil(task.duration * (100 - percent) / 100);
        const EF = Math.max(ES + task.duration, todayOffset + remaining);
        
        return {
          ...task,
          manualOffset: ES,
          duration: Math.max(0, EF - ES),
          isActual: true,
          schedulingMode: 'manual'
        };
      }
    }

    if (task.schedulingMode === 'manual' && task.manualStartDate) {
      let offset = 0;
      const taskStart = parseDate(task.manualStartDate);
      if (taskStart.getTime() >= projStart.getTime()) {
        offset = countWorkingDays(project.start_date, task.manualStartDate, calendar, holidays) - 1;
      } else {
        offset = -(countWorkingDays(task.manualStartDate, project.start_date, calendar, holidays) - 1);
      }
      return { ...task, manualOffset: Math.max(0, offset) };
    }
    return task;
  });

  const dependencies = [];

  for (const sourceId of Object.keys(graph.adjList)) {
    for (const edge of graph.adjList[sourceId]) {
      dependencies.push({
        from: Number(sourceId),
        to: edge.target,
        type: edge.type,
        lag: edge.delay,
      });
    }
  }

  const scheduleByTask = calculateSchedule(
    tasks,
    dependencies,
    sortedOrder,
    0
  );

  const savedCount = await saveScheduleResults(
    projectId,
    scheduleByTask,
    project.start_date,
    calendar,
    holidays,
    currentVersion,
    clockDate
  );

  // T-44: Evaluate milestone warnings using the newly calculated schedule results
  await evaluateMilestoneWarnings(projectId);

  return {
    projectId,
    savedCount,
    results: scheduleByTask,
    recalculated: true,
  };
}

async function runScheduleJobAsync(jobId, projectId, clockDate = null, expectedVersion = null) {
  try {
    await pool.query(`UPDATE schedule_jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
    await calculateAndSaveSchedule(projectId, clockDate, expectedVersion);
    await pool.query(`UPDATE schedule_jobs SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [jobId]);
  } catch (error) {
    const errorDetails = {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      cycleNodes: error.cycleNodes || null,
      cycleNames: error.cycleNames || null,
      cyclePath: error.cyclePath || null
    };
    await pool.query(
      `UPDATE schedule_jobs SET status = 'failed', error_details = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [JSON.stringify(errorDetails), jobId]
    );
  }
}

module.exports = {
  calculateAndSaveSchedule,
  runScheduleJobAsync,
};
