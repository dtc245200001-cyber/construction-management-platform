"use strict";

const request = require("supertest");
const path = require("path");
const fs = require("fs");
const { Buffer } = require("buffer");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Task Logs & Attachments API Integration Tests (S-23 / T-52 / T-53)", () => {
  let cookieKySu;
  let cookieNoProject;

  let projectId;
  let otherProjectId;
  let taskId;
  let otherTaskId;

  // Test dummy image path
  const testImagePath = path.join(__dirname, "test_image.png");

  beforeAll(async () => {
    // Create a dummy image file for testing upload
    fs.writeFileSync(testImagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));

    await pool.query(
      "TRUNCATE TABLE task_attachments, task_logs, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    const requiredRoles = [
      "ky_su_giam_sat",
      "chi_huy_truong",
      "ban_quan_ly",
      "doi_truong",
    ];
    for (const r of requiredRoles) {
      await pool.query(
        "INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [r]
      );
    }
    const { rows: roles } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => roles.find((r) => r.name === name).id;
    const roleKySu = getRole("ky_su_giam_sat");
    const roleAdmin = getRole("ban_quan_ly");

    const passwordHash = await argon2.hash("Password123!");

    const userAdmin = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Admin', 'admin_tlog@test.com', $1, $2, true, true) RETURNING id",
      [passwordHash, roleAdmin]
    );
    const userKySu = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Ky Su', 'kysu_tlog@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, roleKySu]
    );
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('No Project', 'noproject_tlog@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, roleKySu]
    );

    // Login
    cookieKySu = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: "kysu_tlog@test.com", password: "Password123!" })
    ).headers["set-cookie"];
    cookieNoProject = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: "noproject_tlog@test.com", password: "Password123!" })
    ).headers["set-cookie"];

    // Create Project A
    const pA = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Project Logs A', 'PLA', '2026-01-01') RETURNING id"
    );
    projectId = pA.rows[0].id;
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ky_su_giam_sat'), ($1, $3, 'ban_quan_ly')",
      [projectId, userKySu.rows[0].id, userAdmin.rows[0].id]
    );

    // Create Work Item & Task in Project A
    const wiA = await pool.query(
      "INSERT INTO work_items (project_id, code, name) VALUES ($1, 'WI-01', 'Hạng mục 1') RETURNING id",
      [projectId]
    );
    const tA = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Đổ bê tông sàn tầng 1', 5) RETURNING id",
      [wiA.rows[0].id]
    );
    taskId = tA.rows[0].id;

    // Create Project B
    const pB = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Project Logs B', 'PLB', '2026-01-01') RETURNING id"
    );
    otherProjectId = pB.rows[0].id;
    const wiB = await pool.query(
      "INSERT INTO work_items (project_id, code, name) VALUES ($1, 'WI-B1', 'Hạng mục B') RETURNING id",
      [otherProjectId]
    );
    const tB = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Công việc B', 5) RETURNING id",
      [wiB.rows[0].id]
    );
    otherTaskId = tB.rows[0].id;
  });

  afterAll(async () => {
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
    await pool.end();
  });

  it("POST /api/projects/:projectId/tasks/:taskId/logs - creates a log with text and image", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks/${taskId}/logs`)
      .set("Cookie", cookieKySu)
      .field("content", "Đã hoàn thành cốt thép dầm sàn, chuẩn bị đổ bê tông.")
      .attach("images", testImagePath);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Tạo nhật ký thành công");
    expect(res.body.log).toBeDefined();
    expect(res.body.log.task_id).toBe(taskId);
    expect(res.body.log.content).toBe("Đã hoàn thành cốt thép dầm sàn, chuẩn bị đổ bê tông.");
    expect(res.body.log.attachments).toHaveLength(1);
    expect(res.body.log.attachments[0].file_name).toBe("test_image.png");
    expect(res.body.log.attachments[0].url).toContain(`/api/projects/${projectId}/tasks/${taskId}/logs/`);
  });

  it("GET /api/projects/:projectId/tasks/:taskId/logs - returns logs list with attachments", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/tasks/${taskId}/logs`)
      .set("Cookie", cookieKySu);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const firstLog = res.body.data[0];
    expect(firstLog.task_id).toBe(taskId);
    expect(firstLog.content).toBe("Đã hoàn thành cốt thép dầm sàn, chuẩn bị đổ bê tông.");
    expect(firstLog.user_name).toBe("Ky Su");
    expect(firstLog.attachments).toHaveLength(1);
    expect(firstLog.attachments[0].url).toBeDefined();
  });

  it("GET /api/projects/:projectId/tasks/:taskId/logs/:logId/attachments/:attachmentId - streams attachment file", async () => {
    // Get logs list first
    const listRes = await request(app)
      .get(`/api/projects/${projectId}/tasks/${taskId}/logs`)
      .set("Cookie", cookieKySu);

    const log = listRes.body.data[0];
    const attachment = log.attachments[0];

    const fileRes = await request(app)
      .get(attachment.url)
      .set("Cookie", cookieKySu);

    expect(fileRes.status).toBe(200);
    expect(fileRes.headers["content-type"]).toBe("image/png");
    expect(fileRes.body).toBeDefined();
  });

  it("POST /api/projects/:projectId/tasks/:taskId/logs - rejects when user has no access to project", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks/${taskId}/logs`)
      .set("Cookie", cookieNoProject)
      .field("content", "Thử nghiệm không có quyền");

    expect(res.status).toBe(403);
  });

  it("POST /api/projects/:projectId/tasks/:taskId/logs - rejects when task does not belong to project", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks/${otherTaskId}/logs`)
      .set("Cookie", cookieKySu)
      .field("content", "Task thuộc project khác");

    expect(res.status).toBe(404);
  });
});
