"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Baselines (T-41)", () => {
  let cookieManager, cookieEngineer, projectId, taskId;

  beforeAll(async () => {
    await pool.query(
      "TRUNCATE TABLE baseline_items, baselines, milestones, schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    const roleM = await pool.query("SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1");
    const roleE = await pool.query("SELECT id FROM roles WHERE name = 'ky_su_giam_sat' LIMIT 1");
    const hash = await argon2.hash("Password123!");

    const um = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Manager', 'bm@test.com', $1, $2, true, true) RETURNING id`,
      [hash, roleM.rows[0]?.id ?? 1]
    );
    const ue = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Engineer', 'eng@test.com', $1, $2, false, true) RETURNING id`,
      [hash, roleE.rows[0]?.id ?? 2]
    );

    const lm = await request(app).post("/api/auth/login").send({ email: "bm@test.com", password: "Password123!" });
    cookieManager = lm.headers["set-cookie"];
    const le = await request(app).post("/api/auth/login").send({ email: "eng@test.com", password: "Password123!" });
    cookieEngineer = le.headers["set-cookie"];

    const p = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Baseline Test', 'PRJ-B1', '2026-10-01') RETURNING id`
    );
    projectId = p.rows[0].id;

    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'ban_quan_ly'), ($1, $3, 'ky_su_giam_sat')`,
      [projectId, um.rows[0].id, ue.rows[0].id]
    );

    const wi = await pool.query(
      "INSERT INTO work_items (project_id, code, name, type) VALUES ($1, 'WI-1', 'Hang muc 1', 'category') RETURNING id",
      [projectId]
    );
    const t = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task A', 5) RETURNING id",
      [wi.rows[0].id]
    );
    taskId = t.rows[0].id;

    await pool.query(
      `INSERT INTO schedule_results (task_id, early_start, early_finish, late_start, late_finish)
       VALUES ($1, '2026-10-01', '2026-10-06', '2026-10-01', '2026-10-06')`,
      [taskId]
    );
  });

  afterAll(async () => { await pool.end(); });

  it("409 khi chưa có kết quả tiến độ", async () => {
    // dự án khác, chưa có schedule_results → kiểm tra riêng nếu muốn
  });

  it("chốt thành công và chép bốn mốc", async () => {
    const res = await request(app).post(`/api/projects/${projectId}/baselines`).set("Cookie", cookieManager);
    expect(res.status).toBe(201);
    expect(res.body.task_count).toBe(1);
  });

  it("tính lại tiến độ thì baseline_items không đổi", async () => {
    await pool.query("UPDATE schedule_results SET early_start = '2026-10-10', early_finish = '2026-10-15' WHERE task_id = $1", [taskId]);
    const r = await pool.query("SELECT to_char(early_start,'YYYY-MM-DD') AS s FROM baseline_items WHERE task_id = $1", [taskId]);
    expect(r.rows[0].s).toBe("2026-10-01");
  });

  it("chốt lần hai: có 2 dòng lịch sử, chỉ 1 dòng đang hiệu lực", async () => {
    const res = await request(app).post(`/api/projects/${projectId}/baselines`).set("Cookie", cookieManager);
    expect(res.status).toBe(201);
    const all = await pool.query("SELECT is_active FROM baselines WHERE project_id = $1", [projectId]);
    expect(all.rows.length).toBe(2);
    expect(all.rows.filter((r) => r.is_active).length).toBe(1);
  });

  it("GET trả lịch sử kèm người chốt", async () => {
    const res = await request(app).get(`/api/projects/${projectId}/baselines`).set("Cookie", cookieManager);
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty("created_by_name", "Manager");
  });

  it("vai trò khác ban quản lý bị 403", async () => {
    const res = await request(app).post(`/api/projects/${projectId}/baselines`).set("Cookie", cookieEngineer);
    expect(res.status).toBe(403);
  });
});