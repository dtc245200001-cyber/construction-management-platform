"use strict";

/**
 * Thuật toán tính toán ngày làm việc & ngày nghỉ (T-39 / S-17).
 *
 * Hai hàm thuần (Pure Functions):
 * 1. addWorkingDays(startDate, n, calendar, holidays)
 * 2. countWorkingDays(startDate, endDate, calendar, holidays)
 *
 * Nguyên tắc:
 * - Không phụ thuộc database, không gọi API, không thay đổi input (immutable).
 * - Sử dụng UTC Date để tránh lệch múi giờ.
 * - Lễ trùng Chủ nhật (hoặc ngày nghỉ tuần) chỉ được tính là 1 ngày nghỉ, không trừ trùng lặp.
 */

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const DEFAULT_CALENDAR = Object.freeze({
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: true,
  sunday: false,
});
function getOffsetDays(
  projectStart,
  targetDate,
  calendar = DEFAULT_CALENDAR,
  holidays = []
) {
  const start = parseDate(projectStart);
  const target = parseDate(targetDate);

  if (start.getTime() === target.getTime()) {
    return 0;
  }

  const holidaysSet = normalizeHolidays(holidays);
  const cal = calendar || DEFAULT_CALENDAR;
  let count = 0;

  if (target.getTime() > start.getTime()) {
    const cur = new Date(start.getTime());
    cur.setUTCDate(cur.getUTCDate() + 1);

    while (cur.getTime() <= target.getTime()) {
      if (isWorkingDay(cur, cal, holidaysSet)) {
        count++;
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    return count;
  }

  const cur = new Date(start.getTime());
  cur.setUTCDate(cur.getUTCDate() - 1);

  while (cur.getTime() >= target.getTime()) {
    if (isWorkingDay(cur, cal, holidaysSet)) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() - 1);
  }

  return -count;
}

/**
 * Chuyển đổi input (string YYYY-MM-DD hoặc Date) thành Date đối tượng theo UTC.
 * @param {string|Date} dateInput
 * @returns {Date}
 */
function parseDate(dateInput) {
  if (typeof dateInput === "string") {
    const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      return new Date(Date.UTC(year, month, day));
    }
  }

  if (dateInput instanceof Date) {
    const y = dateInput.getFullYear();
    const m = dateInput.getMonth();
    const d = dateInput.getDate();
    return new Date(Date.UTC(y, m, d));
  }

  const d = new Date(dateInput);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/**
 * Định dạng Date object thành chuỗi YYYY-MM-DD.
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Chuẩn hóa danh sách holidays thành Set các chuỗi YYYY-MM-DD.
 * @param {Array<string|object|Date>} holidays
 * @returns {Set<string>}
 */
function normalizeHolidays(holidays) {
  const set = new Set();
  if (!Array.isArray(holidays)) return set;

  for (const h of holidays) {
    if (!h) continue;
    if (typeof h === "string") {
      const parsed = parseDate(h);
      if (!isNaN(parsed.getTime())) {
        set.add(formatDate(parsed));
      }
    } else if (h instanceof Date) {
      if (!isNaN(h.getTime())) {
        set.add(formatDate(parseDate(h)));
      }
    } else if (typeof h === "object" && h.holiday_date) {
      const parsed = parseDate(h.holiday_date);
      if (!isNaN(parsed.getTime())) {
        set.add(formatDate(parsed));
      }
    }
  }

  return set;
}

/**
 * Kiểm tra xem một ngày có phải là ngày làm việc hay không.
 * @param {string|Date} dateInput
 * @param {object} [calendar=DEFAULT_CALENDAR]
 * @param {Array<string|object|Date>|Set<string>} [holidays=[]]
 * @returns {boolean}
 */
function isWorkingDay(dateInput, calendar = DEFAULT_CALENDAR, holidays = []) {
  const date = parseDate(dateInput);
  const dateStr = formatDate(date);
  const dayName = DAY_NAMES[date.getUTCDay()];

  const cal = calendar || DEFAULT_CALENDAR;
  const isWeekdayWorking = cal[dayName] === true;

  const holidaysSet =
    holidays instanceof Set ? holidays : normalizeHolidays(holidays);
  const isHoliday = holidaysSet.has(dateStr);

  // Ngày làm việc phải là ngày được bật trong calendar VÀ không phải ngày lễ
  return isWeekdayWorking && !isHoliday;
}

/**
 * Hàm 1: Cộng n ngày làm việc vào một ngày cho trước theo lịch và ngày nghỉ.
 * @param {string|Date} startDate
 * @param {number} n Số ngày làm việc cần cộng (n > 0 để tiến, n < 0 để lùi, n = 0 giữ nguyên)
 * @param {object} [calendar=DEFAULT_CALENDAR]
 * @param {Array<string|object|Date>} [holidays=[]]
 * @returns {string} Chuỗi ngày kết quả YYYY-MM-DD
 */
function addWorkingDays(startDate, n, calendar = DEFAULT_CALENDAR, holidays = []) {
  const cur = parseDate(startDate);
  const numDays = parseInt(n, 10);

  if (isNaN(numDays) || numDays === 0) {
    return formatDate(cur);
  }

  const holidaysSet = normalizeHolidays(holidays);
  const cal = calendar || DEFAULT_CALENDAR;
  const step = numDays > 0 ? 1 : -1;
  let remaining = Math.abs(numDays);

  while (remaining > 0) {
    cur.setUTCDate(cur.getUTCDate() + step);
    if (isWorkingDay(cur, cal, holidaysSet)) {
      remaining--;
    }
  }

  return formatDate(cur);
}

/**
 * Hàm 2: Đếm số ngày làm việc giữa hai ngày (bao gồm cả startDate và endDate).
 * @param {string|Date} startDate
 * @param {string|Date} endDate
 * @param {object} [calendar=DEFAULT_CALENDAR]
 * @param {Array<string|object|Date>} [holidays=[]]
 * @returns {number}
 */
function countWorkingDays(
  startDate,
  endDate,
  calendar = DEFAULT_CALENDAR,
  holidays = []
) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (start.getTime() > end.getTime()) {
    return 0;
  }

  const holidaysSet = normalizeHolidays(holidays);
  const cal = calendar || DEFAULT_CALENDAR;

  let count = 0;
  const cur = new Date(start.getTime());

  while (cur.getTime() <= end.getTime()) {
    if (isWorkingDay(cur, cal, holidaysSet)) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return count;
}

/**
 * Hàm 3: Tính số ngày làm việc chênh lệch giữa hai mốc (T-37).
 * Dương là chậm (currentFinish sau plannedFinish).
 * Âm là sớm (currentFinish trước plannedFinish).
 * Bằng 0 là đúng kế hoạch.
 * @param {string|Date} plannedFinish
 * @param {string|Date} currentFinish
 * @param {object} [calendar=DEFAULT_CALENDAR]
 * @param {Array<string|object|Date>} [holidays=[]]
 * @returns {number}
 */
function workingDayDiff(
  plannedFinish,
  currentFinish,
  calendar = DEFAULT_CALENDAR,
  holidays = []
) {
  const p = parseDate(plannedFinish);
  const c = parseDate(currentFinish);

  if (p.getTime() === c.getTime()) {
    return 0;
  } else if (p.getTime() < c.getTime()) {
    return countWorkingDays(p, c, calendar, holidays) - 1;
  } else {
    return -(countWorkingDays(c, p, calendar, holidays) - 1);
  }
}

module.exports = {
  addWorkingDays,
  countWorkingDays,
  workingDayDiff,
  getOffsetDays,
  isWorkingDay,
  parseDate,
  formatDate,
  normalizeHolidays,
  DEFAULT_CALENDAR,
};

