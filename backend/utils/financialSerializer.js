"use strict";

/**
 * financialSerializer.js — Lớp bảo vệ dữ liệu tài chính (OV-1)
 *
 * Nhiệm vụ:
 *  1. Khóa/loại bỏ triệt để các trường tiền tệ (đơn giá, thành tiền, giá trị hợp đồng,
 *     dự toán, chi phí thực tế, tạm giữ...) khỏi response JSON đối với các vai trò
 *     bị hạn chế (đặc biệt là Đội trưởng - ROLES.DOI_TRUONG).
 *  2. Phủ bảo vệ trên tầng Serializer độc lập với câu truy vấn SQL (phòng thủ chiều sâu).
 */

const { ROLES } = require("./constants");

// Danh sách các khóa tiền tệ nhạy cảm cần loại bỏ hoàn toàn
const FINANCIAL_KEYS = new Set([
  "unit_price",
  "total_price",
  "contract_value",
  "contract_total",
  "budget",
  "cost",
  "actual_cost",
  "actual_costs",
  "retention_amount",
  "retention_rate",
  "total_amount",
  "don_gia",
  "thanh_tien",
  "du_toan",
  "chi_phi",
  "tam_giu",
]);

/**
 * Hàm đệ quy loại bỏ tất cả các khóa tài chính trong Object hoặc Array
 */
function stripFinancialFields(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => stripFinancialFields(item));
  }

  if (typeof data === "object") {
    // Nếu là Date, Buffer, RegExp thì giữ nguyên
    if (data instanceof Date || Buffer.isBuffer(data) || data instanceof RegExp) {
      return data;
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (!FINANCIAL_KEYS.has(lowerKey)) {
        cleaned[key] = stripFinancialFields(value);
      }
    }
    return cleaned;
  }

  return data;
}

/**
 * Middleware gắn vào Express Router để tự động chặn các trường tiền tệ
 * khi req.projectRole thuộc danh sách restrictedRoles (mặc định: [ROLES.DOI_TRUONG]).
 */
function financialSerializerMiddleware(restrictedRoles = [ROLES.DOI_TRUONG]) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      const currentRole = req.projectRole;
      if (restrictedRoles.includes(currentRole)) {
        const sanitizedBody = stripFinancialFields(body);
        return originalJson(sanitizedBody);
      }
      return originalJson(body);
    };

    next();
  };
}

module.exports = {
  FINANCIAL_KEYS,
  stripFinancialFields,
  financialSerializerMiddleware,
};
