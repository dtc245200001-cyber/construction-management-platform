const { buildTempGraph, rotateCycleToStartWith } = require("../utils/buildTempGraph");
const { detectCycle } = require("../algorithms/cpm");

describe("buildTempGraph utility", () => {
  it("nên trả về đồ thị hợp lệ với đầu vào rỗng", () => {
    const graph = buildTempGraph([], [], null);
    expect(graph.nodes).toEqual({});
    expect(graph.adjList).toEqual({});
    expect(graph.reverseAdjList).toEqual({});
    expect(graph.inDegree).toEqual({});
  });

  it("nên trả về đồ thị với 1 cạnh", () => {
    const items = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
    const deps = [{ predecessor_id: 1, successor_id: 2 }];
    const graph = buildTempGraph(items, deps, null);

    expect(graph.adjList[1]).toEqual([{ target: 2, type: "FS", delay: 0 }]);
    expect(graph.reverseAdjList[2]).toEqual([{ target: 1, type: "FS", delay: 0 }]);
    expect(graph.inDegree[2]).toBe(1);
    expect(graph.inDegree[1]).toBe(0);
  });

  it("nên phát hiện vòng 2 nút", () => {
    const items = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
    const deps = [{ predecessor_id: 1, successor_id: 2 }];
    const newEdge = { predecessor_id: 2, successor_id: 1 };
    
    const graph = buildTempGraph(items, deps, newEdge);
    const cycleIds = detectCycle(graph);
    
    expect(cycleIds.length).toBeGreaterThan(0);
    expect(cycleIds.includes(1)).toBe(true);
    expect(cycleIds.includes(2)).toBe(true);
  });

  it("nên phát hiện vòng 3 nút A→B, B→C và thêm C→A và trả chuỗi chờ C → B → A → C", () => {
    const items = [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "C" }];
    const deps = [
      { predecessor_id: 1, successor_id: 2 },
      { predecessor_id: 2, successor_id: 3 }
    ];
    const newEdge = { predecessor_id: 3, successor_id: 1 };
    
    const graph = buildTempGraph(items, deps, newEdge);
    const cycleIds = detectCycle(graph);

    // Dựa vào code của detectCycle, A chờ B, B chờ C, C chờ A.
    // Kết quả mong muốn là 1 trong các hoán vị vòng của [1, 3, 2] (vì 3 chờ 2, 2 chờ 1, 1 chờ 3)
    // Tức là [C, B, A] -> [3, 2, 1] ...
    
    const names = cycleIds.map(id => items.find(i => i.id === id).name);
    names.push(names[0]);
    const pathStr = names.join(" → ");

    expect(cycleIds).toHaveLength(3);
    // Có thể là "C → B → A → C" hoặc "B → A → C → B" hoặc "A → C → B → A"
    const validPaths = [
      "C → B → A → C",
      "B → A → C → B",
      "A → C → B → A"
    ];
    expect(validPaths).toContain(pathStr);
  });

  it("nên là DAG và không có vòng", () => {
    const items = [{ id: 1, name: "A" }, { id: 2, name: "B" }, { id: 3, name: "C" }];
    const deps = [
      { predecessor_id: 1, successor_id: 2 },
      { predecessor_id: 1, successor_id: 3 }
    ];
    const newEdge = { predecessor_id: 2, successor_id: 3 };
    
    const graph = buildTempGraph(items, deps, newEdge);
    const cycleIds = detectCycle(graph);
    expect(cycleIds).toEqual([]);
  });

  it("nên bỏ qua các cạnh chứa nút không nằm trong danh sách", () => {
    const items = [{ id: 1, name: "A" }];
    const deps = [{ predecessor_id: 1, successor_id: 99 }]; // 99 is unknown
    const graph = buildTempGraph(items, deps, null);
    
    expect(graph.adjList[1]).toEqual([]);
  });

  it("không được đột biến mảng đầu vào", () => {
    const items = [{ id: 1, name: "A" }, { id: 2, name: "B" }];
    const deps = [{ predecessor_id: 1, successor_id: 2 }];
    
    const itemsCopy = JSON.parse(JSON.stringify(items));
    const depsCopy = JSON.parse(JSON.stringify(deps));
    
    buildTempGraph(items, deps, null);
    
    expect(items).toEqual(itemsCopy);
    expect(deps).toEqual(depsCopy);
  });

  it("500 việc, ~2000 quan hệ: kiểm chu trình trong bộ nhớ dưới 500ms (NFR của S-11)", () => {
    function mulberry32(a) {
      return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      }
    }
    const rng = mulberry32(12345);

    const items = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `N${i + 1}` }));
    const deps = [];
    
    // Create DAG
    for (let i = 1; i < 500; i++) {
      deps.push({ predecessor_id: i, successor_id: i + 1 });
      for (let j = 0; j < 3; j++) {
        const target = i + 2 + Math.floor(rng() * (500 - i - 2));
        if (target <= 500) {
          deps.push({ predecessor_id: i, successor_id: target });
        }
      }
    }
    
    expect(deps.length).toBeGreaterThanOrEqual(1900);

    const newEdge = { predecessor_id: 500, successor_id: 1 };
    
    const start = process.hrtime.bigint();
    const graph = buildTempGraph(items, deps, newEdge);
    const cycleIds = detectCycle(graph);
    const rotated = rotateCycleToStartWith(cycleIds, 1);
    const end = process.hrtime.bigint();
    
    const timeInMs = Number(end - start) / 1000000;
    
    expect(rotated.length).toBeGreaterThan(0);
    expect(rotated[0]).toBe(1);
    expect(timeInMs).toBeLessThan(500);
  });
});

describe("rotateCycleToStartWith utility", () => {
  it("nên trả về mảng rỗng nếu đầu vào rỗng", () => {
    expect(rotateCycleToStartWith([], 1)).toEqual([]);
    expect(rotateCycleToStartWith(null, 1)).toEqual([]);
  });

  it("nên xoay mảng đúng khi nút nằm ở giữa", () => {
    const cycle = [3, 2, 1]; // 3 chờ 2, 2 chờ 1, 1 chờ 3
    // Khi xoay để bắt đầu từ 1
    const rotated = rotateCycleToStartWith(cycle, 1);
    expect(rotated).toEqual([1, 3, 2]);
  });

  it("nên giữ nguyên mảng nếu nút đã ở đầu", () => {
    const cycle = [1, 3, 2];
    const rotated = rotateCycleToStartWith(cycle, 1);
    expect(rotated).toEqual([1, 3, 2]);
  });

  it("nên giữ nguyên mảng nếu không tìm thấy nút", () => {
    const cycle = [3, 2, 1];
    const rotated = rotateCycleToStartWith(cycle, 99);
    expect(rotated).toEqual([3, 2, 1]);
  });
});
