"use strict";

const path = require("path");
const request = require("supertest");
const argon2 = require("argon2");
const app = require("../../app");
const pool = require("../../config/db");
const runner = require("node-pg-migrate").default || require("node-pg-migrate");

describe("T-119: API tạo, xem, cập nhật phiên bản dự toán và cộng tổng theo cây (S-46)", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    "postgres://postgres:khanhhoa123!@localhost:5432/construction_db_test";

  let bqlCookie;
  let bqlUserId;
  let keToanCookie;
  let doiTruongCookie;
  let outsiderCookie;

  let testProjectId;
  let parentWorkItemId;
  let leafWorkItemId1;
  let leafWorkItemId2;

  const projectCode = `PRJ-T119-${Date.now()}`;

  beforeAll(async () => {
    // 1. Chạy migration up
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "../../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      checkOrder: false,
      log: () => {},
    });

    // 2. Tạo hoặc lấy roles
    const rolesRes = await pool.query(
      "SELECT id, name FROM roles WHERE name IN ('ban_quan_ly', 'ke_toan', 'doi_truong')"
    );
    const roleMap = new Map(rolesRes.rows.map((r) => [r.name, r.id]));
    const bqlRoleId = roleMap.get("ban_quan_ly") || 1;
    const keToanRoleId = roleMap.get("ke_toan") || 6;
    const doiTruongRoleId = roleMap.get("doi_truong") || 4;

    const passHash = await argon2.hash("Password123!");

    // Helper tạo và login user (dùng passHash đã tính trước để test chạy nhanh)
    async function createUserAndLogin(name, email, roleId) {
      const uRes = await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
         VALUES ($1, $2, $3, $4, false, true)
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name, email, passHash, roleId]
      );
      const userId = uRes.rows[0].id;

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email,
          password: "Password123!",
        });

      return {
        userId,
        cookie: loginRes.headers["set-cookie"],
      };
    }

    const bqlUser = await createUserAndLogin(
      "BQL T119",
      `bql_t119_${Date.now()}@test.com`,
      bqlRoleId
    );
    bqlUserId = bqlUser.userId;
    bqlCookie = bqlUser.cookie;

    const keToanUser = await createUserAndLogin(
      "Ke Toan T119",
      `ketoan_t119_${Date.now()}@test.com`,
      keToanRoleId
    );
    keToanCookie = keToanUser.cookie;

    const doiTruongUser = await createUserAndLogin(
      "Doi Truong T119",
      `doitruong_t119_${Date.now()}@test.com`,
      doiTruongRoleId
    );
    doiTruongCookie = doiTruongUser.cookie;

    const outsiderUser = await createUserAndLogin(
      "Outsider T119",
      `outsider_t119_${Date.now()}@test.com`,
      bqlRoleId
    );
    outsiderCookie = outsiderUser.cookie;

    // 3. Tạo dự án kiểm thử
    const projRes = await pool.query(`
      INSERT INTO projects (name, code, start_date)
      VALUES ('Dự án Kiểm thử T-119', $1, '2026-10-01')
      RETURNING id
    `, [projectCode]);
    testProjectId = projRes.rows[0].id;

    // 4. Gán project members (cột role là string)
    await pool.query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES
        ($1, $2, 'ban_quan_ly'),
        ($1, $3, 'ke_toan'),
        ($1, $4, 'doi_truong')
    `, [
      testProjectId,
      bqlUserId,
      keToanUser.userId,
      doiTruongUser.userId,
    ]);

    // 5. Tạo cây WBS: Cha (Phần móng) -> 2 Con lá (Bê tông, Cốt thép)
    const parentRes = await pool.query(`
      INSERT INTO work_items (project_id, name, code)
      VALUES ($1, 'Phần móng công trình', 'HM-01')
      RETURNING id
    `, [testProjectId]);
    parentWorkItemId = parentRes.rows[0].id;

    const leaf1Res = await pool.query(`
      INSERT INTO work_items (project_id, parent_id, name, code)
      VALUES ($1, $2, 'Đổ bê tông móng', 'HM-01.01')
      RETURNING id
    `, [testProjectId, parentWorkItemId]);
    leafWorkItemId1 = leaf1Res.rows[0].id;

    const leaf2Res = await pool.query(`
      INSERT INTO work_items (project_id, parent_id, name, code)
      VALUES ($1, $2, 'Gia công cốt thép móng', 'HM-01.02')
      RETURNING id
    `, [testProjectId, parentWorkItemId]);
    leafWorkItemId2 = leaf2Res.rows[0].id;
  });

  afterAll(async () => {
    if (testProjectId) {
      await pool.query("DELETE FROM actual_costs WHERE project_id = $1", [testProjectId]).catch(() => {});
      await pool.query("DELETE FROM budget_versions WHERE project_id = $1", [testProjectId]).catch(() => {});
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [testProjectId]).catch(() => {});
      await pool.query("DELETE FROM project_members WHERE project_id = $1", [testProjectId]).catch(() => {});
      await pool.query("DELETE FROM projects WHERE id = $1", [testProjectId]).catch(() => {});
    }
  });

  describe("1. Kiểm tra phân quyền truy cập (Project Access & Role Permissions)", () => {
    it("Từ chối khi chưa đăng nhập (401)", async () => {
      const res = await request(app).get(`/api/projects/${testProjectId}/budgets`);
      expect(res.status).toBe(401);
    });

    it("Từ chối khi người dùng không thuộc dự án (403)", async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", outsiderCookie);
      expect(res.status).toBe(403);
    });

    it("Đội trưởng không có quyền nhập/cập nhật dự toán (403)", async () => {
      const res = await request(app)
        .post(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", doiTruongCookie)
        .send({
          description: "Dự toán từ đội trưởng",
          items: [{ work_item_id: leafWorkItemId1, amount: 50000000 }],
        });
      expect(res.status).toBe(403);
    });

    it("Kế toán có quyền xem dự toán (200)", async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", keToanCookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("versions");
      expect(res.body.has_actual_costs).toBe(false);
    });
  });

  describe("2. Chặn nhập trực tiếp ở hạng mục cha (Leaf-only Guard)", () => {
    it("Từ chối 422 khi cố gắng nhập dự toán cho hạng mục cha", async () => {
      const res = await request(app)
        .post(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", bqlCookie)
        .send({
          description: "Cố tình nhập vào cha",
          items: [
            { work_item_id: parentWorkItemId, amount: 200000000 },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/Chỉ được nhập dự toán cho hạng mục lá/);
    });
  });

  describe("3. Tạo phiên bản dự toán ban đầu và tính tổng đệ quy theo cây (Rollup)", () => {
    it("Ban quản lý tạo phiên bản dự toán v1 cho các hạng mục lá thành công (201)", async () => {
      const res = await request(app)
        .post(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", bqlCookie)
        .send({
          description: "Dự toán ban đầu duyệt lần 1",
          items: [
            { work_item_id: leafWorkItemId1, amount: 120000000.00, note: "Dự toán bê tông" },
            { work_item_id: leafWorkItemId2, amount: 80000000.00, note: "Dự toán thép" },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.version.version_number).toBe(1);
      expect(res.body.project_total).toBe("200000000.00");
    });

    it("GET /budgets/tree: Tổng cha bằng tổng các lá con cháu, cha không có amount trực tiếp", async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjectId}/budgets/tree`)
        .set("Cookie", bqlCookie);

      expect(res.status).toBe(200);
      expect(res.body.version.version_number).toBe(1);
      expect(res.body.project_total).toBe("200000000.00");

      const items = res.body.items;
      const parent = items.find((i) => i.id === parentWorkItemId);
      const leaf1 = items.find((i) => i.id === leafWorkItemId1);
      const leaf2 = items.find((i) => i.id === leafWorkItemId2);

      // Node cha: không có amount trực tiếp (null), nhưng total_budget bằng tổng 2 lá
      expect(parent.is_leaf).toBe(false);
      expect(parent.amount).toBeNull();
      expect(parent.total_budget).toBe("200000000.00");

      // Node lá 1 & 2: có amount và total_budget đúng
      expect(leaf1.is_leaf).toBe(true);
      expect(leaf1.amount).toBe("120000000.00");
      expect(leaf1.total_budget).toBe("120000000.00");

      expect(leaf2.is_leaf).toBe(true);
      expect(leaf2.amount).toBe("80000000.00");
      expect(leaf2.total_budget).toBe("80000000.00");
    });
  });

  describe("4. Thay đổi sau khi có thực chi bắt buộc tạo phiên bản mới (Bảo lưu lịch sử)", () => {
    it("Ghi nhận chi phí thực tế vào actual_costs (S-47)", async () => {
      await pool.query(`
        INSERT INTO actual_costs (project_id, work_item_id, amount, description, expense_date, created_by)
        VALUES ($1, $2, 45000000.00, 'Thanh toán tiền mua bê tông đợt 1', '2026-10-15', $3)
      `, [testProjectId, leafWorkItemId1, bqlUserId]);

      // Kiểm tra has_actual_costs giờ là true
      const resVersions = await request(app)
        .get(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", bqlCookie);

      expect(resVersions.body.has_actual_costs).toBe(true);
    });

    it("Khi đã có thực chi, lưu dự toán điều chỉnh BẮT BUỘC tự động tạo phiên bản mới v2", async () => {
      const res = await request(app)
        .post(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", bqlCookie)
        .send({
          description: "Điều chỉnh dự toán sau khi phát sinh chi phí thực tế",
          items: [
            { work_item_id: leafWorkItemId1, amount: 150000000.00, note: "Tăng dự toán bê tông" },
            { work_item_id: leafWorkItemId2, amount: 80000000.00, note: "Giữ nguyên thép" },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.version.version_number).toBe(2);
      expect(res.body.is_new_version).toBe(true);
      expect(res.body.project_total).toBe("230000000.00");
    });

    it("Phiên bản cũ v1 vẫn xem lại được đầy đủ (không bị ghi đè mất lịch sử)", async () => {
      const resV1 = await request(app)
        .get(`/api/projects/${testProjectId}/budgets/tree?version=1`)
        .set("Cookie", bqlCookie);

      expect(resV1.status).toBe(200);
      expect(resV1.body.version.version_number).toBe(1);
      expect(resV1.body.project_total).toBe("200000000.00");

      const itemsV1 = resV1.body.items;
      const leaf1V1 = itemsV1.find((i) => i.id === leafWorkItemId1);
      expect(leaf1V1.amount).toBe("120000000.00");
    });

    it("Phiên bản mới v2 hiển thị đúng số liệu mới cập nhật", async () => {
      const resV2 = await request(app)
        .get(`/api/projects/${testProjectId}/budgets/tree?version=2`)
        .set("Cookie", bqlCookie);

      expect(resV2.status).toBe(200);
      expect(resV2.body.version.version_number).toBe(2);
      expect(resV2.body.project_total).toBe("230000000.00");

      const itemsV2 = resV2.body.items;
      const parentV2 = itemsV2.find((i) => i.id === parentWorkItemId);
      const leaf1V2 = itemsV2.find((i) => i.id === leafWorkItemId1);

      expect(parentV2.total_budget).toBe("230000000.00");
      expect(leaf1V2.amount).toBe("150000000.00");
    });
  });
});
