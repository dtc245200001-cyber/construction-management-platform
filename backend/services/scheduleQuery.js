const db = require("../config/db");
const { buildTempGraph, rotateCycleToStartWith } = require("../utils/buildTempGraph");
const { detectCycle } = require("../algorithms/cpm");
const { formatCycleSentence } = require("../utils/cycleMessage");

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

async function checkProjectCycle(projectId) {
  const itemsResult = await db.query(
    `SELECT t.id, t.name
     FROM tasks t
     JOIN work_items w ON w.id = t.work_item_id
     WHERE w.project_id = $1
     ORDER BY t.id`,
    [projectId]
  );

  const depsResult = await db.query(
    `SELECT
       d.predecessor_id,
       d.successor_id,
       d.dependency_type,
       d.lead_lag_days
     FROM dependencies d
     JOIN tasks pre_t ON pre_t.id = d.predecessor_id
     JOIN work_items pre ON pre.id = pre_t.work_item_id
     JOIN tasks suc_t ON suc_t.id = d.successor_id
     JOIN work_items suc ON suc.id = suc_t.work_item_id
     WHERE pre.project_id = $1 AND suc.project_id = $1`,
    [projectId]
  );

  const itemNames = new Map();
  for (const row of itemsResult.rows) {
    itemNames.set(Number(row.id), row.name);
  }

  const graph = buildTempGraph(itemsResult.rows, depsResult.rows);
  let cycleIds = detectCycle(graph);

  if (cycleIds && cycleIds.length > 0) {
    cycleIds = rotateCycleToStartWith(cycleIds, cycleIds[0]);
    const names = cycleIds.map(id => itemNames.get(Number(id)) || "(công việc không tên)");
    const sentence = formatCycleSentence(names);

    return {
      hasCycle: true,
      cycleIds,
      cycleNames: names,
      cycleSentence: sentence
    };
  }

  return { hasCycle: false };
}

module.exports = {
  getScheduleResults,
  checkProjectCycle,
};