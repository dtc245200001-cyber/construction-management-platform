const { sendEmail, maskEmail } = require('./mailer');
const dbPool = require('../config/db');

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
    const result = await sendEmail({ to: email, subject, html, text });
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

module.exports = {
  createEmailLog,
  processEmailLogs
};
