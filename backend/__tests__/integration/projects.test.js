const request = require("supertest");
const { execFileSync } = require("child_process");
const path = require("path");
const app = require("../../app");
const pool = require("../../config/db");

const backendDir = path.join(__dirname, "../..");

function runMigration(direction) {
  execFileSync("npx", ["node-pg-migrate", direction, "-m", "migrations"], {
    cwd: backendDir,
    env: process.env,
    stdio: "pipe",
    shell: true,
  });
}


describe("Projects Integration Tests", () => {
  let cookieAdmin, cookieManager, cookieNormal;
  
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
    cookieManager = resM.headers["set-cookie"];

    const resN = await request(app).post("/api/auth/login").send({ email: "normal@test.com", password: "Password123" });
    cookieNormal = resN.headers["set-cookie"];

    // Update roles
    const roleBanQuanLy = roles.find(r => r.name === 'ban_quan_ly').id;
    await pool.query("UPDATE users SET role_id = $1 WHERE email = 'normal@test.com'", [roleChuDauTu]);
    await pool.query("UPDATE users SET role_id = $1 WHERE email = 'manager@test.com'", [roleBanQuanLy]);
    
    // Re-login to update session role
    const resM2 = await request(app).post("/api/auth/login").send({ email: "manager@test.com", password: "Password123" });
    cookieManager = resM2.headers["set-cookie"];

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

    it("System Admin can create project", async () => {
      const res = await request(app).post("/api/projects").set("Cookie", cookieAdmin).send({
        name: "Admin Project",
        code: "APJ",
        location: "Hanoi"
      });
      expect(res.status).toBe(201);
      expect(res.body.project.name).toBe("Admin Project");
      
      const { rows } = await pool.query("SELECT role FROM project_members WHERE project_id = $1", [res.body.project.id]);
      expect(rows[0].role).toBe("ban_quan_ly");
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
