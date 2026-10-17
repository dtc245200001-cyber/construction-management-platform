"use strict";

// S-22 / T-50 — Điểm móc cho S-24 (Khoá sổ nhật ký).
// Hiện tại hàm không làm gì — chỉ resolve ngay.
// Khi làm S-24, cài đặt logic kiểm tra bảng daily_log_locks ở đây;
// ném lỗi HTTP 423 nếu ngày đã bị khoá.

/**
 * Kiểm tra ngày có thể ghi mục đầu ngày không.
 * Được gọi bên trong transaction của PUT /diary-days/:date.
 *
 * @param {import('pg').PoolClient} client - pg client đang trong transaction
 * @param {number} projectId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<void>} resolve nếu được phép; ném lỗi nếu bị khoá
 */
async function assertDayEditable(client, projectId, date) {
  const lockRes = await client.query(
    "SELECT is_locked FROM daily_log_locks WHERE project_id = $1 AND log_date = $2::date",
    [projectId, date]
  );
  if (lockRes.rows.length > 0 && lockRes.rows[0].is_locked) {
    const error = new Error("Nhật ký của ngày này đã bị khóa, không thể chỉnh sửa.");
    error.status = 423;
    error.code = "LOCKED";
    throw error;
  }
}

module.exports = { assertDayEditable };
