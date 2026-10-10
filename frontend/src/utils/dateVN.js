// S-22 / T-51
// Các hàm thuần xử lý ngày theo múi giờ Asia/Ho_Chi_Minh.
// KHÔNG phụ thuộc múi giờ thiết bị — dùng Intl.DateTimeFormat với timeZone.

const TZ = "Asia/Ho_Chi_Minh";

/**
 * Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD.
 * @returns {string}
 */
export function todayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/**
 * Thêm n ngày vào chuỗi ngày ISO YYYY-MM-DD.
 * @param {string} iso - YYYY-MM-DD
 * @param {number} n - số ngày cần thêm (có thể âm)
 * @returns {string} YYYY-MM-DD
 */
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Trả về ngày đầu tuần (Thứ Hai) chứa ngày iso.
 * @param {string} iso - YYYY-MM-DD
 * @returns {string} YYYY-MM-DD (Thứ Hai)
 */
export function startOfWeek(iso) {
  // Sử dụng Date UTC để tránh lệch múi giờ trong phép tính ngày
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=CN,1=T2,...,6=T7
  // Số ngày cần lùi về Thứ Hai: CN(0) → lùi 6, T2(1) → 0, T3(2) → 1, ...
  const diff = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Trả về 7 chuỗi ngày từ Thứ Hai đến Chủ nhật của tuần chứa iso.
 * @param {string} iso - YYYY-MM-DD (bất kỳ ngày nào trong tuần)
 * @returns {string[]} 7 chuỗi YYYY-MM-DD
 */
export function weekDays(iso) {
  const mon = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/**
 * Định dạng ngày hiển thị bằng tiếng Việt.
 * Ví dụ: "Thứ Hai, 09/10/2026"
 * @param {string} iso - YYYY-MM-DD
 * @returns {string}
 */
export function formatDayVN(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("vi-VN", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Định dạng ngắn: "T2 09/10"
 * @param {string} iso - YYYY-MM-DD
 * @returns {string}
 */
export function formatShortDayVN(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekdays = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const dow = d.getUTCDay();
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${weekdays[dow]} ${dd}/${mm}`;
}
