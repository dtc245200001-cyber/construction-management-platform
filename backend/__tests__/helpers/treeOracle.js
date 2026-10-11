"use strict";

/**
 * treeOracle.js
 * Máy đối chứng độc lập tính toán contract_value và contract_total cho cây hạng mục (S-35 / T-88).
 * Không sử dụng code sản phẩm, tính toán bằng BigInt từ exactDecimal.js.
 */

const { multiplyAndRoundHalfUp, addCurrency } = require("./exactDecimal");

/**
 * Tính toán contract_total và project_total cho danh sách các nút phẳng.
 * @param {Array<{ id: string|number, parent_id: string|number|null, quantity?: string, unit_price?: string }>} flatNodes
 * @returns {{
 *   nodeValues: Map<string|number, string|null>,
 *   nodeTotals: Map<string|number, string>,
 *   projectTotal: string
 * }}
 */
function calculateTreeTotals(flatNodes) {
  // 1. Phân loại cha con và lá
  const nodeMap = new Map();
  const childrenMap = new Map();
  const rootIds = [];

  for (const node of flatNodes) {
    const id = node.id;
    nodeMap.set(id, node);
    if (!childrenMap.has(id)) {
      childrenMap.set(id, []);
    }
    if (node.parent_id == null) {
      rootIds.push(id);
    } else {
      if (!childrenMap.has(node.parent_id)) {
        childrenMap.set(node.parent_id, []);
      }
      childrenMap.get(node.parent_id).push(id);
    }
  }

  // 2. Tính contract_value cho từng lá
  const nodeValues = new Map();
  for (const node of flatNodes) {
    const children = childrenMap.get(node.id) || [];
    const isLeaf = children.length === 0;

    if (isLeaf) {
      if (node.quantity != null && node.unit_price != null) {
        const val = multiplyAndRoundHalfUp(node.quantity, node.unit_price);
        nodeValues.set(node.id, val);
      } else {
        nodeValues.set(node.id, null);
      }
    } else {
      // Nút cha không bao giờ có contract_value
      nodeValues.set(node.id, null);
    }
  }

  // 3. Tính đệ quy contract_total cho từng nút (bottom-up)
  const nodeTotals = new Map();

  function computeTotal(nodeId) {
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      // Lá: contract_total chính là contract_value (hoặc "0.00" nếu chưa khai)
      const leafVal = nodeValues.get(nodeId);
      const total = leafVal != null ? leafVal : "0.00";
      nodeTotals.set(nodeId, total);
      return total;
    }

    // Cha: cộng tổng contract_total từ tất cả các con
    let sum = "0.00";
    for (const childId of children) {
      const childTotal = computeTotal(childId);
      sum = addCurrency(sum, childTotal);
    }
    nodeTotals.set(nodeId, sum);
    return sum;
  }

  // 4. Tính tổng dự án (tổng các gốc)
  let projectTotal = "0.00";
  for (const rootId of rootIds) {
    const rootTotal = computeTotal(rootId);
    projectTotal = addCurrency(projectTotal, rootTotal);
  }

  // Đảm bảo mọi node không liên kết cũng được tính
  for (const node of flatNodes) {
    if (!nodeTotals.has(node.id)) {
      computeTotal(node.id);
    }
  }

  return {
    nodeValues,
    nodeTotals,
    projectTotal,
  };
}

module.exports = {
  calculateTreeTotals,
};
