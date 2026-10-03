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

module.exports = {
  buildTempGraph,
  rotateCycleToStartWith,
};
