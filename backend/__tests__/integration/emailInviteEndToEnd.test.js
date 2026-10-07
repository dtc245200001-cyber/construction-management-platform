"use strict";

const request = require("supertest");
const crypto = require("crypto");
const app = require("../../app");
const pool = require("../../config/db");
const { ROLES } = require("../../utils/constants");

describe("Email Invitation End-to-End Flow (Integration)", () => {
  let _adminCookie;
  let projectId;
  let pmUserId;

  beforeAll(async () => {
    // Dọn dẹp dữ liệu
    await pool.query(
      "TRUNCATE TABLE email_logs, project_members, invitations, projects, users RESTART IDENTITY CASCADE"
    );

    // 1. Tạo System Admin (id=1)
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role_id, is_system_admin)
       VALUES (1, 'sysadmin@test.com', 'pwd_hash', 'System Admin', 1, true)`
    );

    // 2. Tạo Ban Quản Lý (id=2)
    const pmRes = await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role_id, is_system_admin)
       VALUES (2, 'pm@test.com', 'pwd_hash', 'Ban Quan Ly', 2, false)
       RETURNING id`
    );
    pmUserId = pmRes.rows[0].id;

    // 3. Tạo Project
    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Dự án E2E Email', 'PRJ-EMAIL-E2E', '2026-10-01')
       RETURNING id`
    );
    projectId = projRes.rows[0].id;

    // 4. Thêm PM vào dự án với quyền BAN_QUAN_LY
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [projectId, pmUserId, ROLES.BAN_QUAN_LY]
    );

    // Đăng nhập với System Admin để lấy session cookie
    // Thay vì gọi API login với Argon2 giả lập, ta mock session hoặc dùng session store
    // Ở đây ta có thể test qua supertest agent hoặc login trực tiếp
    // Advance users sequence
    await pool.query("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))");
  });

  afterAll(async () => {
    await pool.query(
      "TRUNCATE TABLE email_logs, project_members, invitations, projects, users RESTART IDENTITY CASCADE"
    );
    await pool.end();
  });

  test("1. Mời email chưa có tài khoản: ghi nhận token_hash, email_logs và đăng ký thành công vào project", async () => {
    // Giả lập PM gửi lời mời bằng cách mock session qua supertest agent login
    const argon2 = require("argon2");
    const pwdHash = await argon2.hash("Password123!");
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = 2", [pwdHash]);

    const agent = request.agent(app);
    const loginRes = await agent
      .post("/api/auth/login")
      .send({ email: "pm@test.com", password: "Password123!" });
    expect(loginRes.status).toBe(200);

    const inviteEmail = "newengineer@company.com";
    const inviteRole = ROLES.KY_SU_GIAM_SAT;

    // PM gửi lời mời
    const inviteRes = await agent
      .post(`/api/projects/${projectId}/members`)
      .send({ email: inviteEmail, role: inviteRole });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.message).toContain("Đã gửi thư mời");

    // Kiểm tra DB: bảng invitations có bản ghi token_hash
    const invDb = await pool.query(
      "SELECT id, email, token_hash, project_id, project_role FROM invitations WHERE email = $1",
      [inviteEmail]
    );
    expect(invDb.rows).toHaveLength(1);
    const invRecord = invDb.rows[0];
    expect(invRecord.project_role).toBe(inviteRole);
    expect(invRecord.token_hash).toBeDefined();

    // Kiểm tra DB: bảng email_logs có bản ghi ghi nhận lượt gửi
    const emailLogDb = await pool.query(
      "SELECT id, email_masked, status, retry_count FROM email_logs WHERE invitation_id = $1",
      [invRecord.id]
    );
    expect(emailLogDb.rows.length).toBeGreaterThan(0);
    expect(emailLogDb.rows[0].email_masked).toBeDefined();

    // Giả lập user nhận token, bấm link và hoàn tất đăng ký tài khoản mới
    // Ta tạo 1 token test cụ thể
    const testRawToken = "newuserregtoken1234567890123456789012345678901234567890";
    const testTokenHash = crypto.createHash("sha256").update(testRawToken).digest("hex");
    await pool.query("UPDATE invitations SET token_hash = $1 WHERE id = $2", [testTokenHash, invRecord.id]);

    const regRes = await request(app)
      .post("/api/auth/register")
      .send({
        email: inviteEmail,
        password: "Password123!",
        confirmPassword: "Password123!",
        name: "Kỹ Sư Giám Sát Mới",
        token: testRawToken,
      });

    expect(regRes.status).toBe(201);

    // Xác nhận user mới đã được tự động thêm vào project_members với đúng vai trò
    const memberCheck = await pool.query(
      `SELECT pm.role, u.email
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1 AND u.email = $2`,
      [projectId, inviteEmail]
    );
    expect(memberCheck.rows).toHaveLength(1);
    expect(memberCheck.rows[0].role).toBe(inviteRole);
  });

  test("2. Mời email đã có tài khoản: chấp nhận thư mời qua accept endpoint đưa user vào project_members", async () => {
    // Tạo user đã có sẵn tài khoản
    const existingEmail = "architect@company.com";
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, name, role_id, is_system_admin)
       VALUES ($1, 'hash', 'Kiến trúc sư', 2, false)
       RETURNING id`,
      [existingEmail]
    );
    const existingId = userRes.rows[0].id;

    // PM mời user này vào dự án với vai trò CHU_DAU_TU
    const rawToken = "existarchitecttoken123456789012345678901234567890123456";
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invRes = await pool.query(
      `INSERT INTO invitations (email, token_hash, invited_by, expires_at, project_id, project_role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [existingEmail, tokenHash, pmUserId, expiresAt, projectId, ROLES.CHU_DAU_TU]
    );
    const invId = invRes.rows[0].id;

    // User đã có tài khoản gọi POST /api/public/invitations/:token/accept
    const acceptRes = await request(app)
      .post(`/api/public/invitations/${rawToken}/accept`)
      .send();

    expect(acceptRes.status).toBe(200);

    // Xác nhận user đã có mặt trong project_members với role CHU_DAU_TU
    const memberCheck = await pool.query(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, existingId]
    );
    expect(memberCheck.rows).toHaveLength(1);
    expect(memberCheck.rows[0].role).toBe(ROLES.CHU_DAU_TU);

    // Xác nhận thư mời đã được đánh dấu used_at
    const invCheck = await pool.query("SELECT used_at FROM invitations WHERE id = $1", [invId]);
    expect(invCheck.rows[0].used_at).not.toBeNull();
  });

  test("3. Gửi lại lời mời (resend): cập nhật token_hash mới và ghi thêm email_logs", async () => {
    const resendEmail = "pending@company.com";
    const oldRawToken = "oldtoken1234567890123456789012345678901234567890123456";
    const oldHash = crypto.createHash("sha256").update(oldRawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invRes = await pool.query(
      `INSERT INTO invitations (email, token_hash, invited_by, expires_at, project_id, project_role)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [resendEmail, oldHash, pmUserId, expiresAt, projectId, ROLES.DOI_TRUONG]
    );
    const invId = invRes.rows[0].id;

    // PM gọi resend
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "pm@test.com", password: "Password123!" });

    const resendRes = await agent
      .post(`/api/projects/${projectId}/invitations/${invId}/resend`)
      .send();

    expect(resendRes.status).toBe(200);

    // Token hash phải thay đổi khác oldHash
    const invUpdated = await pool.query("SELECT token_hash FROM invitations WHERE id = $1", [invId]);
    expect(invUpdated.rows[0].token_hash).not.toBe(oldHash);

    // Phải có log trong email_logs cho invitation này
    const logs = await pool.query("SELECT id FROM email_logs WHERE invitation_id = $1", [invId]);
    expect(logs.rows.length).toBeGreaterThan(0);
  });

  test("4. System Admin mời với vai trò không hợp lệ: phải bị chặn với 400 (Mục 4.2.3)", async () => {
    // Đăng nhập admin
    const argon2 = require("argon2");
    const adminHash = await argon2.hash("AdminPassword123!");
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = 1", [adminHash]);

    const adminAgent = request.agent(app);
    await adminAgent
      .post("/api/auth/login")
      .send({ email: "sysadmin@test.com", password: "AdminPassword123!" });

    // Gọi mời với role không hợp lệ
    const invalidRes = await adminAgent
      .post("/api/admin/invitations")
      .send({
        email: "someone@test.com",
        projectId,
        role: "vai_tro_khong_hop_le_xyz",
      });

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.message).toMatch(/Vai trò.*không hợp lệ/i);
  });
});
