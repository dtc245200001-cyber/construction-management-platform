// middleware/errorHandler.js — Xử lý lỗi tập trung.
//
// notFoundHandler: bắt mọi route không khớp → 404 JSON.
// errorHandler: bắt lỗi do next(err) hoặc async route throw → JSON.
//   - Production: không lộ stack, và ẩn message của lỗi 5xx.
//   - Development: trả thêm stack để debug.

"use strict";

const logger = require("../utils/logger");

/**
 * 404 handler — đặt SAU tất cả route, TRƯỚC errorHandler.
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    message: "Không tìm thấy đường dẫn này",
  });
}

/**
 * Error handler — đặt CUỐI middleware stack.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  logger.error(
    {
      err: {
        message: err.message,
        code: err.code,
      },
      req: {
        method: req.method,
        url: req.url,
      },
    },
    "Lỗi xử lý request"
  );

  const isProd = process.env.NODE_ENV === "production";

  // T-25: trả thông tin vòng phụ thuộc để frontend hiển thị
  // tên công việc thay vì chỉ ID.
  if (err.code === "DEPENDENCY_CYCLE") {
    return res.status(status).json({
      code: err.code,
      message: err.message,
      cycleNames: err.cycleNames || [],
      cyclePath: err.cyclePath || "",
    });
  }

  // Lỗi 5xx: ẩn chi tiết ở production.
  // Lỗi 4xx là lỗi của người gọi, giữ nguyên message.
  const hideDetail = isProd && status >= 500;

  res.status(status).json({
    message: hideDetail ? "Lỗi máy chủ" : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};