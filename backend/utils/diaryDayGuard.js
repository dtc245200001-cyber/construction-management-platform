"use strict";

// S-22 / T-50 — Điểm móc cho S-24 (Khoá sổ nhật ký).
// Hiện tại hàm không làm gì — chỉ resolve ngay.
// Khi làm S-24, cài đặt logic kiểm tra bảng daily_log_locks ở đây;
// ném lỗi HTTP 423 nếu ngày đã bị khoá.

/**
 * Kiểm tra ngày có thể ghi mục đầu ngày không.
 * Được gọi bên trong transaction của PUT /diary-days/:date.
 *
 * @param {import('pg').PoolClient} _client - pg client đang trong transaction
 * @param {number} _projectId
 * @param {string} _date - YYYY-MM-DD
 * @returns {Promise<void>} resolve nếu được phép; ném lỗi nếu bị khoá
 *
 * TODO(S-24): kiểm tra bảng daily_log_locks, ném lỗi 423 nếu đã khoá.
 */
async function assertDayEditable(_client, _projectId, _date) {
  // Chưa cài đặt — luôn cho phép ghi.
}

module.exports = { assertDayEditable };
