import { describe, test, expect } from "vitest";
import { treeToFlowElements, layoutWithDagre } from "../../utils/wbsDiagramUtils.js";

const category = (id, children = []) => ({ id, name: `HM ${id}`, type: "category", children });
const task = (id) => ({ id: `task-${id}`, task_id: id, name: `CV ${id}`, type: "task", duration_days: 3, children: [] });

describe("WBSDiagram — treeToFlowElements", () => {
  const roots = [category(1, [category(2, [task(7)]), task(8)])];

  test("mỗi node cây thành 1 flow node, cha-con thành edge", () => {
    const { nodes, edges } = treeToFlowElements(roots, new Set());
    expect(nodes.map((n) => n.id).sort()).toEqual(["1", "2", "task-7", "task-8"]);
    expect(edges).toHaveLength(3);
    expect(edges.map((e) => `${e.source}->${e.target}`).sort()).toEqual(
      ["1->2", "1->task-8", "2->task-7"]
    );
  });

  test("con của nhánh thu gọn bị loại hẳn khỏi nodes/edges, node cha vẫn hiện", () => {
    const { nodes, edges } = treeToFlowElements(roots, new Set([2]));
    expect(nodes.map((n) => n.id).sort()).toEqual(["1", "2", "task-8"]);
    expect(edges.map((e) => `${e.source}->${e.target}`).sort()).toEqual(["1->2", "1->task-8"]);
    // Node bị thu gọn giữ cờ collapsed để vẽ icon mở rộng
    expect(nodes.find((n) => n.id === "2").data.collapsed).toBe(true);
  });

  test("cây rỗng cho nodes/edges rỗng", () => {
    expect(treeToFlowElements([], new Set())).toEqual({ nodes: [], edges: [] });
  });
});

describe("WBSDiagram — layoutWithDagre", () => {
  test("gán toạ độ TB: cha nằm trên con", () => {
    const { nodes, edges } = treeToFlowElements([category(1, [task(5)])], new Set());
    const laid = layoutWithDagre(nodes, edges);
    const byId = Object.fromEntries(laid.map((n) => [n.id, n.position]));
    expect(byId["1"].y).toBeLessThan(byId["task-5"].y);
  });

  test("không làm mất node/edge", () => {
    const { nodes, edges } = treeToFlowElements([category(1, [task(5), task(6)])], new Set());
    const laid = layoutWithDagre(nodes, edges);
    expect(laid).toHaveLength(3);
    expect(edges).toHaveLength(2);
  });
});
