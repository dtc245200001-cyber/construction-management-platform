const { createEmailLog, processEmailLogs } = require('../lib/emailSender');
const db = require('../config/db');
const { sendEmail } = require('../lib/mailer');

// Mock mailer
jest.mock('../lib/mailer', () => ({
  sendEmail: jest.fn(),
  maskEmail: jest.requireActual('../lib/mailer').maskEmail,
  memoryInbox: []
}));

describe('Email Sender (E3)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await db.query('TRUNCATE TABLE email_logs, invitations, audit_logs, users RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await db.end();
  });

  it('Gửi thành công ghi trạng thái "đã gửi"', async () => {
    // Mock sendEmail success
    sendEmail.mockResolvedValueOnce({ status: 'sent', messageId: 'msg-1' });

    // Cần tạo user và invitation hợp lệ do ràng buộc khóa ngoại
    const userRes = await db.query(
      "INSERT INTO users (email, password_hash, name, role_id) VALUES ('test@a.com', 'h', 'Test', 1) RETURNING id"
    );
    const userId = userRes.rows[0].id;

    const invRes = await db.query(
      "INSERT INTO invitations (email, token_hash, invited_by, expires_at) VALUES ('user@x.com', 'hash1', $1, CURRENT_TIMESTAMP + interval '1 day') RETURNING id",
      [userId]
    );
    const invId = invRes.rows[0].id;

    // 1. Tạo log
    const logId = await createEmailLog(db, invId, 'user@x.com');
    
    // 2. Process
    await processEmailLogs({
      id: invId,
      email: 'user@x.com',
      subject: 'Test',
      html: '<p>Hi</p>',
      text: 'Hi'
    });

    // 3. Verify
    const checkLog = await db.query('SELECT status, message_id FROM email_logs WHERE id = $1', [logId]);
    expect(checkLog.rows[0].status).toBe('sent');
    expect(checkLog.rows[0].message_id).toBe('msg-1');
  });

  it('Nhà cung cấp trả lỗi tạm thời thì thử lại đúng số lần rồi dừng (tối đa 3 lần)', async () => {
    // Lỗi 3 lần
    sendEmail
      .mockRejectedValueOnce(new Error('Temp Error 1'))
      .mockRejectedValueOnce(new Error('Temp Error 2'))
      .mockRejectedValueOnce(new Error('Temp Error 3'));

    const userRes = await db.query(
      "INSERT INTO users (email, password_hash, name, role_id) VALUES ('test2@a.com', 'h', 'Test', 1) RETURNING id"
    );
    const invRes = await db.query(
      "INSERT INTO invitations (email, token_hash, invited_by, expires_at) VALUES ('user2@x.com', 'hash2', $1, CURRENT_TIMESTAMP + interval '1 day') RETURNING id",
      [userRes.rows[0].id]
    );
    const invId = invRes.rows[0].id;

    const logId = await createEmailLog(db, invId, 'user2@x.com');
    
    // Process gọi thử 3 lần
    for (let i = 0; i < 3; i++) {
      await processEmailLogs({
        id: invId,
        email: 'user2@x.com',
        subject: 'Test',
        html: '',
        text: ''
      });
    }

    const checkLog = await db.query('SELECT status, retry_count, error_reason FROM email_logs WHERE id = $1', [logId]);
    expect(checkLog.rows[0].status).toBe('error'); // Sau 3 lần thì đánh dấu error
    expect(checkLog.rows[0].retry_count).toBe(3);
    expect(checkLog.rows[0].error_reason).toContain('Temp Error 3');
  });

  it('Rollback không gửi thư (không có thư ma)', async () => {
    const client = await db.connect();
    let logId;
    try {
      await client.query('BEGIN');
      
      const userRes = await client.query(
        "INSERT INTO users (email, password_hash, name, role_id) VALUES ('test3@a.com', 'h', 'Test', 1) RETURNING id"
      );
      const invRes = await client.query(
        "INSERT INTO invitations (email, token_hash, invited_by, expires_at) VALUES ('user3@x.com', 'hash3', $1, CURRENT_TIMESTAMP + interval '1 day') RETURNING id",
        [userRes.rows[0].id]
      );
      
      logId = await createEmailLog(client, invRes.rows[0].id, 'user3@x.com');
      
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    // Vì đã rollback, processEmailLogs sẽ không tìm thấy log này trong DB
    // Chúng ta mô phỏng CronJob chạy
    await processEmailLogs({});

    // sendEmail không bao giờ được gọi
    expect(sendEmail).not.toHaveBeenCalled();
    
    // DB không có log này
    const checkLog = await db.query('SELECT * FROM email_logs WHERE id = $1', [logId || 0]);
    expect(checkLog.rows.length).toBe(0);
  });
});
