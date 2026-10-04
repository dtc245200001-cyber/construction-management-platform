"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("POST, PUT, DELETE /api/projects/:projectId/tasks - Integration Tests (T-12)", () => {
  let projectId;
  let leafWorkItemId;
  let parentWorkItemId;
  let childWorkItemId;
  let authCookie;

  beforeAll(async () => {
    // 1. Dọn dẹp dữ liệu kiểm thử
    await pool.query(
      "TRUNCATE TABLE schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    // 2. Tạo User & Login lấy cookie
    const passwordHash = await argon2.hash("Password123!");
    const roleRes = await pool.query("SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1");
    const roleId = roleRes.rows.length > 0 ? roleRes.rows[0].id : 1;

    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Task PM User', 'taskpm@test.com', $1, $2, true, true)
       RETURNING id`,
      [passwordHash, roleId]
    );
    const userId = userRes.rows[0].id;

    // Login để lấy cookie session
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "taskpm@test.com", password: "Password123!" });
    authCookie = loginRes.headers["set-cookie"];

    // 3. Tạo dự án
    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Dự án Task T12 Test', 'PRJ-T12', '2026-10-01T00:00:00.000Z')
       RETURNING id`
    );
    projectId = projRes.rows[0].id;

    // Phân quyền PM cho user vào dự án
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'ban_quan_ly')`,
      [projectId, userId]
    );

    // 4. Tạo hạng mục lá (leaf)
    const leafRes = await pool.query(
      `INSERT INTO work_items (project_id, code, name, type)
       VALUES ($1, 'HM-LA', 'Hạng mục Lá Độc Lập', 'category')
       RETURNING id`,
      [projectId]
    );
    leafWorkItemId = leafRes.rows[0].id;

    // 5. Tạo hạng mục cha (parent) và hạng mục con (child)
    const parentRes = await pool.query(
      `INSERT INTO work_items (project_id, code, name, type)
       VALUES ($1, 'HM-CHA', 'Hạng mục Kết Cấu Thân', 'category')
       RETURNING id`,
      [projectId]
    );
    parentWorkItemId = parentRes.rows[0].id;

    const childRes = await pool.query(
      `INSERT INTO work_items (project_id, parent_id, code, name, type)
       VALUES ($1, $2, 'HM-CON', 'Hạng mục Cột Tầng 1', 'category')
       RETURNING id`,
      [projectId, parentWorkItemId]
    );
    childWorkItemId = childRes.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("POST /api/projects/:projectId/tasks", () => {
    test("Tạo task thành công cho hạng mục lá (leaf work item) -> 201", async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set("Cookie", authCookie)
        .send({
          work_item_id: leafWorkItemId,
          name: "Đào đất móng",
          duration_days: 4,
        });

      expect(res.status).toBe(201);
      expect(res.body.task).toBeDefined();
      expect(res.body.task.name).toBe("Đào đất móng");
      expect(res.body.task.duration_days).toBe(4);
      expect(res.body.task.work_item_id).toBe(leafWorkItemId);

      // Kiểm tra DB thật
      const dbCheck = await pool.query(
        "SELECT * FROM tasks WHERE id = $1",
        [res.body.task.id]
      );
      expect(dbCheck.rows).toHaveLength(1);
      expect(dbCheck.rows[0].name).toBe("Đào đất móng");
    });

    test("Từ chối khi duration_days <= 0 (nhập 0) -> 400", async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set("Cookie", authCookie)
        .send({
          work_item_id: leafWorkItemId,
          name: "Công việc 0 ngày",
          duration_days: 0,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/duration_days/i);
    });

    test("Từ chối khi duration_days là số âm (-2) -> 400", async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set("Cookie", authCookie)
        .send({
          work_item_id: leafWorkItemId,
          name: "Công việc âm ngày",
          duration_days: -2,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/duration_days/i);
    });

    test("Từ chối khi work_item đang có hạng mục con (NFR: không cho chọn hạng mục cha) -> 422 kèm tên hạng mục, không lộ ID", async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set("Cookie", authCookie)
        .send({
          work_item_id: parentWorkItemId,
          name: "Công việc gắn vào cha",
          duration_days: 3,
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toBeDefined();
      // Phải chứa tên hạng mục cha ("Hạng mục Kết Cấu Thân")
      expect(res.body.message).toContain("Hạng mục Kết Cấu Thân");
      // Không được chứa mã khóa chính dạng id số trần
      expect(res.body.message).not.toContain(`id: ${parentWorkItemId}`);
      expect(res.body.message).not.toContain(`ID ${parentWorkItemId}`);
    });

    test("Từ chối khi tên công việc rỗng -> 400", async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set("Cookie", authCookie)
        .send({
          work_item_id: leafWorkItemId,
          name: "   ",
          duration_days: 3,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/tên công việc/i);
    });
  });

  describe("PUT /api/projects/:projectId/tasks/:taskId", () => {
    let createdTaskId;

    beforeAll(async () => {
      const insRes = await pool.query(
        `INSERT INTO tasks (work_item_id, name, duration_days)
         VALUES ($1, 'Công việc cần sửa', 5)
         RETURNING id`,
        [leafWorkItemId]
      );
      createdTaskId = insRes.rows[0].id;
    });

    test("Cập nhật tên và thời lượng công việc thành công -> 200", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}/tasks/${createdTaskId}`)
        .set("Cookie", authCookie)
        .send({
          name: "Công việc đã đổi tên",
          duration_days: 7,
        });

      expect(res.status).toBe(200);
      expect(res.body.task.name).toBe("Công việc đã đổi tên");
      expect(res.body.task.duration_days).toBe(7);

      const dbCheck = await pool.query("SELECT * FROM tasks WHERE id = $1", [createdTaskId]);
      expect(dbCheck.rows[0].name).toBe("Công việc đã đổi tên");
      expect(dbCheck.rows[0].duration_days).toBe(7);
    });

    test("Từ chối PUT khi duration_days <= 0 -> 400", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}/tasks/${createdTaskId}`)
        .set("Cookie", authCookie)
        .send({
          duration_days: 0,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/duration_days/i);
    });
  });

  describe("DELETE /api/projects/:projectId/tasks/:taskId", () => {
    let taskToDeleteId;

    beforeAll(async () => {
      const insRes = await pool.query(
        `INSERT INTO tasks (work_item_id, name, duration_days)
         VALUES ($1, 'Công việc cần xóa', 2)
         RETURNING id`,
        [leafWorkItemId]
      );
      taskToDeleteId = insRes.rows[0].id;
    });

    test("Xóa task thành công và kiểm tra xóa khỏi DB -> 200", async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectId}/tasks/${taskToDeleteId}`)
        .set("Cookie", authCookie);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/xóa/i);

      const dbCheck = await pool.query("SELECT * FROM tasks WHERE id = $1", [taskToDeleteId]);
      expect(dbCheck.rows).toHaveLength(0);
    });
  });
});
