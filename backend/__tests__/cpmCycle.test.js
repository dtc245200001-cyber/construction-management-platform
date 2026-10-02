const { topologicalSort, findCycleNodes, detectCycle } = require("../algorithms/cpm");

/**
 * Hàm helper: tạo đồ thị từ danh sách cạnh (pre -> suc).
 * Tự động tính adjList, reverseAdjList, inDegree.
 */
function makeGraph(nodeIds, edges) {
  const nodes = {};
  const adjList = {};
  const reverseAdjList = {};
  const inDegree = {};

  for (const id of nodeIds) {
    nodes[id] = {};
    adjList[id] = [];
    reverseAdjList[id] = [];
    inDegree[id] = 0;
  }

  for (const [pre, suc] of edges) {
    adjList[pre].push({ target: suc, type: "FS", delay: 0 });
    reverseAdjList[suc].push({ target: pre, type: "FS", delay: 0 });
    inDegree[suc]++;
  }

  return { nodes, adjList, reverseAdjList, inDegree };
}

/**
 * Hàm helper: kiểm tra mảng cycle có đúng là một vòng trong đồ thị không.
 * Mỗi phần tử cycle[i] phải chờ cycle[i+1] (tức cycle[i+1] là tiền nhiệm
 * của cycle[i]), và cycle[cuối] chờ cycle[0].
 */
function verifyCycleOrder(graph, cycle) {
  for (let i = 0; i < cycle.length; i++) {
    const current = cycle[i];
    const pred = cycle[(i + 1) % cycle.length];
    // current chờ pred → pred là tiền nhiệm của current
    // → trong reverseAdjList[current] phải có edge.target === pred
    const preds = graph.reverseAdjList[current];
    const found = preds.some(edge => edge.target === pred);
    expect(found).toBe(true);
  }
}

