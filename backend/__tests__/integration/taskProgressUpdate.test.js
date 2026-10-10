"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("T-35: API Cập nhật tiến độ thực tế (S-15)", () => {
  let projectId;
  let workItemId;
  let taskId;
  let authCookie;

  beforeAll(async () => {
    // 1. Dọn dẹp dữ liệu kiểm thử
    await pool.query(
      "TRUNCATE TABLE schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    // 2. Tạo User & Login (vai trò chỉ huy trưởng / ban quản lý)
    const passwordHash = await argon2.hash("Password123!");
    const roleRes = await pool.query(
      "SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1"
    );
    const roleId = roleRes.rows.length > 0 ? roleRes.rows[0].id : 1;

    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Site Manager', 'sitemanager@test.com', $1, $2, true, true)
       RETURNING id`,
      [passwordHash, roleId]
    );
    const userId = userRes.rows[0].id;

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "sitemanager@test.com", password: "Password123!" });
    authCookie = loginRes.headers["set-cookie"];

    // 3. Tạo dự án
    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Dự án T-35 Test', 'PRJ-T35', '2026-10-01')
       RETURNING id`
    );
    projectId = projRes.rows[0].id;

    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'ban_quan_ly')`,
      [projectId, userId]
    );

    // 4. Tạo hạng mục
    const wiRes = await pool.query(
      `INSERT INTO work_items (project_id, code, name, type)
       VALUES ($1, 'HM-T35', 'Hạng mục kiểm thử T-35', 'category')
       RETURNING id`,
      [projectId]
    );
    workItemId = wiRes.rows[0].id;

    // 5. Tạo công việc
    const taskRes = await pool.query(
      `INSERT INTO tasks (work_item_id, name, duration_days)
       VALUES ($1, 'Công việc móng', 5)
       RETURNING id`,
      [workItemId]
    );
    taskId = taskRes.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("PATCH /api/projects/:projectId/tasks/:taskId/progress", () => {
    it("Cập nhật ngày bắt đầu thực tế thành công -> 200", async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskId}/progress`)
        .set("Cookie", authCookie)
        .send({
          actual_start_date: "2026-10-02",
          percent_complete: 25,
        });

      expect(res.status).toBe(200);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.actual_start_date).toContain("2026-10-02");
      expect(res.body.task.percent_complete).toBe(25);
    });

    it("Chặn khi ngày kết thúc thực tế sớm hơn ngày bắt đầu thực tế -> 400", async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskId}/progress`)
        .set("Cookie", authCookie)
        .send({
          actual_start_date: "2026-10-10",
          actual_end_date: "2026-10-05",
          percent_complete: 50,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(
        /kết thúc thực tế không được sớm hơn.*bắt đầu/i
      );
    });

    it("Chặn khi phần trăm hoàn thành < 0 -> 400", async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskId}/progress`)
        .set("Cookie", authCookie)
        .send({
          percent_complete: -5,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Phần trăm hoàn thành/i);
    });

    it("Chặn khi phần trăm hoàn thành > 100 -> 400", async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskId}/progress`)
        .set("Cookie", authCookie)
        .send({
          percent_complete: 105,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Phần trăm hoàn thành/i);
    });

    it("Cập nhật hoàn thành công việc (100% và ngày kết thúc hợp lệ) -> 200", async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskId}/progress`)
        .set("Cookie", authCookie)
        .send({
          actual_start_date: "2026-10-02",
          actual_end_date: "2026-10-07",
          percent_complete: 100,
        });

      expect(res.status).toBe(200);
      expect(res.body.task.percent_complete).toBe(100);
      expect(res.body.task.actual_end_date).toContain("2026-10-07");
    });

    it("Cho phép ngày bắt đầu và ngày kết thúc cùng một ngày -> 200", async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskId}/progress`)
        .set("Cookie", authCookie)
        .send({
          actual_start_date: "2026-10-05",
          actual_end_date: "2026-10-05",
          percent_complete: 100,
        });

      expect(res.status).toBe(200);
      expect(res.body.task.actual_start_date).toContain("2026-10-05");
      expect(res.body.task.actual_end_date).toContain("2026-10-05");
    });
  });

  describe("PUT & PATCH /api/projects/:projectId/tasks/:taskId", () => {
    it("Cập nhật thông tin công việc kèm tiến độ thực tế qua endpoint PUT -> 200", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}/tasks/${taskId}`)
        .set("Cookie", authCookie)
        .send({
          name: "Công việc móng - Cập nhật",
          duration_days: 6,
          actual_start_date: "2026-10-02",
          actual_end_date: "2026-10-08",
          percent_complete: 80,
        });

      expect(res.status).toBe(200);
      expect(res.body.task.name).toBe("Công việc móng - Cập nhật");
      expect(res.body.task.duration_days).toBe(6);
      expect(res.body.task.percent_complete).toBe(80);
    });
  });
});
