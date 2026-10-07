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
    expect(res.body.message).toBe(
      "Không thể tạo quan hệ vì sẽ tạo vòng phụ thuộc: " +
      "A1 chờ C1, C1 chờ B1, B1 chờ A1."
    );
    expect(res.body.cyclePath).toBe("A1 → C1 → B1 → A1");
    expect(res.body.cycleNames).toEqual(["A1", "C1", "B1", "A1"]);
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
  it("a) Vòng cũ V1<->V2 có sẵn trong DB; khai quan hệ hợp lệ V3->V4 qua API: kỳ vọng 201", async () => {
    // Tạo V1, V2, V3, V4
    const res = await pool.query(`
      INSERT INTO work_items (project_id, name) VALUES ($1, 'V1'), ($1, 'V2'), ($1, 'V3'), ($1, 'V4') RETURNING id
    `, [p1]);
    const w1 = res.rows[0].id, w2 = res.rows[1].id, w3 = res.rows[2].id, w4 = res.rows[3].id;
    const tRes = await pool.query(`
      INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'V1', 1), ($2, 'V2', 1), ($3, 'V3', 1), ($4, 'V4', 1) RETURNING id
    `, [w1, w2, w3, w4]);
    const v1 = tRes.rows[0].id, v2 = tRes.rows[1].id, v3 = tRes.rows[2].id, v4 = tRes.rows[3].id;

    // Gieo vòng cũ
    await pool.query("INSERT INTO dependencies (predecessor_id, successor_id) VALUES ($1, $2), ($2, $1)", [v1, v2]);

    const beforeCount = await pool.query("SELECT count(*) FROM dependencies");

    // Khai V3 -> V4
    const apiRes = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: v3,
      successor_id: v4,
    });
    
    expect(apiRes.status).toBe(201);
    const afterCount = await pool.query("SELECT count(*) FROM dependencies");
    expect(Number(afterCount.rows[0].count)).toBe(Number(beforeCount.rows[0].count) + 1);
  });

  it("b) Vòng cũ V1<->V2 có sẵn; đã có 3->4 và 4->5; khai quan hệ 5->3: kỳ vọng 422", async () => {
    // Tạo V1, V2, V3, V4, V5
    const res = await pool.query(`
      INSERT INTO work_items (project_id, name) VALUES ($1, 'V1'), ($1, 'V2'), ($1, 'V3'), ($1, 'V4'), ($1, 'V5') RETURNING id
    `, [p1]);
    const w1 = res.rows[0].id, w2 = res.rows[1].id, w3 = res.rows[2].id, w4 = res.rows[3].id, w5 = res.rows[4].id;
    const tRes = await pool.query(`
      INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'V1', 1), ($2, 'V2', 1), ($3, 'V3', 1), ($4, 'V4', 1), ($5, 'V5', 1) RETURNING id
    `, [w1, w2, w3, w4, w5]);
    const v1 = tRes.rows[0].id, v2 = tRes.rows[1].id, v3 = tRes.rows[2].id, v4 = tRes.rows[3].id, v5 = tRes.rows[4].id;

    // Gieo vòng cũ và 3->4, 4->5
    await pool.query("INSERT INTO dependencies (predecessor_id, successor_id) VALUES ($1, $2), ($2, $1), ($3, $4), ($4, $5)", [v1, v2, v3, v4, v5]);

    const beforeCount = await pool.query("SELECT count(*) FROM dependencies");

    // Khai 5->3
    const apiRes = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: v5,
      successor_id: v3,
    });
    
    expect(apiRes.status).toBe(422);
    expect(apiRes.body.code).toBe("DEPENDENCY_CYCLE");
    expect(apiRes.body.cycleIds).toEqual([v3, v5, v4]);
    expect(apiRes.body.cyclePath).toBe("V3 → V5 → V4 → V3");
    
    const afterCount = await pool.query("SELECT count(*) FROM dependencies");
    expect(Number(afterCount.rows[0].count)).toBe(Number(beforeCount.rows[0].count));
  });

  it("c) Không có vòng cũ; chuỗi 5 việc N1->N2->N3->N4->N5 đã lưu; khai N5->N1: kỳ vọng 422", async () => {
    const res = await pool.query(`
      INSERT INTO work_items (project_id, name) VALUES ($1, 'N1'), ($1, 'N2'), ($1, 'N3'), ($1, 'N4'), ($1, 'N5') RETURNING id
    `, [p1]);
    const w = res.rows.map(r => r.id);
    const tRes = await pool.query(`
      INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'N1', 1), ($2, 'N2', 1), ($3, 'N3', 1), ($4, 'N4', 1), ($5, 'N5', 1) RETURNING id
    `, w);
    const n = tRes.rows.map(r => r.id);

    await pool.query("INSERT INTO dependencies (predecessor_id, successor_id) VALUES ($1, $2), ($2, $3), ($3, $4), ($4, $5)", [n[0], n[1], n[2], n[3], n[4]]);

    const beforeCount = await pool.query("SELECT count(*) FROM dependencies");

    const apiRes = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: n[4],
      successor_id: n[0],
    });
    
    expect(apiRes.status).toBe(422);
    expect(apiRes.body.code).toBe("DEPENDENCY_CYCLE");
    expect(apiRes.body.cyclePath).toBe("N1 → N5 → N4 → N3 → N2 → N1");
    
    const afterCount = await pool.query("SELECT count(*) FROM dependencies");
    expect(Number(afterCount.rows[0].count)).toBe(Number(beforeCount.rows[0].count));
  });
});
