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


describe("Dependencies Cycle Check Integration Tests (T-24)", () => {
  let cookieA, cookieB;
  let p1, p2;
  let itemA1, itemB1, itemC1, itemA2, itemD1, itemE1;
  let items = [];

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
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cat A1'), ($1, 'Cat B1'), ($1, 'Cat C1'), ($1, 'Cat D1'), ($1, 'Cat E1') RETURNING id",
      [p1]
    );

    const tRes1 = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'A1', 1), ($2, 'B1', 1), ($3, 'C1', 1), ($4, 'D1', 1), ($5, 'E1', 1) RETURNING id",
      [wRes1.rows[0].id, wRes1.rows[1].id, wRes1.rows[2].id, wRes1.rows[3].id, wRes1.rows[4].id]
    );
    itemA1 = tRes1.rows[0].id;
    itemB1 = tRes1.rows[1].id;
    itemC1 = tRes1.rows[2].id;
    itemD1 = tRes1.rows[3].id;
    itemE1 = tRes1.rows[4].id;
    items = [itemA1, itemB1, itemC1, itemD1, itemE1];

    const wRes2 = await pool.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cat A2') RETURNING id",
      [p2]
    );
    const tRes2 = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'A2', 1) RETURNING id",
      [wRes2.rows[0].id]
    );
    itemA2 = tRes2.rows[0].id;
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
  });

  afterEach(async () => {
    await pool.query("DELETE FROM dependencies");
  });

  async function getDepCount() {
    const res = await pool.query("SELECT count(*) FROM dependencies");
    return parseInt(res.rows[0].count);
  }

  it("1. Vòng 2 việc: 422 DEPENDENCY_CYCLE, cycleNames đúng thứ tự chờ", async () => {
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemB1 });
    const beforeCount = await getDepCount();
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemB1, successor_id: itemA1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DEPENDENCY_CYCLE");
    expect(res.body.cycleIds[0]).toBe(itemA1); // successorId (A1) -> predecessorId (B1)
    expect(res.body.cycleIds[1]).toBe(itemB1);
    expect(res.body.cycleSentence).toBe('Công việc "A1" chờ "B1", "B1" lại chờ "A1".');
    expect(await getDepCount()).toBe(beforeCount);
  });

  it("1. Vòng 3 việc: 422 DEPENDENCY_CYCLE, cycleNames đúng thứ tự", async () => {
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemB1 });
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemB1, successor_id: itemC1 });
    const beforeCount = await getDepCount();
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemC1, successor_id: itemA1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DEPENDENCY_CYCLE");
    expect(res.body.cycleSentence).toBe('Công việc "A1" chờ "C1", "C1" chờ "B1", "B1" lại chờ "A1".');
    expect(await getDepCount()).toBe(beforeCount);
  });

  it("1. Vòng 5 việc trung gian: 422 DEPENDENCY_CYCLE", async () => {
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemB1 });
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemB1, successor_id: itemC1 });
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemC1, successor_id: itemD1 });
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemD1, successor_id: itemE1 });
    const beforeCount = await getDepCount();
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemE1, successor_id: itemA1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DEPENDENCY_CYCLE");
    expect(res.body.cycleIds.length).toBe(5);
    expect(await getDepCount()).toBe(beforeCount);
  });

  it("2. Tự trỏ: 422, cycleNames có 1 phần tử", async () => {
    const beforeCount = await getDepCount();
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemA1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("DEPENDENCY_CYCLE");
    expect(res.body.cycleNames.length).toBe(1);
    expect(res.body.cycleSentence).toBe('Công việc "A1" không thể chờ chính nó.');
    expect(await getDepCount()).toBe(beforeCount);
  });

  it("3. Vòng cũ trong DB: 422 EXISTING_CYCLE; schedule-results -> 422 EXISTING_CYCLE", async () => {
    // Chèn thẳng SQL vào DB để tạo vòng cũ
    await pool.query("INSERT INTO dependencies (predecessor_id, successor_id) VALUES ($1, $2), ($2, $1)", [itemD1, itemE1]);
    
    // Khai quan hệ không liên quan
    const beforeCount = await getDepCount();
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemB1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("EXISTING_CYCLE");
    expect(await getDepCount()).toBe(beforeCount);

    // GET schedule-results
    const schRes = await request(app).get(`/api/projects/${p1}/schedule-results`).set("Cookie", cookieA);
    expect(schRes.status).toBe(422);
    expect(schRes.body.code).toBe("EXISTING_CYCLE");
    
    // Xóa vòng cũ
    await pool.query("DELETE FROM dependencies WHERE predecessor_id IN ($1, $2)", [itemD1, itemE1]);
    
    // Khai lại -> hợp lệ
    const res2 = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemB1 });
    expect(res2.status).toBe(201);
    
    const schRes2 = await request(app).get(`/api/projects/${p1}/schedule-results`).set("Cookie", cookieA);
    expect(schRes2.status).toBe(200);
  });

  it("4. TRÙNG CẶP: 409 và không thêm dòng", async () => {
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemB1 });
    const beforeCount = await getDepCount();
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemB1, dependency_type: "SS" });
    expect(res.status).toBe(409);
    expect(await getDepCount()).toBe(beforeCount);
  });

  it("5. Hợp lệ 4 loại FS, SS, FF, SF và lead_lag_days âm: 201 và có 1 dòng mới", async () => {
    const payloads = [
      { predecessor_id: itemA1, successor_id: itemB1, dependency_type: "FS", lead_lag_days: 2 },
      { predecessor_id: itemB1, successor_id: itemC1, dependency_type: "SS", lead_lag_days: -5 },
      { predecessor_id: itemC1, successor_id: itemD1, dependency_type: "FF", lead_lag_days: 0 },
      { predecessor_id: itemD1, successor_id: itemE1, dependency_type: "SF", lead_lag_days: "-1" }, // chuỗi
    ];
    let beforeCount = await getDepCount();
    for (const p of payloads) {
      const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send(p);
      expect(res.status).toBe(201);
      expect(await getDepCount()).toBe(beforeCount + 1);
      beforeCount++;
    }
  });

  it("6. Đầu vào sai: 400 (loại sai, lag boolean, thập phân, quá lớn, thiếu field)", async () => {
    const payloads = [
      { predecessor_id: itemA1, successor_id: itemB1, dependency_type: "XX" },
      { predecessor_id: itemA1, successor_id: itemB1, lead_lag_days: true },
      { predecessor_id: itemA1, successor_id: itemB1, lead_lag_days: 1.5 },
      { predecessor_id: itemA1, successor_id: itemB1, lead_lag_days: 4000 },
      { predecessor_id: itemA1, successor_id: itemB1, lead_lag_days: -4000 },
      { predecessor_id: itemA1, successor_id: itemB1, lead_lag_days: "" },
      { predecessor_id: itemA1 },
      "not_object"
    ];
    for (const p of payloads) {
      let body = p;
      if (p === "not_object") body = []; // Array is not valid body object
      const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send(body);
      expect(res.status).toBe(400);
    }
  });

  it("7. Chạy song song: 20 lần Promise.all kiểm chứng khoá giao dịch", async () => {
    for (let i = 0; i < 20; i++) {
      await pool.query("DELETE FROM dependencies");
      // Tạo A -> B
      await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemA1, successor_id: itemB1 });
      
      const beforeCount = await getDepCount();
      
      // Gửi đồng thời B -> C và C -> A
      const [res1, res2] = await Promise.all([
        request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemB1, successor_id: itemC1 }),
        request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({ predecessor_id: itemC1, successor_id: itemA1 })
      ]);
      
      // MỘT 201 và MỘT 422
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 422]);
      
      // Dependencies tăng đúng 1 dòng
      expect(await getDepCount()).toBe(beforeCount + 1);
      
      // Đồ thị cuối không có vòng
      const depsResult = await pool.query("SELECT predecessor_id, successor_id, dependency_type, lead_lag_days FROM dependencies");
      // build graph manually and check
      const nodes = {};
      const adjList = {};
      const inDegree = {};
      for (const t of [itemA1, itemB1, itemC1]) {
        nodes[t] = { id: t };
        adjList[t] = [];
        inDegree[t] = 0;
      }
      for (const row of depsResult.rows) {
        if (!nodes[row.predecessor_id] || !nodes[row.successor_id]) continue;
        adjList[row.predecessor_id].push({ target: row.successor_id });
        inDegree[row.successor_id]++;
      }
      // Kahn
      let queue = [];
      for (const id in inDegree) if (inDegree[id] === 0) queue.push(Number(id));
      const sorted = [];
      let head = 0;
      while (head < queue.length) {
        const u = queue[head++];
        sorted.push(u);
        for (const edge of adjList[u]) {
          inDegree[edge.target]--;
          if (inDegree[edge.target] === 0) queue.push(edge.target);
        }
      }
      expect(sorted.length).toBe(depsResult.rows.length + 1); // no cycle means all sorted (3 nodes if 2 edges, etc.)
    }
  });

  it("8. Hiệu năng: 500 việc, 2000 quan hệ < 500ms", async () => {
    // Generate 500 tasks
    await pool.query("DELETE FROM dependencies");
    await pool.query("DELETE FROM tasks WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1)", [p1]);
    await pool.query("DELETE FROM work_items WHERE project_id = $1", [p1]);
    
    // Create 500 items quickly
    const wItemsParams = [];
    for (let i = 0; i < 500; i++) wItemsParams.push(`(${p1}, 'Cat ${i}')`);
    await pool.query(`INSERT INTO work_items (project_id, name) VALUES ${wItemsParams.join(",")} RETURNING id`);
    const wIdsResult = await pool.query("SELECT id FROM work_items WHERE project_id = $1", [p1]);
    
    const tasksParams = [];
    for (let i = 0; i < 500; i++) tasksParams.push(`(${wIdsResult.rows[i].id}, 'Task ${i}', 1)`);
    await pool.query(`INSERT INTO tasks (work_item_id, name, duration_days) VALUES ${tasksParams.join(",")} RETURNING id`);
    const tIdsResult = await pool.query("SELECT tasks.id FROM tasks JOIN work_items w ON w.id = tasks.work_item_id WHERE w.project_id = $1 ORDER BY tasks.id", [p1]);
    const taskIds = tIdsResult.rows.map(r => r.id);

    // Create 2000 edges sequentially i -> i+1, etc. Just ensure no cycle.
    const edgeValues = [];
    let count = 0;
    for (let i = 0; i < 490 && count < 2000; i++) {
      for (let j = i + 1; j < 500 && count < 2000; j++) {
        if (Math.random() < 0.2) { // just skip some
          edgeValues.push(`(${taskIds[i]}, ${taskIds[j]})`);
          count++;
        }
      }
    }
    // ensure exactly 2000 if not enough
    for (let i = 0; i < 490 && count < 2000; i++) {
      for (let j = i + 1; j < 500 && count < 2000; j++) {
        edgeValues.push(`(${taskIds[i]}, ${taskIds[j]})`);
        count++;
      }
    }
    await pool.query(`INSERT INTO dependencies (predecessor_id, successor_id) VALUES ${edgeValues.slice(0, 2000).join(",")}`);

    // Add a new valid edge
    const start = Date.now();
    await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: taskIds[0],
      successor_id: taskIds[499] // Assuming no 0 -> 499 edge already, if there is it returns 409, which is fine to test time
    });
    const elapsed = Date.now() - start;
    console.log(`Hiệu năng tạo quan hệ (500 nút, 2000 cạnh): ${elapsed}ms`);
    expect(elapsed).toBeLessThan(500); // Phải dưới 500ms
  });

  it("e. Hai công việc khác dự án bị từ chối (400)", async () => {
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieA).send({
      predecessor_id: items[0], // belongs to P1
      successor_id: itemA2,     // belongs to P2
    });
    expect(res.status).toBe(400);
  });

  it("f. Quyền: người không thuộc dự án bị từ chối (403)", async () => {
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).set("Cookie", cookieB).send({ // user B has no access to P1, wait, A is in P1 and B is in P2
      predecessor_id: items[0],
      successor_id: items[1],
    });
    expect(res.status).toBe(403);
  });
  
  it("f. Quyền: chưa đăng nhập thì 401", async () => {
    const res = await request(app).post(`/api/projects/${p1}/dependencies`).send({
      predecessor_id: items[0],
      successor_id: items[1],
    });
    expect(res.status).toBe(401);
  });
});