describe("Phát hiện vòng (T-17)", () => {
  test("Vòng 2 việc (A chờ B, B chờ A)", () => {
    // Cạnh: 1 -> 2 (2 chờ 1) và 2 -> 1 (1 chờ 2) → vòng
    const graph = makeGraph([1, 2], [[1, 2], [2, 1]]);
    const { unresolvedNodes } = topologicalSort(graph);

    const cycle = findCycleNodes(graph, unresolvedNodes);

    expect(cycle.length).toBe(2);
    expect(new Set(cycle)).toEqual(new Set([1, 2]));
    verifyCycleOrder(graph, cycle);
  });

  test("Vòng 4 việc, đúng thứ tự chờ", () => {
    // Vòng: 1 -> 2 -> 3 -> 4 -> 1
    // Nghĩa: 2 chờ 1, 3 chờ 2, 4 chờ 3, 1 chờ 4
    const graph = makeGraph([1, 2, 3, 4], [[1, 2], [2, 3], [3, 4], [4, 1]]);
    const { unresolvedNodes } = topologicalSort(graph);

    const cycle = findCycleNodes(graph, unresolvedNodes);

    expect(cycle.length).toBe(4);
    expect(new Set(cycle)).toEqual(new Set([1, 2, 3, 4]));
    verifyCycleOrder(graph, cycle);
  });

  test("Vòng 3 việc + việc nằm SAU vòng → việc sau vòng KHÔNG có trong kết quả", () => {
    // Vòng: 1 -> 2 -> 3 -> 1
    // Việc 4 chờ 2 (nằm sau vòng): 2 -> 4
    // Việc 5 chờ 4: 4 -> 5
    const graph = makeGraph([1, 2, 3, 4, 5], [
      [1, 2], [2, 3], [3, 1],  // vòng
      [2, 4], [4, 5]           // nhánh sau vòng
    ]);
    const { unresolvedNodes } = topologicalSort(graph);

    // unresolvedNodes chứa cả 4, 5 (bị kẹt vì chờ nút trong vòng)
    expect(unresolvedNodes.length).toBe(5);

    const cycle = findCycleNodes(graph, unresolvedNodes);

    // Chỉ có 3 nút trong vòng
    expect(cycle.length).toBe(3);
    expect(new Set(cycle)).toEqual(new Set([1, 2, 3]));
    // Việc sau vòng không nằm trong kết quả
    expect(cycle).not.toContain(4);
    expect(cycle).not.toContain(5);
    verifyCycleOrder(graph, cycle);
  });

  test("Mạng không vòng → trả về []", () => {
    // 1 -> 2 -> 3 -> 4
    const graph = makeGraph([1, 2, 3, 4], [[1, 2], [2, 3], [3, 4]]);
    const { unresolvedNodes } = topologicalSort(graph);

    expect(unresolvedNodes.length).toBe(0);

    const cycle = findCycleNodes(graph, unresolvedNodes);
    expect(cycle).toEqual([]);
  });

  test("Vòng đi qua nhiều việc trung gian có nhánh phụ → vẫn đúng", () => {
    // Vòng chính: 1 -> 2 -> 3 -> 4 -> 5 -> 1
    // Nhánh phụ ra ngoài vòng: 3 -> 6, 6 -> 7
    // Nhánh phụ vào vòng (từ nút gốc tự do): 8 -> 2
    const graph = makeGraph([1, 2, 3, 4, 5, 6, 7, 8], [
      [1, 2], [2, 3], [3, 4], [4, 5], [5, 1],  // vòng 5 nút
      [3, 6], [6, 7],                            // nhánh phụ sau vòng
      [8, 2]                                      // nhánh phụ vào vòng (8 là gốc tự do)
    ]);
    const { unresolvedNodes } = topologicalSort(graph);

    const cycle = findCycleNodes(graph, unresolvedNodes);

    // Chỉ có 5 nút trong vòng, không chứa 6, 7, 8
    expect(cycle.length).toBe(5);
    expect(new Set(cycle)).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(cycle).not.toContain(6);
    expect(cycle).not.toContain(7);
    expect(cycle).not.toContain(8);
    verifyCycleOrder(graph, cycle);
  });

  test("Mạng 500 việc, 2000 quan hệ, có 1 vòng → chạy nhanh, không tràn ngăn xếp", () => {
    const N = 500;
    const E_TARGET = 2000;

    // Seed "tự chế" để kết quả tái lập
    let seed = 54321;
    function random() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    const nodeIds = [];
    for (let i = 1; i <= N; i++) nodeIds.push(i);

    const edges = [];

    // Tạo 1 vòng nhỏ: 1 -> 2 -> 3 -> 1
    edges.push([1, 2], [2, 3], [3, 1]);

    // Gán hạng cho từng nút (để tạo cạnh không vòng bổ sung)
    const ranks = {};
    for (let i = 1; i <= N; i++) {
      ranks[i] = Math.floor(random() * 1000);
    }

    // Tạo cạnh bổ sung (không tạo thêm vòng ngoài vòng đã có)
    const edgeSet = new Set(["1->2", "2->3", "3->1"]);
    let edgesAdded = 3;
    while (edgesAdded < E_TARGET) {
      const u = Math.floor(random() * N) + 1;
      const v = Math.floor(random() * N) + 1;
      if (u === v) continue;

      // Không thêm cạnh ngược vào nút 1, 2, 3 (tránh thêm vòng mới)
      const cycleNodes = new Set([1, 2, 3]);
      if (cycleNodes.has(v) && cycleNodes.has(u)) continue;

      // Thêm cạnh u -> v chỉ khi rank[u] < rank[v] (đảm bảo không vòng mới)
      if (ranks[u] < ranks[v] || (ranks[u] === ranks[v] && u < v)) {
        const key = `${u}->${v}`;
        if (!edgeSet.has(key)) {
          edges.push([u, v]);
          edgeSet.add(key);
          edgesAdded++;
        }
      }
    }

    const graph = makeGraph(nodeIds, edges);

    const start = Date.now();
    const cycle = detectCycle(graph);
    const elapsed = Date.now() - start;

    // Phải chạy nhanh (dưới 1 giây)
    expect(elapsed).toBeLessThan(1000);

    // Vòng phải chứa đúng nút 1, 2, 3
    expect(cycle.length).toBe(3);
    expect(new Set(cycle)).toEqual(new Set([1, 2, 3]));
    verifyCycleOrder(graph, cycle);
  });

  test("detectCycle tiện ích: mạng không vòng → []", () => {
    const graph = makeGraph([1, 2, 3], [[1, 2], [2, 3]]);
    expect(detectCycle(graph)).toEqual([]);
  });

  test("detectCycle tiện ích: mạng có vòng → trả về vòng", () => {
    const graph = makeGraph([1, 2, 3], [[1, 2], [2, 3], [3, 1]]);
    const cycle = detectCycle(graph);
    expect(cycle.length).toBe(3);
    expect(new Set(cycle)).toEqual(new Set([1, 2, 3]));
    verifyCycleOrder(graph, cycle);
  });

  test("unresolvedNodes rỗng → trả về []", () => {
    const graph = makeGraph([1, 2], [[1, 2]]);
    expect(findCycleNodes(graph, [])).toEqual([]);
  });

  test("Nút id nhỏ nhất nằm SAU vòng: không được lẫn vào kết quả", () => {
    // Vòng 2 -> 3 -> 4 -> 2, nút 1 chờ nút 3 (cạnh 3 -> 1)
    const graph = {
      nodes: { 1: {}, 2: {}, 3: {}, 4: {} },
      adjList: {
        1: [],
        2: [{ target: 3 }],
        3: [{ target: 4 }, { target: 1 }],
        4: [{ target: 2 }],
      },
      reverseAdjList: {
        1: [{ target: 3 }],
        2: [{ target: 4 }],
        3: [{ target: 2 }],
        4: [{ target: 3 }],
      },
      inDegree: { 1: 1, 2: 1, 3: 1, 4: 1 },
    };

    const cycle = detectCycle(graph);

    expect(cycle).toHaveLength(3);
    expect(new Set(cycle)).toEqual(new Set([2, 3, 4]));
    expect(cycle).not.toContain(1);
    verifyCycleOrder(graph, cycle);
  });

  test("Nút id nhỏ nhất nằm SAU vòng qua 2 bậc: không được lẫn vào kết quả", () => {
    // Vòng 2 -> 3 -> 4 -> 2
    // Nút 5 chờ nút 3 (cạnh 3 -> 5), nút 1 chờ nút 5 (cạnh 5 -> 1)
    const graph = {
      nodes: { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} },
      adjList: {
        1: [],
        2: [{ target: 3 }],
        3: [{ target: 4 }, { target: 5 }],
        4: [{ target: 2 }],
        5: [{ target: 1 }],
      },
      reverseAdjList: {
        1: [{ target: 5 }],
        2: [{ target: 4 }],
        3: [{ target: 2 }],
        4: [{ target: 3 }],
        5: [{ target: 3 }],
      },
      inDegree: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    };

    const cycle = detectCycle(graph);

    expect(cycle).toHaveLength(3);
    expect(new Set(cycle)).toEqual(new Set([2, 3, 4]));
    expect(cycle).not.toContain(1);
    expect(cycle).not.toContain(5);
    verifyCycleOrder(graph, cycle);
  });
});
