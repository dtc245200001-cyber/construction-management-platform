const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.test'), override: true });
process.env.DATABASE_URL = process.env.LOCAL_DATABASE_URL || 'postgres://postgres:postgres123@localhost:5432/construction_db_test';

const request = require('supertest');
const app = require('../app');
const db = require('../config/db');
const crypto = require('crypto');
const { createEmailLog, processEmailLogs } = require('../lib/emailSender');

jest.mock('../lib/emailSender', () => ({
  createEmailLog: jest.fn().mockResolvedValue(1),
  processEmailLogs: jest.fn().mockResolvedValue()
}));

// Mock requireSystemAdmin
jest.mock('../middleware/systemAdmin', () => (req, res, next) => {
  req.session.user = { id: 1, is_system_admin: true, name: 'Admin' };
  req.user = req.session.user;
  next();
});

// Need to mock auth middleware if it's applied globally to admin routes
jest.mock('../middleware/auth', () => (req, res, next) => {
  req.session.user = { id: 1, is_system_admin: true, name: 'Admin' };
  req.user = req.session.user;
  next();
});

describe('Invitations (E4)', () => {
  let projectId;
  let _testUserId;

  beforeAll(async () => {
    // Debug: kiểm tra DB đang dùng
    const dbInfo = await db.query("SELECT current_database()");
    console.log('[TEST] DB đang dùng:', dbInfo.rows[0].current_database);

    // TRUNCATE xóa sạch toàn bộ + reset sequence + cascade foreign key
    // trong một lệnh atomic - không bị lỗi duplicate key giữa các lần test
    await db.query(
      "TRUNCATE TABLE email_logs, project_members, invitations, projects, users RESTART IDENTITY CASCADE"
    );

    // Create admin user với id=1 (mock auth dùng id này)
    // Dùng UPSERT để không bị duplicate key nếu beforeAll chạy nhiều lần
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, role_id, is_system_admin) 
       VALUES (1, 'admin@e4.com', 'h', 'Admin', 1, true)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`
    );
    
    // Đặt sequence tiếp từ 2 để tránh conflict khi INSERT user không có id
    await db.query("SELECT setval('users_id_seq', 1, true)");
    
    // Create an existing normal user (sequence sẽ sinh ra id=2)
    const res2 = await db.query(
      `INSERT INTO users (email, password_hash, name, role_id) 
       VALUES ('exist@e4.com', 'h', 'Exist', 1)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    _testUserId = res2.rows[0].id;

    // Create a project
    const pRes = await db.query(
      "INSERT INTO projects (name, start_date) VALUES ('Test Project E4', CURRENT_DATE) RETURNING id"
    );
    projectId = pRes.rows[0].id;
  });

  afterAll(async () => {
    await db.end();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('POST /api/admin/invitations', () => {
    it('Tạo thư mời, băm token, gọi outbox và không trả về token gốc', async () => {
      const res = await request(app)
        .post('/api/admin/invitations')
        .send({ email: 'newuser@e4.com', projectId, role: 'chi_huy_truong' });
      
      expect(res.status).toBe(201);
      expect(res.body.token).toBeUndefined(); // Không được trả token trong response
      
      // DB check
      const invCheck = await db.query("SELECT * FROM invitations WHERE email = 'newuser@e4.com'");
      expect(invCheck.rows.length).toBe(1);
      expect(invCheck.rows[0].token_hash).toBeDefined();
      expect(invCheck.rows[0].token).toBeUndefined(); // Không có cột token

      // E3 calls check
      expect(createEmailLog).toHaveBeenCalled();
      expect(processEmailLogs).toHaveBeenCalled();
    });
  });

  describe('GET /api/public/invitations/:token', () => {
    it('Trả về lỗi chung chung nếu token sai hoặc hết hạn', async () => {
      const res = await request(app).get('/api/public/invitations/wrongtoken');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Mã thư mời không hợp lệ hoặc đã hết hạn');
    });

    it('Trả về thông tin userExists = false nếu email chưa đăng ký', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
      
      await db.query(
        "INSERT INTO invitations (email, token_hash, invited_by, project_id, project_role, expires_at) VALUES ('new2@e4.com', $1, 1, $2, 'chi_huy_truong', CURRENT_TIMESTAMP + interval '1 day')",
        [hash, projectId]
      );

      const res = await request(app).get(`/api/public/invitations/${rawToken}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('new2@e4.com');
      expect(res.body.userExists).toBe(false);
    });

    it('Trả về thông tin userExists = true nếu email đã đăng ký', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
      
      await db.query(
        "INSERT INTO invitations (email, token_hash, invited_by, project_id, project_role, expires_at) VALUES ('exist@e4.com', $1, 1, $2, 'chi_huy_truong', CURRENT_TIMESTAMP + interval '1 day')",
        [hash, projectId]
      );

      const res = await request(app).get(`/api/public/invitations/${rawToken}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('exist@e4.com');
      expect(res.body.userExists).toBe(true);
    });
  });
  describe('Project Invitations (E5)', () => {
    let invIdE5;
    
    beforeAll(async () => {
      // Add admin (user 1) as member to the project so they can call projectRoutes
      await db.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, 1, 'chi_huy_truong') ON CONFLICT DO NOTHING",
        [projectId]
      );
    });

    it('GET /api/projects/:projectId/members trả về invitations kèm email_status và is_expired', async () => {
      // Create an invitation
      const invRes = await db.query(
        "INSERT INTO invitations (email, token_hash, invited_by, project_id, project_role, expires_at) VALUES ('e5@test.com', 'h1', 1, $1, 'chi_huy_truong', CURRENT_TIMESTAMP + interval '1 day') RETURNING id",
        [projectId]
      );
      invIdE5 = invRes.rows[0].id;
      
      // Create an email log
      await db.query(
        "INSERT INTO email_logs (invitation_id, email_masked, status) VALUES ($1, 'e***@test.com', 'sent')",
        [invIdE5]
      );

      const res = await request(app).get(`/api/projects/${projectId}/members`);
      expect(res.status).toBe(200);
      
      const inv = res.body.invitations.find(i => i.id === invIdE5);
      expect(inv).toBeDefined();
      expect(inv.email).toBe('e5@test.com');
      expect(inv.email_status).toBe('sent');
      expect(inv.is_expired).toBe(false);
    });

    it('POST /api/projects/:projectId/invitations/:id/resend cập nhật token và tạo email log mới', async () => {
      const res = await request(app).post(`/api/projects/${projectId}/invitations/${invIdE5}/resend`);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Đã gửi lại thư mời thành công');

      // Check DB
      const invCheck = await db.query("SELECT token_hash, (expires_at > CURRENT_TIMESTAMP) as valid FROM invitations WHERE id = $1", [invIdE5]);
      expect(invCheck.rows[0].token_hash).not.toBe('h1');
      expect(invCheck.rows[0].valid).toBe(true);

      // Check logs (it is mocked, so we just check if the mock was called)
      const { createEmailLog } = require('../lib/emailSender');
      expect(createEmailLog).toHaveBeenCalled();
    });
  });
});
