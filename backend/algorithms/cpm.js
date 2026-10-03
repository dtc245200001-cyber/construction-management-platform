"use strict";

/**
 * Láº¥y dá»¯ liá»‡u task cá»§a 1 dá»± Ã¡n báº±ng Ä‘Ãºng 2 truy váº¥n vÃ  dá»±ng Ä‘á»“ thá»‹.
 *
 * DB hiá»‡n táº¡i:
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
 * Output váº«n giá»¯ format mÃ  cÃ¡c thuáº­t toÃ¡n T-15/T-16/T-17
 * vÃ  calculateSchedule() Ä‘ang sá»­ dá»¥ng:
 * - nodes[id] = { id, name, duration }
 * - adjList
 * - reverseAdjList
 * - inDegree
 *
 * @param {number} projectId
 * @param {object} pool Äá»‘i tÆ°á»£ng db pool
 * @returns {object} { nodes, adjList, reverseAdjList, inDegree }
 */
async function buildGraph(projectId, pool) {
  // 1. Láº¥y toÃ n bá»™ task thuá»™c project
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

  // 2. Láº¥y toÃ n bá»™ dependency giá»¯a cÃ¡c task thuá»™c cÃ¹ng project
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

  // Khá»Ÿi táº¡o cÃ¡c Ä‘á»‰nh
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

  // Khá»Ÿi táº¡o cÃ¡c cáº¡nh
  for (const row of depsResult.rows) {
    const pre = row.predecessor_id;
    const suc = row.successor_id;

    // Bá» qua náº¿u task khÃ´ng tá»“n táº¡i trong graph hiá»‡n táº¡i
    if (!nodes[pre] || !nodes[suc]) {
      continue;
    }

    const edge = {
      type: row.dependency_type,
      delay: Number(row.lead_lag_days),
    };

    // Chiá»u xuÃ´i: predecessor -> successor
    adjList[pre].push({
      target: suc,
      ...edge,
    });

    // Chiá»u ngÆ°á»£c: successor -> predecessor
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
 * CÃ i Ä‘áº·t Kahn's algorithm (sáº¯p xáº¿p topo khÃ´ng Ä‘á»‡ quy)
 *
 * @param {object} graph
 * @returns {object} { sortedOrder: number[], unresolvedNodes: number[] }
 */
function topologicalSort(graph) {
  // Táº¡o báº£n sao inDegree Ä‘á»ƒ khÃ´ng lÃ m há»ng báº£n gá»‘c
  const currentInDegree = { ...graph.inDegree };

  // HÃ ng Ä‘á»£i lÆ°u cÃ¡c nÃºt cÃ³ báº­c vÃ o = 0
  const queue = [];

  // Khá»Ÿi táº¡o hÃ ng Ä‘á»£i
  for (const nodeIdStr in currentInDegree) {
    if (currentInDegree[nodeIdStr] === 0) {
      queue.push(Number(nodeIdStr));
    }
  }

  // Sort theo ID Ä‘á»ƒ Ä‘áº£m báº£o káº¿t quáº£ á»•n Ä‘á»‹nh
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

    // Giá»¯ thá»© tá»± á»•n Ä‘á»‹nh
    if (zeroInDegreeNeighbors.length > 0) {
      zeroInDegreeNeighbors.sort((a, b) => a - b);

      for (const node of zeroInDegreeNeighbors) {
        queue.push(node);
      }
    }
  }

  // Nhá»¯ng node chÆ°a sort Ä‘Æ°á»£c lÃ  node bá»‹ káº¹t bá»Ÿi cycle
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
 * Thu háº¹p danh sÃ¡ch unresolvedNodes vá» ÄÃšNG cÃ¡c nÃºt náº±m trÃªn má»™t vÃ²ng.
 *
 * @param {object} graph
 * @param {number[]} unresolvedNodes
 * @returns {number[]}
 */
function findCycleNodes(graph, unresolvedNodes) {
  // KhÃ´ng cÃ³ nÃºt chÆ°a giáº£i quyáº¿t
  if (!unresolvedNodes || unresolvedNodes.length === 0) {
    return [];
  }

  // Táº¡o Set Ä‘á»ƒ tra cá»©u nhanh
  const remaining = new Set(unresolvedNodes);

  // Chá»n node nhá» nháº¥t lÃ m Ä‘iá»ƒm báº¯t Ä‘áº§u
  let startNode = Infinity;

  for (const nodeId of remaining) {
    if (nodeId < startNode) {
      startNode = nodeId;
    }
  }

  const path = [startNode];
  const visited = new Set([startNode]);
  let current = startNode;

  // Truy váº¿t ngÆ°á»£c qua reverseAdjList
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let nextNode = -1;

    const predecessors = graph.reverseAdjList[current];

    if (predecessors) {
      for (const edge of predecessors) {
        if (!remaining.has(edge.target)) {
          continue;
        }

        // Æ¯u tiÃªn node Ä‘Ã£ thÄƒm Ä‘á»ƒ phÃ¡t hiá»‡n cycle
        if (visited.has(edge.target)) {
          nextNode = edge.target;
          break;
        }

        if (nextNode === -1) {
          nextNode = edge.target;
        }
      }
    }

    // KhÃ´ng cÃ²n Ä‘Æ°á»ng truy váº¿t
    if (nextNode === -1) {
      return [];
    }

    // ÄÃ£ quay láº¡i node cÅ© => tÃ¬m tháº¥y cycle
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
 * HÃ m tiá»‡n Ã­ch: phÃ¡t hiá»‡n vÃ²ng trong Ä‘á»“ thá»‹.
 *
 * @param {object} graph
 * @returns {number[]} Máº£ng ID cÃ¡c node náº±m trÃªn cycle.
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
