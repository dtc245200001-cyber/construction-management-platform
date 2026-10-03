const { buildGraph } = require("../algorithms/cpm");

describe("Dựng đồ thị kề từ database (T-15)", () => {
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    };
  });

  test("Mạng mẫu 10 việc của K-01: đúng số cạnh, đúng bậc vào từng nút", async () => {
    // 10 nodes (A-J). Giả sử ID = 1..10
    const workItemsRows = [
      { id: 1, name: 'A', duration: 5 },
      { id: 2, name: 'B', duration: 3 },
      { id: 3, name: 'C', duration: 4 },
      { id: 4, name: 'D', duration: 6 },
      { id: 5, name: 'E', duration: 3 },
      { id: 6, name: 'F', duration: 4 },
      { id: 7, name: 'G', duration: 5 },
      { id: 8, name: 'H', duration: 4 },
      { id: 9, name: 'I', duration: 2 },
      { id: 10, name: 'J', duration: 1 },
    ];

    // 10 edges
    const depsRows = [
      { predecessor_id: 1, successor_id: 2, dependency_type: 'FS', lead_lag_days: 1 },
      { predecessor_id: 2, successor_id: 3, dependency_type: 'SS', lead_lag_days: 2 },
      { predecessor_id: 3, successor_id: 4, dependency_type: 'FS', lead_lag_days: 0 },
      { predecessor_id: 4, successor_id: 5, dependency_type: 'SS', lead_lag_days: -1 },
      { predecessor_id: 5, successor_id: 6, dependency_type: 'FF', lead_lag_days: 1 },
      { predecessor_id: 4, successor_id: 7, dependency_type: 'FS', lead_lag_days: 0 },
      { predecessor_id: 7, successor_id: 8, dependency_type: 'FS', lead_lag_days: 0 },
      { predecessor_id: 7, successor_id: 9, dependency_type: 'SF', lead_lag_days: 0 },
      { predecessor_id: 8, successor_id: 10, dependency_type: 'FS', lead_lag_days: 0 },
      { predecessor_id: 9, successor_id: 10, dependency_type: 'FS', lead_lag_days: 0 },
    ];

    mockPool.query
      .mockResolvedValueOnce({ rows: workItemsRows }) // Query 1: work items
      .mockResolvedValueOnce({ rows: depsRows });     // Query 2: dependencies

    const result = await buildGraph(1, mockPool);

    // Kiểm tra số truy vấn bằng đúng 2
    expect(mockPool.query).toHaveBeenCalledTimes(2);

    // Kiểm tra nodes
    expect(Object.keys(result.nodes).length).toBe(10);

    // Tổng số cạnh xuôi = 10
    let totalEdges = 0;
    for (const id in result.adjList) {
      totalEdges += result.adjList[id].length;
    }
    expect(totalEdges).toBe(10);

    // Kiểm tra đúng bậc vào
    // A:0, B:1, C:1, D:1, E:1, F:1, G:1, H:1, I:1, J:2
    expect(result.inDegree[1]).toBe(0);
    expect(result.inDegree[2]).toBe(1);
    expect(result.inDegree[3]).toBe(1);
    expect(result.inDegree[4]).toBe(1);
    expect(result.inDegree[5]).toBe(1);
    expect(result.inDegree[6]).toBe(1);
    expect(result.inDegree[7]).toBe(1);
    expect(result.inDegree[8]).toBe(1);
    expect(result.inDegree[9]).toBe(1);
    expect(result.inDegree[10]).toBe(2);

    // Một nút có nhiều cạnh ra (D -> E, G) ID=4 -> ID=5,7
    expect(result.adjList[4]).toHaveLength(2);
    // Một nút có nhiều cạnh vào (J <- H, I) ID=10
    expect(result.reverseAdjList[10]).toHaveLength(2);

    // Cạnh giữ đúng loại quan hệ và độ trễ âm
    // D(4) -> E(5) là SS-1
    const edgeDE = result.adjList[4].find(e => e.target === 5);
    expect(edgeDE).toBeDefined();
    expect(edgeDE.type).toBe('SS');
    expect(edgeDE.delay).toBe(-1);
  });

  test("Đồ thị rỗng (dự án chưa có công việc)", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await buildGraph(2, mockPool);
    
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(Object.keys(result.nodes).length).toBe(0);
    expect(Object.keys(result.adjList).length).toBe(0);
  });

  test("Việc cô lập vẫn xuất hiện, bậc vào 0", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Cô lập', duration: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await buildGraph(3, mockPool);
    
    expect(mockPool.query).toHaveBeenCalledTimes(2);
    expect(Object.keys(result.nodes).length).toBe(1);
    expect(result.adjList[1]).toHaveLength(0);
    expect(result.reverseAdjList[1]).toHaveLength(0);
    expect(result.inDegree[1]).toBe(0);
  });
});
