"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Diary Locks API Integration Tests", () => {
  let cookieSysAdmin;
  let cookieBQL;
  let cookieCHT;
  let cookieKSGS;
  let cookieChuDauTu;
  
  let projectAId;
  let projectBId;
  let projectAWorkItemId;

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const pastDate1 = "2026-10-01";
  const pastDate2 = "2026-10-02";
  const pastDate3 = "2026-10-03";
  const pastDate4 = "2026-10-04";
  const pastDate5 = "2026-10-05";

  beforeAll(async () => {
    await pool.query("TRUNCATE TABLE daily_log_locks, diary_entries, work_items, project_members, projects, users RESTART IDENTITY CASCADE");

    const requiredRoles = ['chu_dau_tu', 'ban_quan_ly', 'chi_huy_truong', 'ky_su_giam_sat'];
    for (const r of requiredRoles) {
      await pool.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }
    const { rows: roles } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => roles.find(r => r.name === name).id;
    
    const roleChuDauTu = getRole('chu_dau_tu');
    const roleBQL = getRole('ban_quan_ly');
    const roleCHT = getRole('chi_huy_truong');
    const roleKSGS = getRole('ky_su_giam_sat');

    const passwordHash = await argon2.hash("Password123!");

    // Create users
    const userSysAdmin = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('SysAdmin', 'sysadmin@test.com', $1, $2, true, true) RETURNING id", [passwordHash, roleBQL]);
    const userBQL = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('BQL', 'bql@test.com', $1, $2, false, true) RETURNING id", [passwordHash, roleBQL]);
    const userCHT = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('CHT', 'cht@test.com', $1, $2, false, true) RETURNING id", [passwordHash, roleCHT]);
    const userKSGS = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('KSGS', 'ksgs@test.com', $1, $2, false, true) RETURNING id", [passwordHash, roleKSGS]);
    const userChuDauTu = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Chu Dau Tu', 'chudautu@test.com', $1, $2, false, true) RETURNING id", [passwordHash, roleChuDauTu]);

    // Login users to get cookies
    cookieSysAdmin = (await request(app).post("/api/auth/login").send({ email: "sysadmin@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieBQL = (await request(app).post("/api/auth/login").send({ email: "bql@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieCHT = (await request(app).post("/api/auth/login").send({ email: "cht@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieKSGS = (await request(app).post("/api/auth/login").send({ email: "ksgs@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieChuDauTu = (await request(app).post("/api/auth/login").send({ email: "chudautu@test.com", password: "Password123!" })).headers["set-cookie"];

    // Create Projects
    const pA = await pool.query("INSERT INTO projects (name, code, start_date) VALUES ('Project A', 'PA', '2026-01-01') RETURNING id");
    projectAId = pA.rows[0].id;
    
    const pB = await pool.query("INSERT INTO projects (name, code, start_date) VALUES ('Project B', 'PB', '2026-01-01') RETURNING id");
    projectBId = pB.rows[0].id;

    // Assign project members to Project A
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ban_quan_ly'), ($1, $3, 'chi_huy_truong'), ($1, $4, 'ky_su_giam_sat'), ($1, $5, 'chu_dau_tu')",
      [projectAId, userBQL.rows[0].id, userCHT.rows[0].id, userKSGS.rows[0].id, userChuDauTu.rows[0].id]
    );

    const wiA = await pool.query("INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'WorkItem A', 'WIA', 'category') RETURNING id", [projectAId]);
    projectAWorkItemId = wiA.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('System Admin khóa nhật ký ngày đã qua thành công', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/${pastDate1}/lock`)
      .set('Cookie', cookieSysAdmin);
    expect(res.status).toBe(200);
    expect(res.body.is_locked).toBe(true);
  });
  
  it('System Admin mở khóa nhật ký thành công', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/${pastDate1}/unlock`)
      .set('Cookie', cookieSysAdmin)
      .send({ reason: "Sửa lỗi" });
    expect(res.status).toBe(200);
    expect(res.body.is_locked).toBe(false);
  });

  it('Kỹ sư giám sát khóa nhật ký ngày đã qua thành công', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/${pastDate2}/lock`)
      .set('Cookie', cookieKSGS);
    expect(res.status).toBe(200);
    expect(res.body.is_locked).toBe(true);
  });

  it('Kỹ sư giám sát KHÔNG được mở khóa', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/${pastDate2}/unlock`)
      .set('Cookie', cookieKSGS)
      .send({ reason: "Thích mở" });
    expect(res.status).toBe(403);
  });

  it('Ban quản lý mở khóa nhật ký thành công (Thuộc dự án)', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/${pastDate2}/unlock`)
      .set('Cookie', cookieBQL)
      .send({ reason: "Khách yêu cầu" });
    expect(res.status).toBe(200);
    expect(res.body.is_locked).toBe(false);
  });

  it('Ban quản lý KHÔNG được khóa nhật ký', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/${pastDate3}/lock`)
      .set('Cookie', cookieBQL);
    expect(res.status).toBe(403);
  });

  it('Chỉ huy trưởng gọi API khóa bị 403', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/${pastDate4}/lock`)
      .set('Cookie', cookieCHT);
    expect(res.status).toBe(403);
  });
  
  it('Ban quản lý không có quyền ở dự án khác bị 403', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectBId}/diary-locks/${pastDate5}/lock`)
      .set('Cookie', cookieBQL);
    expect(res.status).toBe(403);
  });

  it('Không thể khóa ngày hiện tại', async () => {
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-locks/${todayStr}/lock`)
      .set('Cookie', cookieSysAdmin);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('ngày đã qua');
  });

  it('sửa/xóa hoặc tạo nhật ký thuộc ngày đã khóa bị từ chối', async () => {
    // pastDate5 is locked
    await request(app).post(`/api/projects/${projectAId}/diary-locks/${pastDate5}/lock`).set('Cookie', cookieSysAdmin);

    const entryAt = `${pastDate5}T10:00:00Z`; 
    const res = await request(app)
      .post(`/api/projects/${projectAId}/diary-entries`)
      .set('Cookie', cookieSysAdmin)
      .send({ work_item_id: projectAWorkItemId, content: 'Test', entry_at: entryAt });
    
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('đã bị khóa');
  });

});
