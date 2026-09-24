const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");

describe("Categories & Projects Integration Tests", () => {
  let uA, uB, p1, p2;

  beforeAll(async () => {
    // Clear data
    await pool.query("TRUNCATE users, roles, projects, project_members, work_items RESTART IDENTITY CASCADE");

    // Insert Roles
    const { rows: roles } = await pool.query(
      "INSERT INTO roles (name) VALUES ('chu_dau_tu'), ('ban_quan_ly') RETURNING id, name"
    );
    const roleId = roles[0].id;

    // Insert Users
    const uRes = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id) VALUES ('User A', 'a@a.com', '123', $1), ('User B', 'b@b.com', '123', $1) RETURNING id",
      [roleId]
    );
    uA = uRes.rows[0].id;
    uB = uRes.rows[1].id;

    // Insert Projects
    const pRes = await pool.query(
      "INSERT INTO projects (name) VALUES ('Project 1'), ('Project 2') RETURNING id"
    );
    p1 = pRes.rows[0].id;
    p2 = pRes.rows[1].id;

    // Project Members: A -> P1, B -> P2
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'member'), ($3, $4, 'member')",
      [p1, uA, p2, uB]
    );

    // Mock the session logic by bypassing auth middleware to inject user
    // Since we are testing projectAccess, we need req.user
    jest.spyOn(app, "use"); // Can't easily mock middleware on exported app here if it's already bound.
  });

  afterAll(async () => {
    await pool.end();
  });

  let cookieA, cookieB;

  beforeAll(async () => {
    // Clear data
    await pool.query("TRUNCATE users, roles, projects, project_members, work_items RESTART IDENTITY CASCADE");

    // Insert Roles
    const { rows: roles } = await pool.query(
      "INSERT INTO roles (name) VALUES ('chu_dau_tu'), ('ban_quan_ly') RETURNING id, name"
    );
    const roleId = roles[0].id;

    // Register Users A and B
    await request(app).post("/api/auth/register").send({ name: "A", email: "a@a.com", password: "Password123", confirmPassword: "Password123" });
    await request(app).post("/api/auth/register").send({ name: "B", email: "b@b.com", password: "Password123", confirmPassword: "Password123" });

    // Login Users and get cookies
    const resA = await request(app).post("/api/auth/login").send({ email: "a@a.com", password: "Password123" });
    cookieA = resA.headers["set-cookie"];

    const resB = await request(app).post("/api/auth/login").send({ email: "b@b.com", password: "Password123" });
    cookieB = resB.headers["set-cookie"];

    const uRes = await pool.query("SELECT id, email FROM users ORDER BY email");
    uA = uRes.rows[0].id;
    uB = uRes.rows[1].id;

    // Update role manually (since register uses default role)
    await pool.query("UPDATE users SET role_id = $1", [roleId]);

    // Insert Projects
    const pRes = await pool.query("INSERT INTO projects (name) VALUES ('Project 1'), ('Project 2') RETURNING id");
    p1 = pRes.rows[0].id;
    p2 = pRes.rows[1].id;

    // Project Members: A -> P1, B -> P2
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'manager'), ($3, $4, 'manager')",
      [p1, uA, p2, uB]
    );
  });

  afterAll(async () => {
    await pool.end().catch(() => {});
  });

  describe("B11, B12. Categories & Projects RBAC", () => {
    it("B12. User B không thuộc Project 1 -> 403 (Đọc danh sách categories)", async () => {
      const res = await request(app).get(`/api/categories/${p1}/tree/all`).set("Cookie", cookieB);
      expect(res.status).toBe(403);
    });

    it("B11. Category isolation: User A không sửa/xóa được hạng mục dự án B", async () => {
      // B tạo hạng mục ở P2
      const resCreate = await request(app).post(`/api/categories/${p2}`).set("Cookie", cookieB).send({ name: "Cat B" });
      const catId = resCreate.body.id;

      // A cố gắng xóa hạng mục này (sẽ bị block từ middleware 403 vì A gọi vào route của P2)
      const resDel = await request(app).delete(`/api/categories/${p2}/${catId}`).set("Cookie", cookieA);
      expect(resDel.status).toBe(403);
    });

    it("B11. parent_id thuộc dự án khác -> 400 và không có bản ghi mới", async () => {
      // B tạo hạng mục ở P2
      const resCreateB = await request(app).post(`/api/categories/${p2}`).set("Cookie", cookieB).send({ name: "Root B" });
      const parentBId = resCreateB.body.id;

      // A cố tạo hạng mục ở P1 nhưng dùng parent_id của P2
      const resCreateA = await request(app).post(`/api/categories/${p1}`).set("Cookie", cookieA).send({
        name: "Child A", parent_id: parentBId
      });
      expect(resCreateA.status).toBe(400);
      expect(resCreateA.body.message).toMatch(/không thuộc dự án/);

      // Check DB
      const { rows } = await pool.query("SELECT * FROM work_items WHERE name = 'Child A'");
      expect(rows.length).toBe(0); // Không có bản ghi mới
    });

    it("B11. id không phải số -> 400, tên 300 ký tự -> 400", async () => {
      const res1 = await request(app).post(`/api/categories/${p1}`).set("Cookie", cookieA).send({ name: "A".repeat(300) });
      expect(res1.status).toBe(400);
      
      const res2 = await request(app).get(`/api/categories/abc/tree/all`).set("Cookie", cookieA);
      expect(res2.status).toBe(400); // projectId validator
    });

    it("B11. tree/all chỉ trả hạng mục của đúng dự án", async () => {
      // A tạo 2 hạng mục ở P1
      await request(app).post(`/api/categories/${p1}`).set("Cookie", cookieA).send({ name: "A1" });
      await request(app).post(`/api/categories/${p1}`).set("Cookie", cookieA).send({ name: "A2" });

      const res = await request(app).get(`/api/categories/${p1}/tree/all`).set("Cookie", cookieA);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      // Project ID is implicit in the response as the API scopes the query
    });
  });
});
