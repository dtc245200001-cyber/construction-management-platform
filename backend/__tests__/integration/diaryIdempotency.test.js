"use strict";

// T-70 (S-30): idempotency backend bằng INSERT trực tiếp + bắt lỗi UNIQUE
// violation 23505 của Postgres. Test bắt buộc là race ĐỒNG THỜI (test tuần tự
// cũ trong diary.test.js không bắt được race SELECT-rồi-INSERT).

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Diary Idempotency Race Tests (T-70 / S-30)", () => {
  let cookieKySu;
  let projectAId;
  let projectAWorkItemId;
  let taskId;

  beforeAll(async () => {
    await pool.query(
      "TRUNCATE TABLE diary_entries, task_attachments, task_logs, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    for (const r of ["ky_su_giam_sat", "ban_quan_ly"]) {
      await pool.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }
    const { rows: roles } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => roles.find((r) => r.name === name).id;

    const passwordHash = await argon2.hash("Password123!");
    const userKySu = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Ky Su Idem', 'kysu_idem@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ky_su_giam_sat")]
    );

    cookieKySu = (
      await request(app).post("/api/auth/login").send({ email: "kysu_idem@test.com", password: "Password123!" })
    ).headers["set-cookie"];

    const pA = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Project Idem A', 'PIA', '2026-01-01') RETURNING id"
    );
    projectAId = pA.rows[0].id;
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ky_su_giam_sat')", [
      projectAId,
      userKySu.rows[0].id,
    ]);

    const wiA = await pool.query("INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'WorkItem Idem', 'WII', 'category') RETURNING id", [
      projectAId,
    ]);
    projectAWorkItemId = wiA.rows[0].id;

    const tA = await pool.query("INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task Idem', 3) RETURNING id", [
      projectAWorkItemId,
    ]);
    taskId = tA.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("constraint diary_entries_client_id_idx tồn tại và chặn trùng ở tầng DB", async () => {
    const { rows } = await pool.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'diary_entries' AND indexname = 'diary_entries_client_id_idx'"
    );
    expect(rows).toHaveLength(1);

    const clientId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
    await pool.query(
      "INSERT INTO diary_entries (project_id, work_item_id, content, created_by, client_id) VALUES ($1, $2, 'x', (SELECT id FROM users LIMIT 1), $3)",
      [projectAId, projectAWorkItemId, clientId]
    );
    let err;
    try {
      await pool.query(
        "INSERT INTO diary_entries (project_id, work_item_id, content, created_by, client_id) VALUES ($1, $2, 'y', (SELECT id FROM users LIMIT 1), $3)",
        [projectAId, projectAWorkItemId, clientId]
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.code).toBe("23505");
    expect(err.constraint).toBe("diary_entries_client_id_idx");
  });

  it("POST đồng thời cùng client_id: một 201 một 200, cùng id, chỉ 1 dòng", async () => {
    const clientId = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
    const payload = {
      work_item_id: projectAWorkItemId,
      content: "Race entry",
      client_id: clientId,
    };
    const post = () =>
      request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu).send(payload);

    const [res1, res2] = await Promise.all([post(), post()]);
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 201]);

    const created = res1.status === 201 ? res1.body : res2.body;
    const retried = res1.status === 200 ? res1.body : res2.body;
    expect(retried.id).toBe(created.id);
    expect(retried.content).toBe("Race entry");

    const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM diary_entries WHERE client_id = $1", [clientId]);
    expect(rows[0].c).toBe(1);
  });

  it("validate 400 kèm errors chi tiết: client_id sai định dạng, entry_at tương lai", async () => {
    const badUuid = await request(app)
      .post(`/api/projects/${projectAId}/diary-entries`)
      .set("Cookie", cookieKySu)
      .send({ work_item_id: projectAWorkItemId, content: "x", client_id: "not-a-uuid" });
    expect(badUuid.status).toBe(400);
    expect(badUuid.body.errors).toContain("client_id must be a valid UUID");

    const future = await request(app)
      .post(`/api/projects/${projectAId}/diary-entries`)
      .set("Cookie", cookieKySu)
      .send({
        work_item_id: projectAWorkItemId,
        content: "x",
        entry_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
    expect(future.status).toBe(400);
    expect(future.body.errors).toContain("entry_at cannot be more than 10 minutes in the future");
  });

  it("task-log POST đồng thời cùng client_id: chỉ 1 dòng, cùng shape log", async () => {
    const clientId = "cccccccc-3333-4333-8333-cccccccccccc";
    const post = () =>
      request(app)
        .post(`/api/projects/${projectAId}/tasks/${taskId}/logs`)
        .set("Cookie", cookieKySu)
        .field("content", "Race task log")
        .field("client_id", clientId);

    const [res1, res2] = await Promise.all([post(), post()]);
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 201]);

    const created = res1.status === 201 ? res1.body.log : res2.body.log;
    const retried = res1.status === 200 ? res1.body.log : res2.body.log;
    expect(retried.id).toBe(created.id);
    expect(Array.isArray(retried.attachments)).toBe(true);

    const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM task_logs WHERE client_id = $1", [clientId]);
    expect(rows[0].c).toBe(1);
  });
});
