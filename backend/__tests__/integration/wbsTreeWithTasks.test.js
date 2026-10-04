"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("GET /api/categories/:projectId/tree/all - Integration with Tasks", () => {
  let projectId;
  let workItemId;
  let taskId1;
  let taskId2;
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
       VALUES ('WBS PM User', 'wbspm@test.com', $1, $2, true, true)
       RETURNING id`,
      [passwordHash, roleId]
    );
    const userId = userRes.rows[0].id;

    // Login để lấy cookie session
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "wbspm@test.com", password: "Password123!" });
    authCookie = loginRes.headers["set-cookie"];

    // 3. Tạo dự án
    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Dự án WBS Test', 'PRJ-WBS-01', '2026-10-01T00:00:00.000Z')
       RETURNING id`
    );
    projectId = projRes.rows[0].id;

    // Phân quyền PM cho user vào dự án
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'ban_quan_ly')`,
      [projectId, userId]
    );

    // 4. Tạo 1 hạng mục lá (work_item)
    const wiRes = await pool.query(
      `INSERT INTO work_items (project_id, code, name, type)
       VALUES ($1, 'HM-MONG', 'Hạng mục Móng công trình', 'category')
       RETURNING id`,
      [projectId]
    );
    workItemId = wiRes.rows[0].id;

    // 5. Seed 2 công việc vào hạng mục này
    const t1Res = await pool.query(
      `INSERT INTO tasks (work_item_id, name, duration_days)
       VALUES ($1, 'Đào móng', 3)
       RETURNING id`,
      [workItemId]
    );
    taskId1 = t1Res.rows[0].id;

    const t2Res = await pool.query(
      `INSERT INTO tasks (work_item_id, name, duration_days)
       VALUES ($1, 'Ép cọc', 5)
       RETURNING id`,
      [workItemId]
    );
    taskId2 = t2Res.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  test("tree/all phải trả về đầy đủ cả work_items và các tasks con (type='task', parent_id=work_item_id, kèm duration_days)", async () => {
    const res = await request(app)
      .get(`/api/categories/${projectId}/tree/all`)
      .set("Cookie", authCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // 1. Phải có hạng mục móng
    const wiNode = res.body.find((item) => item.id === workItemId);
    expect(wiNode).toBeDefined();
    expect(wiNode.name).toBe("Hạng mục Móng công trình");

    // 2. Phải có 2 node công việc con (type = 'task')
    const taskNodes = res.body.filter((item) => item.type === "task");
    expect(taskNodes).toHaveLength(2);

    // Task 1: Đào móng
    const task1 = taskNodes.find((t) => t.name === "Đào móng");
    expect(task1).toBeDefined();
    expect(task1.parent_id).toBe(workItemId);
    expect(task1.duration_days).toBe(3);
    expect(task1.id).toBe(`task-${taskId1}`);

    // Task 2: Ép cọc
    const task2 = taskNodes.find((t) => t.name === "Ép cọc");
    expect(task2).toBeDefined();
    expect(task2.parent_id).toBe(workItemId);
    expect(task2.duration_days).toBe(5);
    expect(task2.id).toBe(`task-${taskId2}`);

    // 3. Tổng số item trong cây = 1 work_item + 2 tasks = 3 items
    expect(res.body).toHaveLength(3);
  });
});
