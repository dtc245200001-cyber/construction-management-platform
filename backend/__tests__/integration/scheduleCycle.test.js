const request = require("supertest");
const { execFileSync } = require("child_process");
const path = require("path");
const app = require("../../app");
const pool = require("../../config/db");

const backendDir = path.join(__dirname, "../..");

function runMigration(direction) {
  execFileSync("npx", ["node-pg-migrate", direction, "-m", "migrations", "--no-check-order"], {
    cwd: backendDir, env: process.env, stdio: "pipe", shell: true,
  });
}

describe("T-25: tính tiến độ khi dữ liệu cũ có vòng", () => {
  let cookie, projectId, a, b, c;

  beforeAll(async () => {
    runMigration("up");
    await pool.query("TRUNCATE users, roles, projects, project_members, work_items, tasks, dependencies RESTART IDENTITY CASCADE");

    const { rows: roles } = await pool.query(
      "INSERT INTO roles (name) VALUES ('chu_dau_tu'), ('ban_quan_ly'), ('doi_truong') RETURNING id, name"
    );
    const roleId = roles.find((r) => r.name === "ban_quan_ly").id;

    await request(app).post("/api/auth/register").send({ name: "A", email: "a@a.com", password: "Password123", confirmPassword: "Password123" });
    await pool.query("UPDATE users SET role_id = $1", [roleId]);
    const login = await request(app).post("/api/auth/login").send({ email: "a@a.com", password: "Password123" });
    cookie = login.headers["set-cookie"];
    const { rows: [u] } = await pool.query("SELECT id FROM users");

    const { rows: [p] } = await pool.query(
      "INSERT INTO projects (name, status, actual_progress, planned_progress, start_date) VALUES ('P', 'Chuẩn bị', 0, 0, '2026-01-05') RETURNING id"
    );
    projectId = p.id;
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ban_quan_ly')",
      [projectId, u.id]
    );

    const { rows: [w] } = await pool.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cat') RETURNING id", [projectId]
    );
    const { rows: t } = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1,'A1',1),($1,'B1',1),($1,'C1',1) RETURNING id",
      [w.id]
    );
    [a, b, c] = t.map((r) => r.id);

    // Chèn vòng THẲNG vào DB (bỏ qua API) để giả lập dữ liệu cũ: A->B, B->C, C->A
    await pool.query(
      `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days)
       VALUES ($1,$2,'FS',0), ($2,$3,'FS',0), ($3,$1,'FS',0)`,
      [a, b, c]
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
  });

  it("recalculate trả 422 kèm tên việc, không có mã số", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/schedule/recalculate`)
      .set("Cookie", cookie);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DEPENDENCY_CYCLE");
    expect(res.body.message).toContain("A1 chờ C1");
    expect(res.body.message).toContain("C1 chờ B1");
    expect(res.body.message).toContain("B1 chờ A1");
    expect(res.body.message).not.toMatch(/#\d+/);
    expect(res.body.cycleNames).toEqual(expect.arrayContaining(["A1", "B1", "C1"]));
    expect(res.body.cyclePath).toMatch(/^(.+) → .+ → .+ → \1$/);
    expect(res.body.cycleNames).toHaveLength(4); // 3 việc + 1 phần tử đóng vòng
  });
});