"use strict";

/**
 * LÃ¡ÂºÂ¥y dÃ¡Â»Â¯ liÃ¡Â»â€¡u task cÃ¡Â»Â§a 1 dÃ¡Â»Â± ÃƒÂ¡n bÃ¡ÂºÂ±ng Ã„â€˜ÃƒÂºng 2 truy vÃ¡ÂºÂ¥n vÃƒÂ  dÃ¡Â»Â±ng Ã„â€˜Ã¡Â»â€œ thÃ¡Â»â€¹.
 *
 * DB hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i:
 * - tasks.id
 * - tasks.work_item_id
 * - tasks.name
 * - tasks.duration_days
 * - dependencies.predecessor_id
 * - dependencies.successor_id
 * - dependencies.dependency_type
 * - dependencies.lead_lag_days
 * - work_items.project_id
 *
 * Output vÃ¡ÂºÂ«n giÃ¡Â»Â¯ format mÃƒÂ  cÃƒÂ¡c thuÃ¡ÂºÂ­t toÃƒÂ¡n T-15/T-16/T-17
 * vÃƒÂ  calculateSchedule() Ã„â€˜ang sÃ¡Â»Â­ dÃ¡Â»Â¥ng:
 * - nodes[id] = { id, name, duration }
 * - adjList
 * - reverseAdjList
 * - inDegree
 *
 * @param {number} projectId
 * @param {object} pool Ã„ÂÃ¡Â»â€˜i tÃ†Â°Ã¡Â»Â£ng db pool
 * @returns {object} { nodes, adjList, reverseAdjList, inDegree }
 */
async function buildGraph(projectId, pool) {
  // 1. LÃ¡ÂºÂ¥y toÃƒÂ n bÃ¡Â»â„¢ task thuÃ¡Â»â„¢c project
  const tasksResult = await pool.query(
    `
      SELECT
        t.id,
        t.work_item_id,
        t.name,
        t.duration_days AS duration
      FROM tasks t
      JOIN work_items wi
        ON wi.id = t.work_item_id
      WHERE wi.project_id = $1
      ORDER BY t.id
    `,
    [projectId],
  );

  // 2. LÃ¡ÂºÂ¥y toÃƒÂ n bÃ¡Â»â„¢ dependency giÃ¡Â»Â¯a cÃƒÂ¡c task thuÃ¡Â»â„¢c cÃƒÂ¹ng project
  const depsResult = await pool.query(
    `
      SELECT
        d.predecessor_id,
        d.successor_id,
        d.dependency_type,
        d.lead_lag_days
      FROM dependencies d
      JOIN tasks pre_task
        ON pre_task.id = d.predecessor_id
      JOIN work_items pre_wi
        ON pre_wi.id = pre_task.work_item_id
      JOIN tasks suc_task
        ON suc_task.id = d.successor_id
      JOIN work_items suc_wi
        ON suc_wi.id = suc_task.work_item_id
      WHERE pre_wi.project_id = $1
        AND suc_wi.project_id = $1
      ORDER BY d.id
    `,
    [projectId],
  );

  const nodes = {};
  const adjList = {};
  const reverseAdjList = {};
  const inDegree = {};

  // KhÃ¡Â»Å¸i tÃ¡ÂºÂ¡o cÃƒÂ¡c Ã„â€˜Ã¡Â»â€°nh
  for (const row of tasksResult.rows) {
    const id = row.id;

    nodes[id] = {
      id: row.id,
      workItemId: row.work_item_id,
      name: row.name,
      duration: Number(row.duration),
    };

    adjList[id] = [];
    reverseAdjList[id] = [];
    inDegree[id] = 0;
  }

  // KhÃ¡Â»Å¸i tÃ¡ÂºÂ¡o cÃƒÂ¡c cÃ¡ÂºÂ¡nh
  for (const row of depsResult.rows) {
    const pre = row.predecessor_id;
    const suc = row.successor_id;

    // BÃ¡Â»Â qua nÃ¡ÂºÂ¿u task khÃƒÂ´ng tÃ¡Â»â€œn tÃ¡ÂºÂ¡i trong graph hiÃ¡Â»â€¡n tÃ¡ÂºÂ¡i
    if (!nodes[pre] || !nodes[suc]) {
      continue;
    }

    const edge = {
      type: row.dependency_type,
      delay: Number(row.lead_lag_days),
    };

    // ChiÃ¡Â»Âu xuÃƒÂ´i: predecessor -> successor
    adjList[pre].push({
      target: suc,
      ...edge,
    });

    // ChiÃ¡Â»Âu ngÃ†Â°Ã¡Â»Â£c: successor -> predecessor
    reverseAdjList[suc].push({
      target: pre,
      ...edge,
    });

    inDegree[suc]++;
  }

  return {
    nodes,
    adjList,
    reverseAdjList,
    inDegree,
  };
}

