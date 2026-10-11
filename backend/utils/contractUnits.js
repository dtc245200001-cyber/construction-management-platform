"use strict";

/**
 * Danh sách các đơn vị tính hợp lệ mặc định cho hợp đồng xây dựng.
 */
const VALID_CONTRACT_UNITS = [
  "m",
  "m2",
  "m3",
  "md",
  "kg",
  "tấn",
  "lít",
  "cái",
  "bộ",
  "cây",
  "viên",
  "tấm",
  "công",
  "ca",
  "trọn gói",
];

/**
 * Chuẩn hóa và xác thực đơn vị tính hợp đồng.
 * - Chuẩn hóa Unicode NFC, trim khoảng trắng.
 * - Chuyển đổi ký hiệu: "m²" -> "m2", "m³" -> "m3".
 * - So khớp không phân biệt hoa thường với danh sách đơn vị hợp lệ.
 * - Trả về đơn vị chuẩn hóa hoặc null nếu không hợp lệ.
 *
 * @param {*} unit
 * @returns {string|null}
 */
function normalizeContractUnit(unit) {
  if (typeof unit !== "string") {
    return null;
  }

  // Chuẩn hóa Unicode NFC và cắt khoảng trắng đầu/cuối
  let normalized = unit.normalize("NFC").trim();
  if (!normalized) {
    return null;
  }

  // Chuyển ký hiệu số mũ thường gặp sang dạng chuẩn
  normalized = normalized.replace(/m²/gi, "m2").replace(/m³/gi, "m3");

  // So khớp không phân biệt hoa thường với danh sách đơn vị hợp lệ
  const lower = normalized.toLowerCase();
  const matched = VALID_CONTRACT_UNITS.find(
    (u) => u.toLowerCase() === lower
  );

  return matched || null;
}

module.exports = {
  VALID_CONTRACT_UNITS,
  normalizeContractUnit,
};
