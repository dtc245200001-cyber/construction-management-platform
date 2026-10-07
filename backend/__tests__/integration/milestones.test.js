"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Milestones Integration Tests", () => {
  let authCookieManager;
  let authCookieMember;
  let projectId;
  let workItemId;

  beforeAll(async () => {
    // Clean up
    await pool.query(
      "TRUNCATE TABLE milestones, schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    // Setup Roles if needed
    const roleResManager = await pool.query("SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1");
    const roleIdManager = roleResManager.rows.length > 0 ? roleResManager.rows[0].id : 1;
    
    const roleResEngineer = await pool.query("SELECT id FROM roles WHERE name = 'ky_su_giam_sat' LIMIT 1");
    const roleIdEngineer = roleResEngineer.rows.length > 0 ? roleResEngineer.rows[0].id : 2;

    const passwordHash = await argon2.hash("Password123!");

    // Create Manager User
    const userResManager = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Manager User', 'manager@test.com', $1, $2, true, true)
       RETURNING id`,
      [passwordHash, roleIdManager]
    );
    const userIdManager = userResManager.rows[0].id;

    // Create Engineer User
    const userResEngineer = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Engineer User', 'engineer@test.com', $1, $2, false, true)
       RETURNING id`,
      [passwordHash, roleIdEngineer]
    );
    const userIdEngineer = userResEngineer.rows[0].id;

    // Login to get cookies
    const loginResManager = await request(app).post("/api/auth/login").send({ email: "manager@test.com", password: "Password123!" });
    authCookieManager = loginResManager.headers["set-cookie"];

    const loginResEngineer = await request(app).post("/api/auth/login").send({ email: "engineer@test.com", password: "Password123!" });
    authCookieMember = loginResEngineer.headers["set-cookie"];

    // Create Project
    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ('Dự án Test Milestones', 'PRJ-M1', '2026-10-01T00:00:00.000Z')
       RETURNING id`
    );
    projectId = projRes.rows[0].id;

    // Assign members to project
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ban_quan_ly'), ($1, $3, 'ky_su_giam_sat')`,
      [projectId, userIdManager, userIdEngineer]
    );

    // Create a work_item for the project
    const workItemRes = await pool.query(
      "INSERT INTO work_items (project_id, code, name, type) VALUES ($1, 'WI-1', 'Test Work Item for Milestone', 'category') RETURNING id",
      [projectId]
    );
    workItemId = workItemRes.rows[0].id;
  });

  afterAll(async () => {
    // cleanup is done in beforeAll TRUNCATE
  });

  it("should create a milestone successfully with BAN_QUAN_LY role", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Cookie", authCookieManager)
      .send({ required_date: new Date().toISOString() });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.work_item_id).toBe(workItemId);
  });

  it("should deny milestone creation with KY_SU_GIAM_SAT role", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Cookie", authCookieMember)
      .send({ required_date: new Date().toISOString() });

    expect(res.status).toBe(403);
  });

  it("should enforce only one active milestone per work item", async () => {
    const date1 = new Date().toISOString();
    await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Cookie", authCookieManager)
      .send({ required_date: date1 });

    const date2 = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Cookie", authCookieManager)
      .send({ required_date: date2 });

    expect(res.status).toBe(201);
    
    // check db
    const activeRes = await pool.query(
      "SELECT count(*) FROM milestones WHERE work_item_id = $1 AND is_active = true",
      [workItemId]
    );
    expect(parseInt(activeRes.rows[0].count)).toBe(1);

    const allRes = await pool.query(
      "SELECT count(*) FROM milestones WHERE work_item_id = $1",
      [workItemId]
    );
    expect(parseInt(allRes.rows[0].count)).toBeGreaterThan(1);
  });

  it("should create a milestone successfully with CHU_DAU_TU role", async () => {
    // Setup CDT User
    const roleResCDT = await pool.query("SELECT id FROM roles WHERE name = 'chu_dau_tu' LIMIT 1");
    const roleIdCDT = roleResCDT.rows.length > 0 ? roleResCDT.rows[0].id : 3;
    const passwordHash = await argon2.hash("Password123!");
    
    const userResCDT = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('CDT User', 'cdt@test.com', $1, $2, false, true)
       RETURNING id`,
      [passwordHash, roleIdCDT]
    );
    const userIdCDT = userResCDT.rows[0].id;
    
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'chu_dau_tu')`,
      [projectId, userIdCDT]
    );

    const loginResCDT = await request(app).post("/api/auth/login").send({ email: "cdt@test.com", password: "Password123!" });
    const authCookieCDT = loginResCDT.headers["set-cookie"];

    const res = await request(app)
      .post(`/api/projects/${projectId}/work-items/${workItemId}/milestones`)
      .set("Cookie", authCookieCDT)
      .send({ required_date: new Date().toISOString() });

    expect(res.status).toBe(201);
  });

  it("should return the active milestones in GET", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/milestones`)
      .set("Cookie", authCookieManager);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ms = res.body.find(m => m.work_item_id === workItemId);
    expect(ms).toBeDefined();
  });
});
