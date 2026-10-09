"use strict";

// S-26 / T-59 (bổ sung) — Integration tests cho
// GET /api/projects/:projectId/teams/all/tasks (xem việc của TẤT CẢ đội).

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Team overview API Integration Tests (S-26)", () => {
  let cookieCHT; // chi_huy_truong → được xem tất cả đội
  let cookieBQL; // ban_quan_ly → được xem tất cả đội
  let cookieDoiTruongA; // đội trưởng đội A → KHÔNG được xem route này
  let cookieNoProject;

  let projectId;
  let teamAId;
  let teamBId;
  let taskAId;
  let taskBId;

  const WEEK_START = "2026-09-14";
  const WEEK_END = "2026-09-20";
  const REPORT_DATE = "2026-09-16";

  beforeAll(async () => {
    await pool.query(`
      TRUNCATE TABLE task_quantity_reports, task_assignments,
        schedule_results, tasks, work_items, team_members, teams,
        project_members, projects, users
      RESTART IDENTITY CASCADE
    `);

    const requiredRoles = [
      "chi_huy_truong", "ban_quan_ly", "doi_truong", "chu_dau_tu",
    ];
    for (const r of requiredRoles) {
      await pool.query(
        "INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [r]
      );
    }
    const { rows: rolesRows } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => rolesRows.find((r) => r.name === name).id;

    const passwordHash = await argon2.hash("Password123!");

    const uCHT = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_verified) VALUES ('CHT', 'cht_ov@test.com', $1, $2, true) RETURNING id",
      [passwordHash, getRole("chi_huy_truong")]
    );
    const uBQL = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_verified) VALUES ('BQL', 'bql_ov@test.com', $1, $2, true) RETURNING id",
      [passwordHash, getRole("ban_quan_ly")]
    );
    const uDoiA = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_verified) VALUES ('DoiA', 'doia_ov@test.com', $1, $2, true) RETURNING id",
      [passwordHash, getRole("doi_truong")]
    );
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_verified) VALUES ('NoProject', 'noproject_ov@test.com', $1, $2, true)",
      [passwordHash, getRole("doi_truong")]
    );

    cookieCHT = (await request(app).post("/api/auth/login").send({ email: "cht_ov@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieBQL = (await request(app).post("/api/auth/login").send({ email: "bql_ov@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieDoiTruongA = (await request(app).post("/api/auth/login").send({ email: "doia_ov@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieNoProject = (await request(app).post("/api/auth/login").send({ email: "noproject_ov@test.com", password: "Password123!" })).headers["set-cookie"];

    const p = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Team Overview Project', 'TOP', '2026-01-01') RETURNING id"
    );
    projectId = p.rows[0].id;

    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES
        ($1, $2, 'chi_huy_truong'),
        ($1, $3, 'ban_quan_ly'),
        ($1, $4, 'doi_truong')`,
      [projectId, uCHT.rows[0].id, uBQL.rows[0].id, uDoiA.rows[0].id]
    );

    const tA = await pool.query(
      "INSERT INTO teams (project_id, name) VALUES ($1, 'Doi A') RETURNING id",
      [projectId]
    );
    teamAId = tA.rows[0].id;
    const tB = await pool.query(
      "INSERT INTO teams (project_id, name) VALUES ($1, 'Doi B') RETURNING id",
      [projectId]
    );
    teamBId = tB.rows[0].id;

    await pool.query(
      "INSERT INTO team_members (team_id, project_id, user_id) VALUES ($1, $2, $3)",
      [teamAId, projectId, uDoiA.rows[0].id]
    );

    const wi = await pool.query(
      "INSERT INTO work_items (project_id, name, code) VALUES ($1, 'WI Overview', 'WIO') RETURNING id",
      [projectId]
    );
    const workItemId = wi.rows[0].id;

    const taskA = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task Doi A', 3) RETURNING id",
      [workItemId]
    );
    taskAId = taskA.rows[0].id;
    const taskB = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task Doi B', 2) RETURNING id",
      [workItemId]
    );
    taskBId = taskB.rows[0].id;

    await pool.query(
      "INSERT INTO task_assignments (task_id, team_id) VALUES ($1, $2), ($3, $4)",
      [taskAId, teamAId, taskBId, teamBId]
    );

    // Task A nằm trên đường găng, task B không.
    await pool.query(
      `INSERT INTO schedule_results (task_id, early_start, early_finish, is_critical)
       VALUES
        ($1, '2026-09-15', '2026-09-17', true),
        ($2, '2026-09-16', '2026-09-18', false)`,
      [taskAId, taskBId]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("GET /:projectId/teams/all/tasks", () => {
    it("chi_huy_truong thấy việc của CẢ hai đội trong 1 lần gọi", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: REPORT_DATE })
        .set("Cookie", cookieCHT);

      expect(res.status).toBe(200);
      const teamNames = res.body.tasks.map((t) => t.team_name);
      expect(teamNames).toContain("Doi A");
      expect(teamNames).toContain("Doi B");
      expect(res.body.tasks).toHaveLength(2);
    });

    it("ban_quan_ly cũng xem được tất cả đội", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: REPORT_DATE })
        .set("Cookie", cookieBQL);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(2);
    });

    it("đánh dấu đúng việc nằm trên đường găng (is_critical)", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: REPORT_DATE })
        .set("Cookie", cookieCHT);

      const taskA = res.body.tasks.find((t) => t.task_id === taskAId);
      const taskB = res.body.tasks.find((t) => t.task_id === taskBId);
      expect(taskA.is_critical).toBe(true);
      expect(taskB.is_critical).toBe(false);
    });

    it("đội trưởng (doi_truong) KHÔNG được dùng route xem tất cả đội → 403", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: REPORT_DATE })
        .set("Cookie", cookieDoiTruongA);

      expect(res.status).toBe(403);
    });

    it("người ngoài dự án → 403", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: REPORT_DATE })
        .set("Cookie", cookieNoProject);

      expect(res.status).toBe(403);
    });

    it("chưa đăng nhập → 401", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: REPORT_DATE });

      expect(res.status).toBe(401);
    });

    it("thiếu week_start → 400", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_end: WEEK_END, report_date: REPORT_DATE })
        .set("Cookie", cookieCHT);

      expect(res.status).toBe(400);
    });

    it("week_start > week_end → 400", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_start: WEEK_END, week_end: WEEK_START, report_date: REPORT_DATE })
        .set("Cookie", cookieCHT);

      expect(res.status).toBe(400);
    });

    it("report_date ngoài tuần → 400", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: "2026-10-01" })
        .set("Cookie", cookieCHT);

      expect(res.status).toBe(400);
    });

    it("projectId không hợp lệ → 400", async () => {
      const res = await request(app)
        .get(`/api/projects/abc/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: REPORT_DATE })
        .set("Cookie", cookieCHT);

      expect(res.status).toBe(400);
    });

    it("không rò sang dự án khác (dự án không tồn tại) → 403/404", async () => {
      const res = await request(app)
        .get(`/api/projects/999999/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: REPORT_DATE })
        .set("Cookie", cookieCHT);

      expect([403, 404]).toContain(res.status);
    });
  });

  describe("Route /:projectId/teams/all/tasks không bị route /:teamId/tasks nuốt mất", () => {
    it("'all' không bị hiểu nhầm là một teamId", async () => {
      // Nếu thứ tự route bị sai, Express sẽ khớp vào
      // GET /:projectId/teams/:teamId/tasks với teamId="all" và
      // trả lỗi "ID dự án hoặc đội không hợp lệ" (400) khác hẳn
      // response của route đúng (có trường "tasks" dạng mảng).
      const res = await request(app)
        .get(`/api/projects/${projectId}/teams/all/tasks`)
        .query({ week_start: WEEK_START, week_end: WEEK_END, report_date: REPORT_DATE })
        .set("Cookie", cookieCHT);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.tasks)).toBe(true);
    });
  });
});
