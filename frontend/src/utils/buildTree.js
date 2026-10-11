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
    map[item.id] = { ...item, children: [], hasChildren: false };
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

const toTime = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * T-09: Ngày của hạng mục được tổng hợp hoàn toàn ở frontend (không lưu DB):
 * - Bắt đầu = ngày bắt đầu sớm nhất (min ES) của mọi con cháu
 * - Kết thúc = ngày kết thúc muộn nhất (max EF) của mọi con cháu
 * Hạng mục chưa có công việc nào được tính lịch thì để null.
 * Trả về cây mới, không thay đổi cây đầu vào.
 */
export function rollupCategoryDates(nodes) {
  return (nodes || []).map((node) => {
    if (node.type !== "category") return node;

    const children = rollupCategoryDates(node.children);
    let start = null;
    let end = null;
    let startTime = Infinity;
    let endTime = -Infinity;

    for (const child of children) {
      const s = toTime(child.start_date);
      if (s !== null && s < startTime) {
        startTime = s;
        start = child.start_date;
      }
      const e = toTime(child.end_date);
      if (e !== null && e > endTime) {
        endTime = e;
        end = child.end_date;
      }
    }

    return { ...node, children, start_date: start, end_date: end };
  });
}

// NFR T-12: Kiểm tra hạng mục lá (không có work_item con nào)
export function isLeafCategory(node) {
  if (!node) return false;

  if (!node.children || node.children.length === 0) {
    return true;
  }

  return node.children.every((child) => child.type === "task");
}

export function flattenTasks(nodes) {
  return (nodes || []).flatMap((n) => [
    ...(n.type === "task" ? [n] : []),
    ...flattenTasks(n.children || []),
  ]);
}
