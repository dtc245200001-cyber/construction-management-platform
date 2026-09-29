const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");

describe("Projects Integration Tests", () => {
  let cookieManager, cookieNormal;
  
  beforeAll(async () => {
    // Clear data
    await pool.query("TRUNCATE users, roles, projects, project_members, work_items RESTART IDENTITY CASCADE");

    // Insert Roles
    const { rows: roles } = await pool.query(
      "INSERT INTO roles (name) VALUES ('chu_dau_tu'), ('ban_quan_ly') RETURNING id, name"
    );
    const roleChuDauTu = roles.find(r => r.name === 'chu_dau_tu').id;
    const roleBanQuanLy = roles.find(r => r.name === 'ban_quan_ly').id;

    // Register Users
    await request(app).post("/api/auth/register").send({ name: "Manager", email: "manager@test.com", password: "Password123", confirmPassword: "Password123" });
    await request(app).post("/api/auth/register").send({ name: "Normal", email: "normal@test.com", password: "Password123", confirmPassword: "Password123" });

    // Login Users and get cookies
    const resM = await request(app).post("/api/auth/login").send({ email: "manager@test.com", password: "Password123" });
    cookieManager = resM.headers["set-cookie"];

    const resN = await request(app).post("/api/auth/login").send({ email: "normal@test.com", password: "Password123" });
    cookieNormal = resN.headers["set-cookie"];

    // Update roles
    await pool.query("UPDATE users SET role_id = $1 WHERE email = 'normal@test.com'", [roleChuDauTu]);
    // manager@test.com is already ban_quan_ly by default
    
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

    it("Manager can create project", async () => {
      const res = await request(app).post("/api/projects").set("Cookie", cookieManager).send({
        name: "Manager Project",
        location: "Hanoi"
      });
      expect(res.status).toBe(201);
      expect(res.body.project.name).toBe("Manager Project");
      
      const { rows } = await pool.query("SELECT role FROM project_members WHERE project_id = $1", [res.body.project.id]);
      expect(rows[0].role).toBe("OWNER");
    });
  });

  describe("GET /api/projects", () => {
    it("Returns only projects user is member of", async () => {
      // Create another project directly
      const pRes = await pool.query("INSERT INTO projects (name) VALUES ('Other Project') RETURNING id");
      const pId = pRes.rows[0].id;

      // Add normal user to 'Other Project'
      const uRes = await pool.query("SELECT id FROM users WHERE email = 'normal@test.com'");
      await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'MEMBER')", [pId, uRes.rows[0].id]);

      // Manager fetches projects
      const resM = await request(app).get("/api/projects").set("Cookie", cookieManager);
      expect(resM.status).toBe(200);
      expect(resM.body.projects.length).toBe(1);
      expect(resM.body.projects[0].name).toBe("Manager Project");

      // Normal fetches projects
      const resN = await request(app).get("/api/projects").set("Cookie", cookieNormal);
      expect(resN.status).toBe(200);
      expect(resN.body.projects.length).toBe(1);
      expect(resN.body.projects[0].name).toBe("Other Project");
    });
  });
});
