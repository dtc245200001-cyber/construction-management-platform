"use strict";

const request = require("supertest");
const crypto = require("crypto");
const app = require("../../app");
const pool = require("../../config/db");

describe("Invitation Acceptance for Existing User (Integration)", () => {
  let existingUserId;
  let projectId;
  let rawToken;

  beforeAll(async () => {
    // Dọn dẹp dữ liệu test
    await pool.query(
      "TRUNCATE TABLE email_logs, project_members, invitations, projects, users RESTART IDENTITY CASCADE"
    );

    // Tạo 1 admin/inviter user (id=1)
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role_id, is_system_admin)
       VALUES (1, 'inviter@test.com', 'hashed_pwd', 'Inviter', 1, true)`
    );

    // Tạo 1 user đã có tài khoản sẵn trong hệ thống (id=2)
    const userRes = await pool.query(
      `INSERT INTO users (id, email, password_hash, name, role_id, is_system_admin)
       VALUES (2, 'existing@test.com', 'hashed_pwd', 'Existing User', 2, false)
       RETURNING id`
    );
    existingUserId = userRes.rows[0].id;

    // Tạo 1 dự án
    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Dự án Test Email', 'PRJ-EMAIL', '2026-10-01')
       RETURNING id`
    );
    projectId = projRes.rows[0].id;

    // Tạo thư mời cho user đã tồn tại với role dự án 'ky_su_giam_sat'
    rawToken = "testtokenexistinguser12345678901234567890123456789012";
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO invitations (email, token_hash, invited_by, expires_at, project_id, project_role)
       VALUES ($1, $2, 1, $3, $4, 'ky_su_giam_sat')`,
      ["existing@test.com", tokenHash, expiresAt, projectId]
    );
  });

  afterAll(async () => {
    // Dọn dẹp sau khi chạy test
    await pool.query(
      "TRUNCATE TABLE email_logs, project_members, invitations, projects, users RESTART IDENTITY CASCADE"
    );
    await pool.end();
  });

  test("người dùng đã có tài khoản chấp nhận lời mời thành công và vào project_members với đúng role", async () => {
    const res = await request(app)
      .post(`/api/public/invitations/${rawToken}/accept`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("thành công");

    // Kiểm tra DB thật: user phải có mặt trong project_members với role 'ky_su_giam_sat'
    const memberRes = await pool.query(
      "SELECT user_id, project_id, role FROM project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, existingUserId]
    );

    expect(memberRes.rows).toHaveLength(1);
    expect(memberRes.rows[0].role).toBe("ky_su_giam_sat");
  });
});
