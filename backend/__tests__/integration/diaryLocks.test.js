"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Diary Locks API Integration Tests", () => {
  let cookieAdmin;
  let cookieChuDauTu;
  let projectAId;
  let projectAWorkItemId;

  beforeAll(async () => {
    await pool.query("TRUNCATE TABLE daily_log_locks, diary_entries, work_items, project_members, projects, users RESTART IDENTITY CASCADE");

    const requiredRoles = ['chu_dau_tu', 'ban_quan_ly'];
    for (const r of requiredRoles) {
      await pool.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }
    const { rows: roles } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => roles.find(r => r.name === name).id;
    const roleChuDauTu = getRole('chu_dau_tu');
    const roleAdmin = getRole('ban_quan_ly');

    const passwordHash = await argon2.hash("Password123!");

    const userAdmin = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Admin', 'admin@test.com', $1, $2, true, true) RETURNING id", [passwordHash, roleAdmin]);
    const userChuDauTu = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Chu Dau Tu', 'chudautu@test.com', $1, $2, false, true) RETURNING id", [passwordHash, roleChuDauTu]);

    cookieAdmin = (await request(app).post("/api/auth/login").send({ email: "admin@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieChuDauTu = (await request(app).post("/api/auth/login").send({ email: "chudautu@test.com", password: "Password123!" })).headers["set-cookie"];

    const pA = await pool.query("INSERT INTO projects (name, code, start_date) VALUES ('Project A', 'PA', '2026-01-01') RETURNING id");
    projectAId = pA.rows[0].id;
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'chu_dau_tu'), ($1, $3, 'ban_quan_ly')", [projectAId, userChuDauTu.rows[0].id, userAdmin.rows[0].id]);

    const wiA = await pool.query("INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'WorkItem A', 'WIA', 'category') RETURNING id", [projectAId]);
    projectAWorkItemId = wiA.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('khóa nhật ký thành công (Manager)', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/2026-10-08/lock`)
      .set('Cookie', cookieAdmin);
    expect(res.status).toBe(200);
    expect(res.body.is_locked).toBe(true);
    expect(new Date(res.body.log_date).toISOString()).toContain('2026-10-08');
  });

  it('viewer (Chủ đầu tư) không có quyền khóa/mở khóa', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/2026-10-09/lock`)
      .set('Cookie', cookieChuDauTu);
    expect(res.status).toBe(403);
  });

  it('truy vấn trạng thái khóa chính xác', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectAId}/diary-locks/2026-10-08`)
      .set('Cookie', cookieChuDauTu);
    expect(res.status).toBe(200);
    expect(res.body.is_locked).toBe(true);

    const res2 = await request(app)
      .get(`/api/projects/${projectAId}/diary-locks/2026-10-09`)
      .set('Cookie', cookieChuDauTu);
    expect(res2.status).toBe(200);
    expect(res2.body.is_locked).toBe(false);
  });

  it('sửa/xóa hoặc tạo nhật ký thuộc ngày đã khóa bị từ chối', async () => {
    // 2026-10-08 is locked
    const entryAt = '2026-10-08T10:00:00Z'; 
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-entries`)
      .set('Cookie', cookieAdmin)
      .send({ work_item_id: projectAWorkItemId, content: 'Test', entry_at: entryAt });
    
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('đã bị khóa');
  });

  it('mở khóa nhật ký thất bại nếu thiếu lý do', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/2026-10-08/unlock`)
      .set('Cookie', cookieAdmin)
      .send({ reason: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('lý do');
  });

  it('mở khóa nhật ký thành công với lý do', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/2026-10-08/unlock`)
      .set('Cookie', cookieAdmin)
      .send({ reason: 'Sửa lỗi' });
    expect(res.status).toBe(200);
    expect(res.body.is_locked).toBe(false);
    expect(res.body.unlock_reason).toBe('Sửa lỗi');
  });
});
