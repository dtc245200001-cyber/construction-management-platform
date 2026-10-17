"use strict";

// S-22 / T-50
// Các hàm validate thuần (không đụng DB) cho mục đầu ngày.
// Trả về mảng thông báo lỗi tiếng Việt — rỗng = hợp lệ.

/**
 * Kiểm tra chuỗi ngày YYYY-MM-DD có hợp lệ và là ngày thật.
 * @param {string} dateString
 * @returns {boolean}
 */
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const [y, m, d] = dateString.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y % 400 === 0 || (y % 100 !== 0 && y % 4 === 0)) lengths[1] = 29;
  return d > 0 && d <= lengths[m - 1];
}

/**
 * Validate body của PUT /diary-days/:date.
 *
 * @param {*} body - req.body (chưa tin bất cứ kiểu nào)
 * @returns {{ errors: string[], isEmpty: boolean }} errors là danh sách lỗi;
 *   isEmpty true khi body trống hoàn toàn (không có nội dung nào).
 */
function validateDiaryDayBody(body) {
  const errors = [];

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    errors.push("Body phải là một JSON object hợp lệ");
    return { errors, isEmpty: false };
  }

  // ── manpower_count ──────────────────────────────────────────────────────
  if ("manpower_count" in body && body.manpower_count !== null) {
    const v = body.manpower_count;
    if (typeof v !== "number" || !Number.isInteger(v)) {
      errors.push("Nhân lực phải là số nguyên");
    } else if (v < 0 || v > 99999) {
      errors.push("Nhân lực phải từ 0 đến 99.999");
    }
  }

  // ── weather_type_id ─────────────────────────────────────────────────────
  if ("weather_type_id" in body && body.weather_type_id !== null) {
    const v = body.weather_type_id;
    if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
      errors.push("weather_type_id phải là số nguyên dương");
    }
  }

  // ── weather_note ────────────────────────────────────────────────────────
  if ("weather_note" in body && body.weather_note !== null) {
    const v = body.weather_note;
    if (typeof v !== "string") {
      errors.push("Ghi chú thời tiết phải là chuỗi ký tự");
    } else if (v.trim().length > 500) {
      errors.push("Ghi chú thời tiết không được vượt quá 500 ký tự");
    }
  }

  // ── equipment ───────────────────────────────────────────────────────────
  if ("equipment" in body && body.equipment !== null) {
    const eq = body.equipment;
    if (!Array.isArray(eq)) {
      errors.push("equipment phải là mảng");
    } else {
      if (eq.length > 50) {
        errors.push("Danh sách thiết bị không được vượt quá 50 loại");
      }
      const seenIds = new Set();
      eq.forEach((item, idx) => {
        const label = `Thiết bị #${idx + 1}`;
        if (item === null || typeof item !== "object" || Array.isArray(item)) {
          errors.push(`${label}: mỗi phần tử phải là object`);
          return;
        }
        const { equipment_type_id: etId, quantity: qty } = item;
        if (typeof etId !== "number" || !Number.isInteger(etId) || etId <= 0) {
          errors.push(`${label}: equipment_type_id phải là số nguyên dương`);
        } else if (seenIds.has(etId)) {
          errors.push(`${label}: loại thiết bị ID ${etId} bị trùng`);
        } else {
          seenIds.add(etId);
        }
        if (typeof qty !== "number" || !Number.isInteger(qty)) {
          errors.push(`${label}: quantity phải là số nguyên`);
        } else if (qty < 1 || qty > 9999) {
          errors.push(`${label}: quantity phải từ 1 đến 9.999`);
        }
      });
    }
  }

  // ── expected_updated_at ─────────────────────────────────────────────────
  if ("expected_updated_at" in body && body.expected_updated_at !== null) {
    const v = body.expected_updated_at;
    if (typeof v !== "string" || isNaN(Date.parse(v))) {
      errors.push("expected_updated_at phải là chuỗi ISO 8601 hợp lệ");
    }
  }

  // ── Kiểm tra rỗng hoàn toàn ─────────────────────────────────────────────
  const hasContent =
    (body.manpower_count !== undefined && body.manpower_count !== null) ||
    (body.weather_type_id !== undefined && body.weather_type_id !== null) ||
    (body.weather_note !== undefined &&
      body.weather_note !== null &&
      typeof body.weather_note === "string" &&
      body.weather_note.trim().length > 0) ||
    (Array.isArray(body.equipment) && body.equipment.length > 0);

  return { errors, isEmpty: !hasContent };
}

/**
 * Validate tham số :date từ URL.
 * @param {string} dateStr
 * @returns {string[]} mảng lỗi (rỗng = hợp lệ)
 */
function validateDateParam(dateStr) {
  if (!isValidDate(dateStr)) {
    return ["Ngày không hợp lệ, phải theo định dạng YYYY-MM-DD và là ngày có thật"];
  }
  return [];
}

/**
 * Validate query string ?from=&to= cho GET /diary-days.
 * @param {object} query
 * @returns {string[]} mảng lỗi
 */
function validateDiaryDaysQuery(query) {
  const errors = [];
  const { from, to } = query;

  if (!from || !to) {
    errors.push("Bắt buộc phải có cả from và to");
    return errors;
  }
  if (!isValidDate(from)) errors.push("from phải là ngày hợp lệ YYYY-MM-DD");
  if (!isValidDate(to)) errors.push("to phải là ngày hợp lệ YYYY-MM-DD");

  if (errors.length === 0) {
    if (from > to) errors.push("from phải nhỏ hơn hoặc bằng to");
    else {
      const diffDays =
        (new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24);
      if (diffDays > 62)
        errors.push("Khoảng thời gian không được vượt quá 62 ngày");
    }
  }

  return errors;
}

module.exports = {
  isValidDate,
  validateDiaryDayBody,
  validateDateParam,
  validateDiaryDaysQuery,
};
