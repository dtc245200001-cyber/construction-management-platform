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

describe("Dependencies Cycle Check Integration Tests", () => {
  let cookieA, cookieB;
  let p1, p2;
  let itemA1, itemB1, itemC1, itemA2;

  beforeAll(async () => {
    runMigration("up");
    
    // Clear data
    await pool.query("TRUNCATE users, roles, projects, project_members, work_items, tasks, dependencies RESTART IDENTITY CASCADE");

    // Insert Roles
    const { rows: roles } = await pool.query(
      "INSERT INTO roles (name) VALUES ('chu_dau_tu'), ('ban_quan_ly'), ('doi_truong') RETURNING id, name"
    );
    const roleId = roles.find(r => r.name === 'ban_quan_ly').id;

    // Register Users A and B
    await request(app).post("/api/auth/register").send({ name: "A", email: "a@a.com", password: "Password123", confirmPassword: "Password123" });
    await request(app).post("/api/auth/register").send({ name: "B", email: "b@b.com", password: "Password123", confirmPassword: "Password123" });

    // Update role manually
    await pool.query("UPDATE users SET role_id = $1", [roleId]);

    // Login Users and get cookies
    const resA = await request(app).post("/api/auth/login").send({ email: "a@a.com", password: "Password123" });
    cookieA = resA.headers["set-cookie"];

    const resB = await request(app).post("/api/auth/login").send({ email: "b@b.com", password: "Password123" });
    cookieB = resB.headers["set-cookie"];

    const uRes = await pool.query("SELECT id, email FROM users ORDER BY email");
    const uA = uRes.rows[0].id;
    const uB = uRes.rows[1].id;

    // Insert Projects
    const pRes = await pool.query("INSERT INTO projects (name, status, actual_progress, planned_progress) VALUES ('Project 1', 'Chuẩn bị', 0, 0), ('Project 2', 'Chuẩn bị', 0, 0) RETURNING id");
    p1 = pRes.rows[0].id;
    p2 = pRes.rows[1].id;

    // Project Members: A -> P1, B -> P2
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ban_quan_ly'), ($3, $4, 'ban_quan_ly')",
      [p1, uA, p2, uB]
    );

    // Insert Work Items
    const wRes1 = await pool.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cat A1'), ($1, 'Cat B1'), ($1, 'Cat C1') RETURNING id",
      [p1]
    );
    const wItemA1 = wRes1.rows[0].id;
    const wItemB1 = wRes1.rows[1].id;
    const wItemC1 = wRes1.rows[2].id;

    const tRes1 = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'A1', 1), ($2, 'B1', 1), ($3, 'C1', 1) RETURNING id",
      [wItemA1, wItemB1, wItemC1]
    );
    itemA1 = tRes1.rows[0].id;
    itemB1 = tRes1.rows[1].id;
    itemC1 = tRes1.rows[2].id;

    const wRes2 = await pool.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cat A2') RETURNING id",
      [p2]
    );
    const wItemA2 = wRes2.rows[0].id;

    const tRes2 = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'A2', 1) RETURNING id",
      [wItemA2]
    );
    itemA2 = tRes2.rows[0].id;
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
  });

  afterEach(async () => {
    await pool.query("DELETE FROM dependencies");
  });

  it("Tạo quan hệ A -> B thành công (201)", async () => {
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: itemA1,
      successor_id: itemB1,
      dependency_type: "FS"
    });
    expect(res.status).toBe(201);
  });

  it("Tạo vòng lặp B -> A thất bại (422), không đổi số lượng dependencies", async () => {
    // Tạo A -> B
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: itemA1,
      successor_id: itemB1,
      dependency_type: "FS"
    });

    const beforeCount = await pool.query("SELECT count(*) FROM dependencies");

    // Cố tạo B -> A
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: itemB1,
      successor_id: itemA1,
      dependency_type: "FS"
    });
    
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DEPENDENCY_CYCLE");
    expect(res.body.cycleIds.length).toBeGreaterThan(0);

    const afterCount = await pool.query("SELECT count(*) FROM dependencies");
    expect(afterCount.rows[0].count).toBe(beforeCount.rows[0].count);
  });

  it("Tạo trùng quan hệ A -> B lần hai thất bại (409)", async () => {
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: itemA1,
      successor_id: itemB1,
      dependency_type: "FS"
    });

    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: itemA1,
      successor_id: itemB1,
      dependency_type: "SS"
    });
    expect(res.status).toBe(409);
  });

  it("Tạo vòng 3 nút A -> B, B -> C, C -> A thất bại (422) với chuỗi đúng", async () => {
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemB1 });
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemB1, successor_id: itemC1 });

    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: itemC1,
      successor_id: itemA1,
    });
    
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DEPENDENCY_CYCLE");
    expect(res.body.cycleIds.length).toBe(3);
    
    // Khai báo C -> A. Việc đang khai là successor = A1. 
    // Chuỗi chờ: A1 chờ C1, C1 chờ B1, B1 chờ A1.
    expect(res.body.cyclePath).toBe("A1 → C1 → B1 → A1");
  });

  it("Tạo vòng 3 nút với thứ tự ID lộn xộn vẫn bắt đầu từ việc đang khai", async () => {
    // Tạo 3 việc mới không theo thứ tự A, B, C để ID lộn xộn
    const wRes = await pool.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cat Random') RETURNING id",
      [p1]
    );
    const wId = wRes.rows[0].id;

    const tRes = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'N3', 1), ($1, 'N1', 1), ($1, 'N2', 1) RETURNING id",
      [wId]
    );
    const id3 = tRes.rows[0].id; // N3
    const id1 = tRes.rows[1].id; // N1
    const id2 = tRes.rows[2].id; // N2

    // Tạo N1 -> N2, N2 -> N3
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: id1, successor_id: id2 });
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: id2, successor_id: id3 });

    // Khai báo N3 -> N1. Successor là N1.
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: id3,
      successor_id: id1,
    });
    
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DEPENDENCY_CYCLE");
    expect(res.body.cycleIds.length).toBe(3);
    
    // N1 chờ N3, N3 chờ N2, N2 chờ N1.
    expect(res.body.cyclePath).toBe("N1 → N3 → N2 → N1");
  });

  it("Việc thuộc dự án khác bị từ chối (400)", async () => {
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: itemA1,
      successor_id: itemA2, // belongs to P2
    });
    expect(res.status).toBe(400);
  });

  it("Người không thuộc dự án bị từ chối (403)", async () => {
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieB).send({
      predecessor_id: itemA1,
      successor_id: itemB1,
    });
    expect(res.status).toBe(403);
  });

  it("Tự phụ thuộc (predecessor_id = successor_id) trả về 422 không phải 500", async () => {
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: itemA1,
      successor_id: itemA1,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DEPENDENCY_CYCLE");
  });
});
