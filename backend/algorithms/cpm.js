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

module.exports = {
  buildGraph
};