/**
 * CÃƒÂ i Ã„â€˜Ã¡ÂºÂ·t Kahn's algorithm (sÃ¡ÂºÂ¯p xÃ¡ÂºÂ¿p topo khÃƒÂ´ng Ã„â€˜Ã¡Â»â€¡ quy)
 *
 * @param {object} graph
 * @returns {object} { sortedOrder: number[], unresolvedNodes: number[] }
 */
function topologicalSort(graph) {
  // TÃ¡ÂºÂ¡o bÃ¡ÂºÂ£n sao inDegree Ã„â€˜Ã¡Â»Æ’ khÃƒÂ´ng lÃƒÂ m hÃ¡Â»Âng bÃ¡ÂºÂ£n gÃ¡Â»â€˜c
  const currentInDegree = { ...graph.inDegree };

  // HÃƒÂ ng Ã„â€˜Ã¡Â»Â£i lÃ†Â°u cÃƒÂ¡c nÃƒÂºt cÃƒÂ³ bÃ¡ÂºÂ­c vÃƒÂ o = 0
  const queue = [];

  // KhÃ¡Â»Å¸i tÃ¡ÂºÂ¡o hÃƒÂ ng Ã„â€˜Ã¡Â»Â£i
  for (const nodeIdStr in currentInDegree) {
    if (currentInDegree[nodeIdStr] === 0) {
      queue.push(Number(nodeIdStr));
    }
  }

  // Sort theo ID Ã„â€˜Ã¡Â»Æ’ Ã„â€˜Ã¡ÂºÂ£m bÃ¡ÂºÂ£o kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ Ã¡Â»â€¢n Ã„â€˜Ã¡Â»â€¹nh
  queue.sort((a, b) => a - b);

  const sortedOrder = [];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head];
    head++;

    sortedOrder.push(current);

    const neighbors = graph.adjList[current];
    if (!neighbors) continue;

    const zeroInDegreeNeighbors = [];

    for (const edge of neighbors) {
      const neighbor = edge.target;

      currentInDegree[neighbor]--;

      if (currentInDegree[neighbor] === 0) {
        zeroInDegreeNeighbors.push(neighbor);
      }
    }

    // GiÃ¡Â»Â¯ thÃ¡Â»Â© tÃ¡Â»Â± Ã¡Â»â€¢n Ã„â€˜Ã¡Â»â€¹nh
    if (zeroInDegreeNeighbors.length > 0) {
      zeroInDegreeNeighbors.sort((a, b) => a - b);

      for (const node of zeroInDegreeNeighbors) {
        queue.push(node);
      }
    }
  }

  // NhÃ¡Â»Â¯ng node chÃ†Â°a sort Ã„â€˜Ã†Â°Ã¡Â»Â£c lÃƒÂ  node bÃ¡Â»â€¹ kÃ¡ÂºÂ¹t bÃ¡Â»Å¸i cycle
  const unresolvedNodes = [];

  for (const nodeIdStr in currentInDegree) {
    if (currentInDegree[nodeIdStr] > 0) {
      unresolvedNodes.push(Number(nodeIdStr));
    }
  }

  unresolvedNodes.sort((a, b) => a - b);

  return {
    sortedOrder,
    unresolvedNodes,
  };
}

