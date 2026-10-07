const pool = require("../config/db");
const {
  buildGraph,
  topologicalSort,
  findCycleNodes,
} = require("../algorithms/cpm");
const { calculateSchedule } = require("../utils/scheduleAlgorithms");
const { saveScheduleResults } = require("./schedulePersistence");
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
async function calculateAndSaveSchedule(projectId) {
  const projectResult = await pool.query(
    `
      SELECT id, start_date
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

  const scheduleState = await pool.query(
    `
      SELECT
        COUNT(*) AS result_count,
        COUNT(*) FILTER (WHERE sr.needs_recalculation = true) AS dirty_count
      FROM schedule_results sr
      JOIN tasks t ON t.id = sr.task_id
      JOIN work_items wi ON wi.id = t.work_item_id
      WHERE wi.project_id = $1
    `,
    [projectId]
  );

  const { result_count, dirty_count } = scheduleState.rows[0];

  if (Number(result_count) > 0 && Number(dirty_count) === 0) {
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

  const tasks = Object.values(graph.nodes).map((task) => {
    if (task.schedulingMode === "manual" && task.manualStartDate) {
      let offset = 0;
      const taskStart = parseDate(task.manualStartDate);
      const projStart = parseDate(project.start_date);
      if (taskStart.getTime() >= projStart.getTime()) {
        offset =
          countWorkingDays(
            project.start_date,
            task.manualStartDate,
            calendar,
            holidays
          ) - 1;
      } else {
        offset = -(
          countWorkingDays(
            task.manualStartDate,
            project.start_date,
            calendar,
            holidays
          ) - 1
        );
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
    scheduleByTask,
    project.start_date,
    calendar,
    holidays
  );

  return {
    projectId,
    savedCount,
    results: scheduleByTask,
  };
}

module.exports = {
  calculateAndSaveSchedule,
};
