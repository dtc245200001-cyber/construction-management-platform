const { sendEmail, maskEmail } = require('./mailer');
const dbPool = require('../config/db');

// Thời gian tối đa chờ 1 lần gửi mail. Vượt quá coi như gửi thất bại để rơi
// vào catch (ghi error/pending+retry) thay vì treo pending vĩnh viễn — vd.
// firewall chặn outbound SMTP im lặng khiến transporter.sendMail không bao
// giờ resolve/reject. Đọc env mỗi lần gọi để test rút ngắn được.
function getSendTimeoutMs() {
  return Number(process.env.EMAIL_SEND_TIMEOUT_MS) || 30_000;
}

// Log pending quá ngưỡng này (mặc định 15 phút) mà chưa xong được coi như tác
// vụ gửi đã chết/crash giữa chừng (process restart đúng lúc đang await) —
// cho phép thử lại thay vì kẹt vĩnh viễn ở 'pending'. Đọc env mỗi lần gọi.
function getStalePendingMinutes() {
  return Number(process.env.EMAIL_STALE_PENDING_MINUTES) || 15;
}

function sendWithTimeout(args) {
  const timeoutMs = getSendTimeoutMs();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Gửi email quá ${timeoutMs / 1000}s không phản hồi (timeout)`));
    }, timeoutMs);
  });
  return Promise.race([sendEmail(args), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Tạo log chờ gửi thư
 * @param {Object} client Db client (thường nằm trong transaction)
 * @param {number} invitationId ID lời mời
 * @param {string} email Địa chỉ nhận
 * @returns {number} ID của log vừa tạo
 */
async function createEmailLog(client, invitationId, email) {
  const masked = maskEmail(email);
  const result = await client.query(
    `INSERT INTO email_logs (invitation_id, email_masked, status) 
     VALUES ($1, $2, 'pending') RETURNING id`,
    [invitationId, masked]
  );
  return result.rows[0].id;
}

/**
 * Xử lý việc gửi thư và cập nhật trạng thái
 * Hàm này có thể được gọi thông qua cronjob hoặc ngay sau khi commit transaction
 * @param {Object} data 
 */
async function processEmailLogs({ id: invitationId, email, subject, html, text }) {
  // Tìm log pending cho invitationId này
  const pendingRes = await dbPool.query(
    "SELECT id, retry_count FROM email_logs WHERE invitation_id = $1 AND status != 'sent' ORDER BY id DESC LIMIT 1",
    [invitationId]
  );
  
  if (pendingRes.rows.length === 0) {
    return; // Không có gì để gửi
  }
  
  const log = pendingRes.rows[0];
  const maxRetries = 3;

  try {
    const result = await sendWithTimeout({ to: email, subject, html, text });
    await dbPool.query(
      "UPDATE email_logs SET status = 'sent', message_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [result.messageId, log.id]
    );
  } catch (error) {
    const newCount = log.retry_count + 1;
    const status = newCount >= maxRetries ? 'error' : 'pending';
    
    await dbPool.query(
      "UPDATE email_logs SET status = $1, retry_count = $2, error_reason = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4",
      [status, newCount, error.message, log.id]
    );
  }
}

/**
 * Dọn các log 'pending' quá hạn (tác vụ gửi đã chết/crash giữa chừng, không
 * có kết quả trả về): đánh dấu 'error' kèm error_reason để UI thoát khỏi
 * "Đang gửi..." vĩnh viễn và hiện nút "Gửi lại" được.
 * @returns {number} số log đã dọn
 */
async function reapStalePendingLogs() {
  const staleMinutes = getStalePendingMinutes();
  const result = await dbPool.query(
    `UPDATE email_logs
        SET status = 'error',
            error_reason = 'Tác vụ gửi đã dừng bất thường (quá hạn chờ), vui lòng bấm Gửi lại',
            updated_at = CURRENT_TIMESTAMP
      WHERE status = 'pending'
        AND updated_at < CURRENT_TIMESTAMP - ($1 || ' minutes')::interval
      RETURNING id`,
    [String(staleMinutes)]
  );
  return result.rowCount;
}

module.exports = {
  createEmailLog,
  processEmailLogs,
  reapStalePendingLogs,
};
