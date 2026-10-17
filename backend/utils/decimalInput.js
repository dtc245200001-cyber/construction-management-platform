"use strict";

/**
 * Kiểm tra và chuẩn hoá chuỗi số thập phân không âm.
 *
 * @param {*} value - Giá trị đầu vào (string hoặc number)
 * @param {Object} options
 * @param {number} options.maxIntDigits - Số chữ số phần nguyên tối đa cho phép
 * @param {number} options.maxScale - Số chữ số phần thập phân tối đa cho phép
 * @param {string} [options.fieldName="Giá trị"] - Tên trường phục vụ thông báo lỗi
 * @returns {{ valid: boolean, value?: string, error?: string }}
 */
function parseDecimalInput(value, { maxIntDigits, maxScale, fieldName = "Giá trị" }) {
  if (value === undefined || value === null) {
    return { valid: false, error: `${fieldName} là bắt buộc` };
  }

  // Từ chối boolean, mảng, object
  if (typeof value === "boolean" || typeof value === "object") {
    return { valid: false, error: `${fieldName} không hợp lệ` };
  }

  let str;
  if (typeof value === "number") {
    if (isNaN(value) || !isFinite(value)) {
      return { valid: false, error: `${fieldName} không hợp lệ` };
    }
    str = String(value);

    // Từ chối dạng khoa học (e.g. 1e3)
    if (/[eE]/.test(str)) {
      return { valid: false, error: `${fieldName} không được dùng ký hiệu khoa học` };
    }

    // Đếm số chữ số có nghĩa để tránh số JSON đã bị mất độ chính xác (> 15 digits)
    const significantDigits = str.replace(/[.-]/g, "").replace(/^0+/, "");
    if (significantDigits.length > 15) {
      return {
        valid: false,
        error: `${fieldName} có độ chính xác cao vượt quá 15 chữ số, vui lòng gửi dạng chuỗi`,
      };
    }
  } else if (typeof value === "string") {
    str = value.trim();
  } else {
    return { valid: false, error: `${fieldName} không hợp lệ` };
  }

  if (str === "") {
    return { valid: false, error: `${fieldName} không được để trống` };
  }

  // Bắt các trường hợp lỗi cụ thể
  if (str.startsWith("-")) {
    return { valid: false, error: `${fieldName} không được âm` };
  }

  if (str.includes(",")) {
    return { valid: false, error: `${fieldName} không hợp lệ (không dùng dấu phẩy ",")` };
  }

  if (str.includes(" ")) {
    return { valid: false, error: `${fieldName} không được chứa khoảng trắng` };
  }

  if (/[eE]/.test(str)) {
    return { valid: false, error: `${fieldName} không được dùng ký hiệu khoa học` };
  }

  // Kiểm tra định dạng số thập phân thông thường: ^\d+(\.\d+)?$
  // Loại trừ dạng ".5", "5.", "+5", hay "1.000.000"
  if (!/^\d+(\.\d+)?$/.test(str)) {
    return { valid: false, error: `${fieldName} không hợp lệ` };
  }

  const parts = str.split(".");
  let intPart = parts[0].replace(/^0+/, "");
  if (intPart === "") intPart = "0";

  let fracPart = parts.length > 1 ? parts[1] : "";

  // Kiểm tra phần thập phân
  if (fracPart.length > maxScale) {
    // Nếu phần dư vượt quá maxScale có chứa chữ số khác 0 -> từ chối
    const excess = fracPart.slice(maxScale);
    if (/[1-9]/.test(excess)) {
      return {
        valid: false,
        error: `${fieldName} không được có quá ${maxScale} chữ số thập phân`,
      };
    }
    // Nếu phần dư chỉ toàn 0 -> cắt bỏ phần 0 thừa
    fracPart = fracPart.slice(0, maxScale);
  }

  // Chuẩn hoá phần thập phân: nếu rỗng và giá trị là 0 thì "0", hoặc giữ nguyên
  // Kiểm tra số chữ số phần nguyên
  if (intPart.length > maxIntDigits) {
    return {
      valid: false,
      error: `${fieldName} vượt quá giới hạn cho phép (tối đa ${maxIntDigits} chữ số nguyên)`,
    };
  }

  // Chuẩn hoá chuỗi kết quả
  const normalizedStr = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;

  return {
    valid: true,
    value: normalizedStr,
  };
}

module.exports = {
  parseDecimalInput,
};
