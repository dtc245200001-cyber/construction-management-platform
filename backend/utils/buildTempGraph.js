"use strict";

/**
 * Dựng đồ thị tạm thời từ danh sách công việc và quan hệ, bổ sung thêm một cạnh mới.
 * Không làm đột biến (mutate) dữ liệu đầu vào.
 * 
 * @param {Array} items Mảng các đối tượng {id, name, ...}
 * @param {Array} deps Mảng các đối tượng {predecessor_id, successor_id, ...}
 * @param {Object} newEdge Đối tượng {predecessor_id, successor_id, dependency_type, lead_lag_days}
 * @returns {Object} Đồ thị { nodes, adjList, reverseAdjList, inDegree }
 */
function buildTempGraph(items, deps, newEdge) {
  const nodes = {};
  const adjList = {};
  const reverseAdjList = {};
  const inDegree = {};

  // Khởi tạo đồ thị
  for (const item of items) {
    const id = Number(item.id);
    nodes[id] = { ...item, id };
    adjList[id] = [];
    reverseAdjList[id] = [];
    inDegree[id] = 0;
  }

  // Hàm phụ trợ thêm cạnh
  const addEdge = (edge) => {
    const pre = Number(edge.predecessor_id);
    const suc = Number(edge.successor_id);

    // Bỏ qua nếu có nút không thuộc tập items
    if (!nodes[pre] || !nodes[suc]) return;

    const type = edge.dependency_type || "FS";
    const delay = edge.lead_lag_days || 0;

    adjList[pre].push({ target: suc, type, delay });
    reverseAdjList[suc].push({ target: pre, type, delay });
    inDegree[suc]++;
  };

  // Thêm các cạnh hiện có
  for (const dep of deps) {
    addEdge(dep);
  }

  // Thêm cạnh mới
  if (newEdge) {
    addEdge(newEdge);
  }

  return { nodes, adjList, reverseAdjList, inDegree };
}

/**
 * Xoay mảng cycleIds để bắt đầu từ một nút cụ thể.
 * @param {Array} cycleIds 
 * @param {number} startNodeId 
 * @returns {Array} Mảng đã xoay
 */
function rotateCycleToStartWith(cycleIds, startNodeId) {
  if (!cycleIds || cycleIds.length === 0) return [];
  const idx = cycleIds.indexOf(startNodeId);
  if (idx > 0) {
    return [...cycleIds.slice(idx), ...cycleIds.slice(0, idx)];
  }
  return [...cycleIds];
}

/**
 * Kiểm tra xem vòng lặp có chứa trực tiếp quan hệ mới tạo không.
 * @param {Array} cycleIds Mảng ID các công việc tạo thành vòng lặp
 * @param {number} predecessorId ID của công việc trước (P)
 * @param {number} successorId ID của công việc sau (S)
 * @returns {boolean}
 */
function cycleContainsEdge(cycleIds, predecessorId, successorId) {
  if (!cycleIds || cycleIds.length === 0) return false;
  const n = cycleIds.length;
  for (let i = 0; i < n; i++) {
    if (cycleIds[i] === successorId && cycleIds[(i + 1) % n] === predecessorId) {
      return true;
    }
  }
  return false;
}

/**
 * Tìm vòng phụ thuộc đi qua quan hệ mới bằng thuật toán BFS.
 * Duyệt trên đồ thị từ successorId tìm đường về predecessorId.
 * @param {Object} graph Đồ thị
 * @param {number} predecessorId ID của công việc trước
 * @param {number} successorId ID của công việc sau
 * @returns {Array} Mảng các ID tạo thành vòng đi qua quan hệ mới (hoặc [] nếu không có)
 */
function findCycleThroughEdge(graph, predecessorId, successorId) {
  const adj = graph.adjList;
  if (!adj[successorId] || !adj[predecessorId]) return [];
  
  const queue = [[successorId]];
  const visited = new Set([successorId]);
  
  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    
    if (current === predecessorId) {
      return [successorId, ...path.slice(1).reverse()];
    }
    
    const edges = adj[current] || [];
    for (const edge of edges) {
      const neighbor = edge.target;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  
  return [];
}

module.exports = {
  buildTempGraph,
  rotateCycleToStartWith,
  cycleContainsEdge,
  findCycleThroughEdge
};
