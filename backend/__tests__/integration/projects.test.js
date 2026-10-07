const request = require("supertest");
const { execFileSync } = require("child_process");
const path = require("path");
const app = require("../../app");
const pool = require("../../config/db");

const backendDir = path.join(__dirname, "../..");

function runMigration(direction) {
  execFileSync("npx", ["node-pg-migrate", direction, "-m", "migrations", "--no-check-order"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
    shell: true,
  });
}


describe("Projects Integration Tests", () => {
  let cookieAdmin, _cookieManager, cookieNormal;
  
  beforeAll(async () => {
    // Ensure latest migrations are applied
    runMigration("up");

    // Clear data
    await pool.query("TRUNCATE users, roles, projects, project_members, work_items RESTART IDENTITY CASCADE");

    // Insert Roles
    const { rows: roles } = await pool.query(
      "INSERT INTO roles (name) VALUES ('chu_dau_tu'), ('ban_quan_ly'), ('doi_truong') RETURNING id, name"
    );
    const roleChuDauTu = roles.find(r => r.name === 'chu_dau_tu').id;
    const _roleBanQuanLy = roles.find(r => r.name === 'ban_quan_ly').id; // chưa dùng, giữ để tham chiếu

    // Register Users
    await request(app).post("/api/auth/register").send({ name: "Admin", email: "admin@test.com", password: "Password123", confirmPassword: "Password123" });
    await request(app).post("/api/auth/register").send({ name: "Manager", email: "manager@test.com", password: "Password123", confirmPassword: "Password123" });
    await request(app).post("/api/auth/register").send({ name: "Normal", email: "normal@test.com", password: "Password123", confirmPassword: "Password123" });

    // Set Admin to is_system_admin
    await pool.query("UPDATE users SET is_system_admin = true WHERE email = 'admin@test.com'");

    // Login Users and get cookies
    const resA = await request(app).post("/api/auth/login").send({ email: "admin@test.com", password: "Password123" });
    cookieAdmin = resA.headers["set-cookie"];

    const resM = await request(app).post("/api/auth/login").send({ email: "manager@test.com", password: "Password123" });
    _cookieManager = resM.headers["set-cookie"];

    const resN = await request(app).post("/api/auth/login").send({ email: "normal@test.com", password: "Password123" });
    cookieNormal = resN.headers["set-cookie"];

    // Update roles
    const roleBanQuanLy = roles.find(r => r.name === 'ban_quan_ly').id;
    await pool.query("UPDATE users SET role_id = $1 WHERE email = 'normal@test.com'", [roleChuDauTu]);
    await pool.query("UPDATE users SET role_id = $1 WHERE email = 'manager@test.com'", [roleBanQuanLy]);
    
    // Re-login to update session role
    const resM2 = await request(app).post("/api/auth/login").send({ email: "manager@test.com", password: "Password123" });
    _cookieManager = resM2.headers["set-cookie"];

    const resN2 = await request(app).post("/api/auth/login").send({ email: "normal@test.com", password: "Password123" });
    cookieNormal = resN2.headers["set-cookie"];
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
  });

  describe("POST /api/projects", () => {
    it("Normal user cannot create project", async () => {
      const res = await request(app).post("/api/projects").set("Cookie", cookieNormal).send({
        name: "Normal Project"
      });
      expect(res.status).toBe(403);
    });

    it("System Admin can create project and auto-seeds default calendar", async () => {
      const res = await request(app).post("/api/projects").set("Cookie", cookieAdmin).send({
        name: "Admin Project",
        code: "APJ",
        location: "Hanoi"
      });
      expect(res.status).toBe(201);
      expect(res.body.project.name).toBe("Admin Project");

      const { rows: calendarRows } = await pool.query(
        `SELECT monday, tuesday, wednesday, thursday, friday, saturday, sunday
         FROM calendars
         WHERE project_id = $1`,
        [res.body.project.id]
      );

      expect(calendarRows).toHaveLength(1);
      expect(calendarRows[0]).toEqual({
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: true,
        sunday: false,
      });

      const { rows } = await pool.query("SELECT role FROM project_members WHERE project_id = $1", [res.body.project.id]);
      expect(rows[0].role).toBe("ban_quan_ly");
    });

    it("Enforces unique constraint on holidays (project_id, holiday_date)", async () => {
      // Get the admin project ID created previously
      const projRes = await pool.query("SELECT id FROM projects WHERE code = 'APJ'");
      const projectId = projRes.rows[0].id;

      // 1. Insert first holiday
      const h1 = await pool.query(
        "INSERT INTO holidays (project_id, holiday_date, name) VALUES ($1, $2, $3) RETURNING *",
        [projectId, "2026-05-01", "Labor Day"]
      );
      expect(h1.rows).toHaveLength(1);
      expect(h1.rows[0].name).toBe("Labor Day");

      // 2. Duplicate holiday on same project and same date must fail
      let duplicateError;
      try {
        await pool.query(
          "INSERT INTO holidays (project_id, holiday_date, name) VALUES ($1, $2, $3)",
          [projectId, "2026-05-01", "Duplicate Labor Day"]
        );
      } catch (err) {
        duplicateError = err;
      }
      expect(duplicateError).toBeDefined();
      expect(duplicateError.code).toBe("23505"); // PostgreSQL unique_violation code

      // 3. Same holiday date on a different project must succeed
      const otherProjRes = await pool.query(
        "INSERT INTO projects (name, code, status, actual_progress, planned_progress) VALUES ('Other P', 'OP1', 'Chuẩn bị', 0, 0) RETURNING id"
      );
      const otherProjectId = otherProjRes.rows[0].id;

      const hOther = await pool.query(
        "INSERT INTO holidays (project_id, holiday_date, name) VALUES ($1, $2, $3) RETURNING *",
        [otherProjectId, "2026-05-01", "Labor Day"]
      );
      expect(hOther.rows).toHaveLength(1);
    });

    it("Rollbacks transaction cleanly when project creation encounters an error", async () => {
      // Duplicate code will trigger error and rollback
      const duplicateRes = await request(app).post("/api/projects").set("Cookie", cookieAdmin).send({
        name: "Duplicate APJ Project",
        code: "APJ",
        location: "Danang"
      });
      expect(duplicateRes.status).toBe(400);

      // Verify no orphan project or calendar exists for the failed name
      const { rows: pRows } = await pool.query("SELECT id FROM projects WHERE name = 'Duplicate APJ Project'");
      expect(pRows).toHaveLength(0);
    });
  });

  describe("GET /api/projects", () => {
    it("Returns only projects user is member of", async () => {
      // Create another project directly
      const pRes = await pool.query("INSERT INTO projects (name, code, status, actual_progress, planned_progress) VALUES ('Other Project', 'OPJ', 'Chuẩn bị', 0, 0) RETURNING id");
      const pId = pRes.rows[0].id;

      // Add normal user to 'Other Project'
      const uRes = await pool.query("SELECT id FROM users WHERE email = 'normal@test.com'");
      await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ban_quan_ly')", [pId, uRes.rows[0].id]);

      // Admin fetches projects
      const resA = await request(app).get("/api/projects").set("Cookie", cookieAdmin);
      expect(resA.status).toBe(200);
      expect(resA.body.projects.length).toBe(1);
      expect(resA.body.projects[0].name).toBe("Admin Project");

      // Normal fetches projects
      const resN = await request(app).get("/api/projects").set("Cookie", cookieNormal);
      expect(resN.status).toBe(200);
      expect(resN.body.projects.length).toBe(1);
      expect(resN.body.projects[0].name).toBe("Other Project");
    });
  });
});
