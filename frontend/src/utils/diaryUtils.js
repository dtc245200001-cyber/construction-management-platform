/**
 * Helper tiện ích cho module Nhật ký thi công
 */

/**
 * Trích xuất ID số nguyên dương (work_item_id) từ hạng mục hoặc công việc được chọn.
 * - Nếu chọn hạng mục: trả về ID số nguyên dương của hạng mục (c.id).
 * - Nếu chọn công việc (task): trả về ID số nguyên dương của hạng mục cha (c.parent_id hoặc c.work_item_id).
 * - Chặn tên hiển thị, undefined, null, 0, chuỗi không hợp lệ -> trả về null.
 *
 * @param {string|number|object} selectedKey
 * @param {Array} categories
 * @returns {number|null}
 */
export function resolveWorkItemId(selectedKey, categories = []) {
  if (selectedKey === null || selectedKey === undefined || selectedKey === "") {
    return null;
  }

  // Nếu truyền trực tiếp object
  const item =
    typeof selectedKey === "object"
      ? selectedKey
      : (Array.isArray(categories)
          ? categories.find(
              (c) =>
                String(c.id) === String(selectedKey) ||
                (c.task_id !== undefined && String(c.task_id) === String(selectedKey))
            )
          : null);

  if (item) {
    const isTask = item.type === "task" || String(item.id).startsWith("task-");
    if (isTask) {
      const parentId = item.parent_id !== undefined ? item.parent_id : item.work_item_id;
      const num = Number(parentId);
      return Number.isInteger(num) && num > 0 ? num : null;
    } else {
      const num = Number(item.id);
      return Number.isInteger(num) && num > 0 ? num : null;
    }
  }

  // Nếu là dạng chuỗi 'task-X' nhưng không tìm thấy trong categories
  if (typeof selectedKey === "string" && selectedKey.startsWith("task-")) {
    return null;
  }

  // Nếu là ID số nguyên trực tiếp (e.g. 101 hoặc "101")
  const num = Number(selectedKey);
  if (Number.isInteger(num) && num > 0) {
    return num;
  }

  return null;
}
