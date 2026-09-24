// utils/asyncHandler.js — Bọc route handler async để Express 4 bắt được lỗi.
//
// Express 4 không tự bắt lỗi throw từ async function. asyncHandler giúp
// tránh lặp try/catch trong từng route, chuyển lỗi vào next(err) để
// middleware/errorHandler.js xử lý tập trung.
//
// Dùng:
//   router.get('/path', asyncHandler(async (req, res) => { ... }));

"use strict";

/**
 * @param {Function} fn - Async route handler (req, res, next)
 * @returns {Function} Express middleware bắt lỗi async
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