/**
 * Thu hÃ¡ÂºÂ¹p danh sÃƒÂ¡ch unresolvedNodes vÃ¡Â»Â Ã„ÂÃƒÅ¡NG cÃƒÂ¡c nÃƒÂºt nÃ¡ÂºÂ±m trÃƒÂªn mÃ¡Â»â„¢t vÃƒÂ²ng.
 *
 * @param {object} graph
 * @param {number[]} unresolvedNodes
 * @returns {number[]}
 */
function findCycleNodes(graph, unresolvedNodes) {
  // KhÃƒÂ´ng cÃƒÂ³ nÃƒÂºt chÃ†Â°a giÃ¡ÂºÂ£i quyÃ¡ÂºÂ¿t
  if (!unresolvedNodes || unresolvedNodes.length === 0) {
    return [];
  }

  // TÃ¡ÂºÂ¡o Set Ã„â€˜Ã¡Â»Æ’ tra cÃ¡Â»Â©u nhanh
  const remaining = new Set(unresolvedNodes);

  // ChÃ¡Â»Ân node nhÃ¡Â»Â nhÃ¡ÂºÂ¥t lÃƒÂ m Ã„â€˜iÃ¡Â»Æ’m bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u
  let startNode = Infinity;

  for (const nodeId of remaining) {
    if (nodeId < startNode) {
      startNode = nodeId;
    }
  }

  const path = [startNode];
  const visited = new Set([startNode]);
  let current = startNode;

  // Truy vÃ¡ÂºÂ¿t ngÃ†Â°Ã¡Â»Â£c qua reverseAdjList
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let nextNode = -1;

    const predecessors = graph.reverseAdjList[current];

    if (predecessors) {
      for (const edge of predecessors) {
        if (!remaining.has(edge.target)) {
          continue;
        }

        // Ã†Â¯u tiÃƒÂªn node Ã„â€˜ÃƒÂ£ thÃ„Æ’m Ã„â€˜Ã¡Â»Æ’ phÃƒÂ¡t hiÃ¡Â»â€¡n cycle
        if (visited.has(edge.target)) {
          nextNode = edge.target;
          break;
        }

        if (nextNode === -1) {
          nextNode = edge.target;
        }
      }
    }

    // KhÃƒÂ´ng cÃƒÂ²n Ã„â€˜Ã†Â°Ã¡Â»Âng truy vÃ¡ÂºÂ¿t
    if (nextNode === -1) {
      return [];
    }

    // Ã„ÂÃƒÂ£ quay lÃ¡ÂºÂ¡i node cÃ…Â© => tÃƒÂ¬m thÃ¡ÂºÂ¥y cycle
    if (visited.has(nextNode)) {
      const cycleStart = path.indexOf(nextNode);

      return path.slice(cycleStart);
    }

    visited.add(nextNode);
    path.push(nextNode);
    current = nextNode;
  }
}

/**
 * HÃƒÂ m tiÃ¡Â»â€¡n ÃƒÂ­ch: phÃƒÂ¡t hiÃ¡Â»â€¡n vÃƒÂ²ng trong Ã„â€˜Ã¡Â»â€œ thÃ¡Â»â€¹.
 *
 * @param {object} graph
 * @returns {number[]} MÃ¡ÂºÂ£ng ID cÃƒÂ¡c node nÃ¡ÂºÂ±m trÃƒÂªn cycle.
 */
function detectCycle(graph) {
  const { unresolvedNodes } = topologicalSort(graph);

  return findCycleNodes(graph, unresolvedNodes);
}

module.exports = {
  buildGraph,
  topologicalSort,
  findCycleNodes,
  detectCycle,
};
