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

/**
 * Thu hẹp danh sách unresolvedNodes về ĐÚNG các nút nằm trên một vòng.
 *
 * Thuật toán (không đệ quy, chỉ dùng kết quả của topologicalSort):
 *   Sau khi topologicalSort chạy xong, mọi nút trong unresolvedNodes đều
 *   có ít nhất 1 tiền nhiệm cũng nằm trong unresolvedNodes (vì Kahn đã
 *   loại hết nút bậc vào = 0 rồi). Tập này chứa cả nút trên vòng LẪN
 *   nút nằm SAU vòng (bị kẹt vì chờ nút trong vòng).
 *
 *   Để lấy đúng vòng, ta truy vết ngược:
 *   1. Chọn nút ID nhỏ nhất trong tập làm điểm bắt đầu.
 *   2. Đi ngược qua reverseAdjList (chỉ trong tập) cho tới khi gặp lại
 *      nút đã thăm. Ghi lại đường đi trong mảng path.
 *   3. Khi gặp lại nút X đã thăm: đoạn từ vị trí X trong path tới cuối
 *      chính là vòng. Các nút trước X (nếu có) nằm SAU vòng → bị loại
 *      nhờ path.slice(cycleStart).
 *
 * Nếu có nhiều vòng độc lập, hàm trả về một vòng bất kỳ mà bước truy
 * vết gặp trước (bắt đầu từ nút ID nhỏ nhất trong tập unresolvedNodes).
 *
 * @param {object} graph   { nodes, adjList, reverseAdjList, inDegree }
 * @param {number[]} unresolvedNodes  Mảng ID các nút chưa sắp xếp được
 * @returns {number[]}  Mảng ID các nút trên vòng, theo thứ tự "chờ".
 *                       Ví dụ: A chờ B, B chờ C, C chờ A → [A, B, C].
 *                       Trả về [] nếu không có vòng.
 */
function findCycleNodes(graph, unresolvedNodes) {
  // Không có nút chưa giải quyết → không có vòng
  if (!unresolvedNodes || unresolvedNodes.length === 0) {
    return [];
  }

  // Tạo tập từ unresolvedNodes để tra cứu nhanh O(1)
  const remaining = new Set(unresolvedNodes);

  // Tìm nút ID nhỏ nhất làm điểm bắt đầu truy vết.
  // Nút này có thể nằm trên vòng hoặc nằm SAU vòng đều được —
  // bước slice bên dưới sẽ chỉ lấy đúng đoạn vòng.
  let startNode = Infinity;
  for (const nodeId of remaining) {
    if (nodeId < startNode) {
      startNode = nodeId;
    }
  }

  // Truy vết ngược: đi qua reverseAdjList (chỉ trong tập remaining)
  // từ startNode, ghi lại đường đi. Khi gặp lại nút đã thăm thì dừng.
  const path = [startNode];
  const visited = new Set([startNode]);
  let current = startNode;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Tìm một tiền nhiệm của current nằm trong remaining
    let nextNode = -1;
    const preds = graph.reverseAdjList[current];
    if (preds) {
      for (const edge of preds) {
        if (remaining.has(edge.target)) {
          // Ưu tiên nút đã thăm (sẽ tạo ra vòng ngay)
          if (visited.has(edge.target)) {
            nextNode = edge.target;
            break;
          }
          // Nếu chưa có ứng viên, chọn nút này
          if (nextNode === -1) {
            nextNode = edge.target;
          }
        }
      }
    }

    // Nếu nextNode đã nằm trong visited → tìm thấy vòng
    if (visited.has(nextNode)) {
      // Chỉ lấy đoạn từ vị trí nextNode trong path tới cuối = đúng vòng.
      // Các nút trước đó (nếu startNode nằm SAU vòng) bị loại.
      // Thứ tự "chờ": path[i] chờ path[i+1] (vì path[i+1] là tiền nhiệm
      // của path[i] qua reverseAdjList), nút cuối chờ nút đầu → đúng vòng.
      const cycleStart = path.indexOf(nextNode);
      return path.slice(cycleStart);
    }

    // Thêm nextNode vào path và tiếp tục đi ngược
    visited.add(nextNode);
    path.push(nextNode);
    current = nextNode;
  }
}


/**
 * Hàm tiện ích: phát hiện vòng trong đồ thị.
 * Gọi topologicalSort rồi findCycleNodes.
 * @param {object} graph  { nodes, adjList, reverseAdjList, inDegree }
 * @returns {number[]}  Mảng ID các nút trên vòng, hoặc [] nếu không có vòng.
 */
function detectCycle(graph) {
  const { unresolvedNodes } = topologicalSort(graph);
  return findCycleNodes(graph, unresolvedNodes);
}

module.exports = {
  buildGraph,
  topologicalSort,
  findCycleNodes,
  detectCycle
};
