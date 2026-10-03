// middleware/errorHandler.js — Xử lý lỗi tập trung.
//
// notFoundHandler: bắt mọi route không khớp → 404 JSON.
// errorHandler: bắt lỗi do next(err) hoặc async route throw → 500 JSON.
//   - Production: không lộ stack/message nội bộ ra client.
//   - Development: trả thêm stack để debug.

"use strict";

const logger = require("../utils/logger");

/**
 * 404 handler — đặt SAU tất cả route, TRƯỚC errorHandler.
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({ message: "Không tìm thấy đường dẫn này" });
}

/**
 * Error handler — đặt cuối cùng, nhận 4 tham số (err, req, res, next).
 * Express nhận diện error handler qua số lượng tham số nên không bỏ `next`.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  logger.error(
    {
      err: { message: err.message, code: err.code },
      req: { method: req.method, url: req.url },
    },
    "Lỗi xử lý request"
  );

  const isProd = process.env.NODE_ENV === "production";

  res.status(status).json({
    message: isProd ? "Lỗi máy chủ" : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}

module.exports = { notFoundHandler, errorHandler };
