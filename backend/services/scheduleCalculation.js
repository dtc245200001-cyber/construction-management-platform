const pool = require("../config/db");
const {
  buildGraph,
  topologicalSort,
  findCycleNodes,
} = require("../algorithms/cpm");
const { calculateSchedule } = require("../utils/scheduleAlgorithms");
const { saveScheduleResults } = require("./schedulePersistence");

/**
 * Calculate and persist schedule results for a project.
 *
 * Flow:
 * buildGraph -> topologicalSort -> calculateSchedule
 * -> map task results to work_item_id -> persist
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
        COUNT(*) FILTER (WHERE needs_recalculation = true) AS dirty_count
      FROM schedule_results sr
      JOIN work_items wi ON wi.id = sr.work_item_id
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

  const graph = await buildGraph(projectId, pool);

  const { sortedOrder, unresolvedNodes } = topologicalSort(graph);

  if (unresolvedNodes.length > 0) {
    const cycleNodes = findCycleNodes(graph, unresolvedNodes);
    const error = new Error("Schedule contains a dependency cycle");
    error.status = 400;
    error.cycleNodes = cycleNodes;
    throw error;
  }

  const tasks = Object.values(graph.nodes);

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

  const scheduleByWorkItem = {};

  for (const task of tasks) {
    const result = scheduleByTask[task.id];

    if (!result) {
      continue;
    }

    scheduleByWorkItem[task.workItemId] = result;
  }

  const savedCount = await saveScheduleResults(
    scheduleByWorkItem,
    project.start_date
  );

  return {
    projectId,
    savedCount,
    results: scheduleByWorkItem,
  };
}

module.exports = {
  calculateAndSaveSchedule,
};
