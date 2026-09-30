/**
 * buildTree.js — Chuyển mảng phẳng thành cây lồng nhau.
 * Tách ra thành module riêng để có thể import và unit-test độc lập.
 *
 * @param {Array<{id: number, parent_id: number|null, [key: string]: any}>} flatList
 * @returns {Array} Mảng các node gốc (parent_id === null), mỗi node có thuộc tính children[].
 */
export function buildTree(flatList) {
  const map = {};
  const roots = [];

  flatList.forEach((item) => {
    map[item.id] = { ...item, children: [] };
  });

  flatList.forEach((item) => {
    if (item.parent_id != null && map[item.parent_id]) {
      map[item.parent_id].children.push(map[item.id]);
      map[item.parent_id].hasChildren = true;
    } else {
      roots.push(map[item.id]);
    }
  });

  return roots;
}
