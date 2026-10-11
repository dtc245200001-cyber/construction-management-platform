import dagre from "@dagrejs/dagre";

// Kích thước node dùng cho dagre tính layout (khớp min-width render trong WBSDiagramPage)
const NODE_W = 220;
const NODE_H = 64;

// Chuyển cây (đã rollup) thành danh sách phẳng kèm depth.
// Node bị thu gọn VẪN hiện (để bấm mở lại), nhưng toàn bộ con của nó bị
// loại hẳn khỏi nodes/edges (không chỉ ẩn CSS) để cây lớn vẫn nhẹ.
function collectVisible(nodes, collapsed, depth = 0, out = []) {
  for (const node of nodes || []) {
    out.push({ node, depth });
    if (!collapsed.has(node.id)) {
      collectVisible(node.children, collapsed, depth + 1, out);
    }
  }
  return out;
}

export function treeToFlowElements(roots, collapsed) {
  const visible = collectVisible(roots, collapsed);
  const visibleIds = new Set(visible.map((v) => v.node.id));

  const nodes = visible.map(({ node }) => ({
    id: String(node.id),
    type: "wbsNode",
    data: {
      node,
      collapsed: collapsed.has(node.id),
      hasChildren: (node.children || []).length > 0,
    },
    position: { x: 0, y: 0 },
  }));

  const edges = [];
  for (const { node } of visible) {
    for (const child of node.children || []) {
      if (visibleIds.has(child.id)) {
        edges.push({
          id: `e-${node.id}-${child.id}`,
          source: String(node.id),
          target: String(child.id),
          type: "smoothstep",
        });
      }
    }
  }
  return { nodes, edges };
}

export function layoutWithDagre(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 30, ranksep: 70 });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H });
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
    };
  });
}
