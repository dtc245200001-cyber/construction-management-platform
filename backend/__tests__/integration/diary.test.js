"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Diary API Integration Tests", () => {
  let cookieAdmin;
  let cookieKySu;
  let cookieChuDauTu;
  let cookieKeToan;
  let cookieNoProject;

  let projectAId;
  let projectBId;
  let projectAWorkItemId;
  let projectBWorkItemId;

  beforeAll(async () => {
    await pool.query("TRUNCATE TABLE diary_entries, milestones, schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE");

    const requiredRoles = ['ky_su_giam_sat', 'chu_dau_tu', 'ke_toan', 'ban_quan_ly'];
    for (const r of requiredRoles) {
      await pool.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }
    const { rows: roles } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => roles.find(r => r.name === name).id;
    const roleKySu = getRole('ky_su_giam_sat');
    const roleChuDauTu = getRole('chu_dau_tu');
    const roleKeToan = getRole('ke_toan');
    const roleAdmin = getRole('ban_quan_ly');

    const passwordHash = await argon2.hash("Password123!");

    // Create users
    const userAdmin = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Admin', 'admin@test.com', $1, $2, true, true) RETURNING id", [passwordHash, roleAdmin]);
    const userKySu = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Ky Su', 'kysu@test.com', $1, $2, false, true) RETURNING id", [passwordHash, roleKySu]);
    const userChuDauTu = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Chu Dau Tu', 'chudautu@test.com', $1, $2, false, true) RETURNING id", [passwordHash, roleChuDauTu]);
    const userKeToan = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Ke Toan', 'ketoan@test.com', $1, $2, false, true) RETURNING id", [passwordHash, roleKeToan]);
    const userNoProject = await pool.query("INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('No Project', 'noproject@test.com', $1, $2, false, true) RETURNING id", [passwordHash, roleKySu]);

    // Login
    cookieAdmin = (await request(app).post("/api/auth/login").send({ email: "admin@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieKySu = (await request(app).post("/api/auth/login").send({ email: "kysu@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieChuDauTu = (await request(app).post("/api/auth/login").send({ email: "chudautu@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieKeToan = (await request(app).post("/api/auth/login").send({ email: "ketoan@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieNoProject = (await request(app).post("/api/auth/login").send({ email: "noproject@test.com", password: "Password123!" })).headers["set-cookie"];

    // Project A
    const pA = await pool.query("INSERT INTO projects (name, code, start_date) VALUES ('Project A', 'PA', '2026-01-01') RETURNING id");
    projectAId = pA.rows[0].id;
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ky_su_giam_sat'), ($1, $3, 'chu_dau_tu'), ($1, $4, 'ban_quan_ly')", [projectAId, userKySu.rows[0].id, userChuDauTu.rows[0].id, userAdmin.rows[0].id]);

    // Project B
    const pB = await pool.query("INSERT INTO projects (name, code, start_date) VALUES ('Project B', 'PB', '2026-01-01') RETURNING id");
    projectBId = pB.rows[0].id;
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ke_toan')", [projectBId, userKeToan.rows[0].id]);

    // Work Items
    const wiA = await pool.query("INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'WorkItem A', 'WIA', 'category') RETURNING id", [projectAId]);
    projectAWorkItemId = wiA.rows[0].id;

    const wiB = await pool.query("INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'WorkItem B', 'WIB', 'category') RETURNING id", [projectBId]);
    projectBWorkItemId = wiB.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("1. Xác thực/Quyền", () => {
    it("chưa đăng nhập thì 401", async () => {
      const res = await request(app).post(`/api/projects/${projectAId}/diary-entries`);
      expect(res.status).toBe(401);
    });

    it("không phải thành viên dự án thì 403 (POST)", async () => {
      const res = await request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieNoProject).send({ work_item_id: projectAWorkItemId, content: "Test" });
      expect(res.status).toBe(403);
    });

    it("không phải thành viên dự án thì 403 (GET)", async () => {
      const res = await request(app).get(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieNoProject);
      expect(res.status).toBe(403);
    });

    it("chu_dau_tu POST thì 403, GET thì 200", async () => {
      const resPost = await request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieChuDauTu).send({ work_item_id: projectAWorkItemId, content: "Test" });
      expect(resPost.status).toBe(403);

      const resGet = await request(app).get(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieChuDauTu);
      expect(resGet.status).toBe(200);
    });
  });

  describe("2 & 3. Hợp lệ và Từ chối", () => {
    it("thiếu work_item_id thì 400", async () => {
      const res = await request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu).send({ content: "Test" });
      expect(res.status).toBe(400);
    });

    it("thiếu content hoặc rỗng thì 400", async () => {
      const res = await request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu).send({ work_item_id: projectAWorkItemId, content: "   " });
      expect(res.status).toBe(400);
    });

    it("hạng mục dự án B gửi vào dự án A thì 422", async () => {
      const res = await request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu).send({ work_item_id: projectBWorkItemId, content: "Test" });
      expect(res.status).toBe(422);
    });

    it("tạo mục thành công 201 và kiểm tra created_by", async () => {
      const res = await request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu).send({ work_item_id: projectAWorkItemId, content: "Test diary entry", created_by: 9999 });
      expect(res.status).toBe(201);
      expect(res.body.content).toBe("Test diary entry");
      expect(res.body.created_by).not.toBe(9999);
      expect(res.body.work_item_name).toBe("WorkItem A");
    });
  });

  describe("4. Cô lập dữ liệu", () => {
    it("user chỉ thuộc dự án B gọi GET dự án A thì 403", async () => {
      const res = await request(app).get(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKeToan);
      expect(res.status).toBe(403);
    });

    it("GET dự án A không bao giờ trả mục của B", async () => {
      const resGet = await request(app).get(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu);
      expect(resGet.status).toBe(200);
      resGet.body.data.forEach(item => {
        expect(item.project_id).toBe(projectAId);
        expect(item.work_item_id).toBe(projectAWorkItemId);
      });
    });
  });

  describe("6. Ngày theo múi giờ Việt Nam", () => {
    it("2026-10-01T23:30:00Z có entry_date là 2026-10-02", async () => {
      const res = await request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu).send({ work_item_id: projectAWorkItemId, content: "TZ Test", entry_at: "2026-10-01T23:30:00Z" });
      expect(res.status).toBe(201);
      
      const resDate = new Date(res.body.entry_date).toISOString().split('T')[0];
      expect(resDate).toBe("2026-10-02");

      const getRes1 = await request(app).get(`/api/projects/${projectAId}/diary-entries?date=2026-10-02`).set("Cookie", cookieKySu);
      expect(getRes1.body.data.find(d => d.id === res.body.id)).toBeDefined();

      const getRes2 = await request(app).get(`/api/projects/${projectAId}/diary-entries?date=2026-10-01`).set("Cookie", cookieKySu);
      expect(getRes2.body.data.find(d => d.id === res.body.id)).toBeUndefined();
    });
  });

  describe("5. Lọc", () => {
    it("lọc sai ngày hoặc from > to thì 400", async () => {
      const res1 = await request(app).get(`/api/projects/${projectAId}/diary-entries?date=2026-02-30`).set("Cookie", cookieKySu);
      expect(res1.status).toBe(400);

      const res2 = await request(app).get(`/api/projects/${projectAId}/diary-entries?from=2026-10-10&to=2026-10-05`).set("Cookie", cookieKySu);
      expect(res2.status).toBe(400);
    });

    it("phân trang đúng", async () => {
      const getRes = await request(app).get(`/api/projects/${projectAId}/diary-entries?limit=1&offset=0`).set("Cookie", cookieKySu);
      expect(getRes.status).toBe(200);
      expect(getRes.body.limit).toBe(1);
      expect(getRes.body.data.length).toBeLessThanOrEqual(1);
    });
  });

  describe("7. Chống trùng", () => {
    it("gửi hai lần cùng client_id thì trả về cùng 1 dòng", async () => {
      const clientId = "123e4567-e89b-12d3-a456-426614174000";
      const res1 = await request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu).send({ work_item_id: projectAWorkItemId, content: "Idempotent 1", client_id: clientId });
      expect(res1.status).toBe(201);

      const res2 = await request(app).post(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu).send({ work_item_id: projectAWorkItemId, content: "Idempotent 2", client_id: clientId });
      expect(res2.status).toBe(200);
      expect(res2.body.id).toBe(res1.body.id);
      expect(res2.body.content).toBe("Idempotent 1");
    });
  });

  describe("8 & 9. Ràng buộc DB và Xóa", () => {
    it("DB tự chặn lệch dự án (test SQL injection)", async () => {
      let err;
      try {
        await pool.query(`INSERT INTO diary_entries (project_id, work_item_id, content, created_by) VALUES ($1, $2, 'test', (SELECT id FROM users LIMIT 1))`, [projectAId, projectBWorkItemId]);
      } catch (e) {
        err = e;
      }
      expect(err.code).toBe("23503");
    });

    it("xóa hạng mục đã có nhật ký thì 409", async () => {
      const res = await request(app).delete(`/api/categories/${projectAId}/${projectAWorkItemId}`).set("Cookie", cookieAdmin);
      expect(res.status).toBe(409);
      expect(res.body.message).toContain("Hạng mục đã có nhật ký, không thể xóa");
    });

    it("xóa dự án có nhật ký thì thành công", async () => {
      const res = await request(app).delete(`/api/projects/${projectAId}`).set("Cookie", cookieAdmin);
      expect(res.status).toBe(200);
      
      const check = await pool.query(`SELECT id FROM diary_entries WHERE project_id = $1`, [projectAId]);
      expect(check.rows.length).toBe(0);
    });
  });
});
