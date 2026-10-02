const { topologicalSort } = require("../algorithms/cpm");

// Hàm Helper để check tính chất hợp lệ của kết quả sắp xếp
function checkTopologicalProperties(graph, sortedOrder) {
  // b. Mỗi nút xuất hiện đúng 1 lần
  const seen = new Set(sortedOrder);
  expect(seen.size).toBe(sortedOrder.length);

  // c. Số nút bằng tổng số nút (nếu không có vòng)
  expect(sortedOrder.length).toBe(Object.keys(graph.nodes).length);

  // a. Việc trước đứng trước việc sau
  const position = {};
  sortedOrder.forEach((nodeId, index) => {
    position[nodeId] = index;
  });

  for (const nodeIdStr in graph.adjList) {
    const preId = Number(nodeIdStr);
    for (const edge of graph.adjList[preId]) {
      const sucId = edge.target;
      expect(position[preId]).toBeLessThan(position[sucId]);
    }
  }
}

describe("Sắp xếp Topological (T-16)", () => {
  test("Mạng mẫu K-01: thỏa các tính chất (a)(b)(c)", () => {
    const graph = {
      nodes: { 1:{}, 2:{}, 3:{}, 4:{}, 5:{}, 6:{}, 7:{}, 8:{}, 9:{}, 10:{} },
      adjList: {
        1: [{target: 2}], 2: [{target: 3}], 3: [{target: 4}],
        4: [{target: 5}, {target: 7}], 5: [{target: 6}],
        6: [], 7: [{target: 8}, {target: 9}],
        8: [{target: 10}], 9: [{target: 10}], 10: []
      },
      reverseAdjList: {}, // Không dùng trong hàm sort
      inDegree: {
        1: 0, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 2
      }
    };
    // Lưu lại inDegree gốc để check tính bất biến
    const originalInDegreeStr = JSON.stringify(graph.inDegree);

    const { sortedOrder, unresolvedNodes } = topologicalSort(graph);

    expect(unresolvedNodes.length).toBe(0);
    checkTopologicalProperties(graph, sortedOrder);

    // Xác nhận không làm hỏng đồ thị gốc
    expect(JSON.stringify(graph.inDegree)).toBe(originalInDegreeStr);
  });

  test("Đồ thị rỗng", () => {
    const graph = { nodes: {}, adjList: {}, inDegree: {} };
    const { sortedOrder, unresolvedNodes } = topologicalSort(graph);
    expect(sortedOrder).toEqual([]);
    expect(unresolvedNodes).toEqual([]);
  });

  test("Đồ thị 1 nút", () => {
    const graph = { nodes: { 1:{} }, adjList: { 1:[] }, inDegree: { 1:0 } };
    const { sortedOrder, unresolvedNodes } = topologicalSort(graph);
    expect(sortedOrder).toEqual([1]);
    expect(unresolvedNodes).toEqual([]);
  });

  test("Đồ thị các nút hoàn toàn cô lập", () => {
    const graph = { 
      nodes: { 1:{}, 2:{}, 3:{} }, 
      adjList: { 1:[], 2:[], 3:[] }, 
      inDegree: { 3:0, 1:0, 2:0 } // Cố tình đảo lộn thứ tự key
    };
    const { sortedOrder, unresolvedNodes } = topologicalSort(graph);
    // Nhờ sort nên dù key lộn xộn, kết quả vẫn ổn định là 1, 2, 3
    expect(sortedOrder).toEqual([1, 2, 3]);
    expect(unresolvedNodes).toEqual([]);
  });

  test("Chuỗi nối tiếp dài 5000 nút (chứng minh không tràn ngăn xếp)", () => {
    const graph = { nodes: {}, adjList: {}, inDegree: {} };
    for (let i = 1; i <= 5000; i++) {
      graph.nodes[i] = {};
      graph.adjList[i] = i < 5000 ? [{target: i + 1}] : [];
      graph.inDegree[i] = i === 1 ? 0 : 1;
    }

    const { sortedOrder, unresolvedNodes } = topologicalSort(graph);
    expect(unresolvedNodes.length).toBe(0);
    expect(sortedOrder.length).toBe(5000);
    expect(sortedOrder[0]).toBe(1);
    expect(sortedOrder[4999]).toBe(5000);
  });

  test("Mạng hình kim cương (nhiều nhánh song song hội tụ)", () => {
    // 1 -> 2, 3, 4 -> 5
    const graph = {
      nodes: { 1:{}, 2:{}, 3:{}, 4:{}, 5:{} },
      adjList: {
        1: [{target: 2}, {target: 3}, {target: 4}],
        2: [{target: 5}], 3: [{target: 5}], 4: [{target: 5}],
        5: []
      },
      inDegree: { 1:0, 2:1, 3:1, 4:1, 5:3 }
    };
    const { sortedOrder, unresolvedNodes } = topologicalSort(graph);
    expect(unresolvedNodes.length).toBe(0);
    checkTopologicalProperties(graph, sortedOrder);
  });

  test("Mạng 500 việc, 2000 quan hệ ngẫu nhiên không vòng (đo thời gian)", () => {
    const graph = { nodes: {}, adjList: {}, inDegree: {} };
    const N = 500;
    const E = 2000;
    
    for (let i = 1; i <= N; i++) {
      graph.nodes[i] = {};
      graph.adjList[i] = [];
      graph.inDegree[i] = 0;
    }

    // Seed "tự chế" bằng hàm hash đơn giản để có kết quả tái lập
    let seed = 12345;
    function random() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    // Gán hạng cho từng nút
    const ranks = {};
    for (let i = 1; i <= N; i++) {
      ranks[i] = Math.floor(random() * 1000);
    }

    let edgesAdded = 0;
    while (edgesAdded < E) {
      const u = Math.floor(random() * N) + 1;
      const v = Math.floor(random() * N) + 1;
      // Tránh vòng bằng cách u -> v chỉ khi rank u < rank v (nếu rank bằng nhau, so sánh ID)
      if (ranks[u] < ranks[v] || (ranks[u] === ranks[v] && u < v)) {
        // Tránh lặp cạnh
        if (!graph.adjList[u].find(edge => edge.target === v)) {
          graph.adjList[u].push({target: v});
          graph.inDegree[v]++;
          edgesAdded++;
        }
      }
    }

    const start = Date.now();
    const { sortedOrder, unresolvedNodes } = topologicalSort(graph);
    const end = Date.now();

    expect(end - start).toBeLessThan(1000); // Dưới 1 giây
    expect(unresolvedNodes.length).toBe(0);
    checkTopologicalProperties(graph, sortedOrder);
  });

  test("Ca có vòng (A chờ B, B chờ A)", () => {
    const graph = {
      nodes: { 1:{}, 2:{}, 3:{} },
      adjList: {
        1: [{target: 2}], // 1 -> 2
        2: [{target: 3}], // 2 -> 3
        3: [{target: 2}], // 3 -> 2 (Vòng)
      },
      inDegree: { 1:0, 2:2, 3:1 }
    };
    const { sortedOrder, unresolvedNodes } = topologicalSort(graph);
    
    // Nút 1 ra được
    expect(sortedOrder).toEqual([1]);
    // Nút 2, 3 bị kẹt
    expect(unresolvedNodes).toEqual([2, 3]);
  });
});
