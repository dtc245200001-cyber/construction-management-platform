const {
  findCycleCreatedByEdge,
  buildCycleDescription,
} = require("../utils/dependencyCycle");

describe("S-11 dependency cycle guard", () => {
  test("chặn quan hệ tạo vòng A -> B -> C -> A", () => {
    const nodes = [1, 2, 3];

    const edges = [
      {
        predecessor_id: 1,
        successor_id: 2,
      },
      {
        predecessor_id: 2,
        successor_id: 3,
      },
    ];

    const cycle = findCycleCreatedByEdge(
      nodes,
      edges,
      3,
      1
    );

    expect(cycle).toEqual([
      3,
      1,
      2,
      3,
    ]);
  });

  test("cho phép quan hệ không tạo vòng", () => {
    const nodes = [1, 2, 3];

    const edges = [
      {
        predecessor_id: 1,
        successor_id: 2,
      },
    ];

    const cycle = findCycleCreatedByEdge(
      nodes,
      edges,
      2,
      3
    );

    expect(cycle).toBeNull();
  });

  test("chặn công việc phụ thuộc chính nó", () => {
    const cycle = findCycleCreatedByEdge(
      [1],
      [],
      1,
      1
    );

    expect(cycle).toEqual([
      1,
      1,
    ]);
  });

  test("trả đúng tên chuỗi công việc tạo vòng", () => {
    const names = new Map([
      [1, "Đào móng"],
      [2, "Đổ bê tông"],
      [3, "Lắp cốt thép"],
    ]);

    const result = buildCycleDescription(
      [3, 1, 2, 3],
      names
    );

    expect(result.cyclePath).toBe(
      "Lắp cốt thép → Đào móng → Đổ bê tông → Lắp cốt thép"
    );
  });

  test("vòng cũ không liên quan không làm sai kiểm tra cạnh mới", () => {
    const nodes = [1, 2, 3, 4];

    const edges = [
      {
        predecessor_id: 1,
        successor_id: 2,
      },
      {
        predecessor_id: 2,
        successor_id: 1,
      },
    ];

    const cycle = findCycleCreatedByEdge(
      nodes,
      edges,
      3,
      4
    );

    expect(cycle).toBeNull();
  });
});
