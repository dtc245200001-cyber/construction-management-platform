// utils/validators.js — Các hàm validate / normalize đầu vào dùng chung.

"use strict";

/**
 * Parse và validate một giá trị là số nguyên dương.
 *
 * @param {*} value - Giá trị từ req.params hoặc req.query
 * @returns {number|null} Số nguyên dương, hoặc null nếu không hợp lệ
 */
function parsePositiveInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Normalize tên hạng mục: trim khoảng trắng hai đầu, kiểm tra độ dài 1–255.
 *
 * @param {*} value - Giá trị từ req.body
 * @returns {string|null} Chuỗi đã trim, hoặc null nếu không hợp lệ
 */
function normalizeName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return null;
  return trimmed;
}

module.exports = { parsePositiveInt, normalizeName };
