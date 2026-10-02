"use strict";

/**
 * Lấy dữ liệu 1 dự án bằng đúng 2 truy vấn và dựng đồ thị
 * @param {number} projectId 
 * @param {object} pool Đối tượng db pool
 * @returns {object} { nodes, adjList, reverseAdjList, inDegree }
 */
async function buildGraph(projectId, pool) {
  // 1. Truy vấn lấy toàn bộ công việc của dự án
  const workItemsResult = await pool.query(`
    SELECT wi.id, wi.name, wi.duration 
    FROM work_items wi
    JOIN categories c ON wi.category_id = c.id
    WHERE c.project_id = $1
  `, [projectId]);

  // 2. Truy vấn lấy toàn bộ quan hệ của dự án
  const depsResult = await pool.query(`
    SELECT d.predecessor_id, d.successor_id, d.dependency_type, d.lead_lag_days
    FROM dependencies d
    JOIN work_items wi ON d.predecessor_id = wi.id
    JOIN categories c ON wi.category_id = c.id
    WHERE c.project_id = $1
  `, [projectId]);

  const nodes = {};
  const adjList = {};
  const reverseAdjList = {};
  const inDegree = {};

  // Khởi tạo các đỉnh
  for (const row of workItemsResult.rows) {
    const id = row.id;
    nodes[id] = row;
    adjList[id] = [];
    reverseAdjList[id] = [];
    inDegree[id] = 0;
  }

  // Khởi tạo các cạnh
  for (const row of depsResult.rows) {
    const pre = row.predecessor_id;
    const suc = row.successor_id;
    
    // Bỏ qua nếu có dữ liệu thừa không khớp công việc (rác)
    if (!nodes[pre] || !nodes[suc]) continue;

    const edge = {
      type: row.dependency_type,
      delay: row.lead_lag_days
    };

    // Chiều xuôi: pre -> suc
    adjList[pre].push({
      target: suc,
      ...edge
    });

    // Chiều ngược: suc -> pre
    reverseAdjList[suc].push({
      target: pre,
      ...edge
    });

    inDegree[suc]++;
  }

  return { nodes, adjList, reverseAdjList, inDegree };
}
/**
 * Cài đặt Kahn's algorithm (sắp xếp topo không đệ quy)
 * @param {object} graph { nodes, adjList, reverseAdjList, inDegree }
 * @returns {object} { sortedOrder: number[], unresolvedNodes: number[] }
 */
function topologicalSort(graph) {
  // Tạo bản sao inDegree để không làm hỏng bản gốc
  const currentInDegree = { ...graph.inDegree };
  
  // Hàng đợi lưu các nút có bậc vào = 0
  let queue = [];
  
  // Khởi tạo hàng đợi: Tìm tất cả các nút bậc vào 0, sort theo ID (tính ổn định)
  for (const nodeIdStr in currentInDegree) {
    if (currentInDegree[nodeIdStr] === 0) {
      queue.push(Number(nodeIdStr));
    }
  }
  queue.sort((a, b) => a - b);

  const sortedOrder = [];
  let head = 0; // Con trỏ đầu hàng đợi (tránh dùng shift)

  while (head < queue.length) {
    const current = queue[head];
    head++;
    sortedOrder.push(current);

    // Duyệt các đỉnh kề (chiều xuôi)
    const neighbors = graph.adjList[current];
    if (!neighbors) continue;

    const zeroInDegreeNeighbors = [];
    for (const edge of neighbors) {
      const neighbor = edge.target;
      currentInDegree[neighbor]--;
      
      // Nếu bậc vào về 0, gom lại để sort và đẩy vào queue
      if (currentInDegree[neighbor] === 0) {
        zeroInDegreeNeighbors.push(neighbor);
      }
    }

    // Sort các nút kề mới đạt bậc 0 theo ID để giữ tính ổn định, rồi đẩy vào queue
    if (zeroInDegreeNeighbors.length > 0) {
      zeroInDegreeNeighbors.sort((a, b) => a - b);
      for (const n of zeroInDegreeNeighbors) {
        queue.push(n);
      }
    }
  }

  // Tìm các nút chưa sắp xếp được (có vòng)
  const unresolvedNodes = [];
  for (const nodeIdStr in currentInDegree) {
    if (currentInDegree[nodeIdStr] > 0) {
      unresolvedNodes.push(Number(nodeIdStr));
    }
  }
  // Sắp xếp unresolvedNodes để kết quả ổn định
  unresolvedNodes.sort((a, b) => a - b);

  return { sortedOrder, unresolvedNodes };
}

module.exports = {
  buildGraph,
  topologicalSort
};
