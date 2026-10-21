"use strict";

const path = require("path");
const request = require("supertest");
const argon2 = require("argon2");
const app = require("../../app");
const pool = require("../../config/db");
const runner = require("node-pg-migrate").default || require("node-pg-migrate");

describe("S-04 / T-XX: Phân quyền tạo dự án (project.create) và ghi log kiểm toán trung tâm", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    "postgres://postgres:postgres123@localhost:5433/construction_db_test";

  let passHash;
  let sysAdminCookie;
  let bqlCookie;
  let bqlUserId;
  let cdtCookie;
  let chtCookie;
  let ksgsCookie;
  let dtCookie;
  let ktCookie;
  let khachCookie;
  let baseProjectId;

  async function loginUser(email, password = "Password123!") {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password });
    return res.headers["set-cookie"];
  }

  beforeAll(async () => {
    // 1. Chạy migration
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "../../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      checkOrder: false,
      log: () => {},
    });

    passHash = await argon2.hash("Password123!");

    // Tạo roles nếu chưa có
    await pool.query(`
      INSERT INTO roles (id, name, description)
      VALUES 
        (1, 'ban_quan_ly', 'Ban quản lý'),
        (2, 'chi_huy_truong', 'Chỉ huy trưởng'),
        (3, 'ky_su_giam_sat', 'Kỹ sư giám sát'),
        (4, 'doi_truong', 'Đội trưởng'),
        (5, 'chu_dau_tu', 'Chủ đầu tư'),
        (6, 'ke_toan', 'Kế toán'),
        (7, 'khach', 'Khách')
      ON CONFLICT (name) DO NOTHING;
    `);

    // Helper tạo user
    async function createTestUser(name, email, roleName, isSysAdmin = false, isVerified = true, lockedUntil = null) {
      const roleRes = await pool.query("SELECT id FROM roles WHERE name = $1", [roleName]);
      const roleId = roleRes.rows[0]?.id || 7;
      const res = await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified, locked_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (lower(email)) DO UPDATE 
         SET name = EXCLUDED.name, is_system_admin = EXCLUDED.is_system_admin,
             is_verified = EXCLUDED.is_verified, locked_until = EXCLUDED.locked_until
         RETURNING id, email`,
        [name, email, passHash, roleId, isSysAdmin, isVerified, lockedUntil]
      );
      return res.rows[0];
    }

    // 1. System Admin
    await createTestUser("Sys Admin", "sysadmin_s04@test.com", "ban_quan_ly", true, true);
    sysAdminCookie = await loginUser("sysadmin_s04@test.com");

    // 2. Base project ban đầu
    const pRes = await pool.query(
      `INSERT INTO projects (name, code, status)
       VALUES ('Dự án nền S04', 'PRJ-BASE-S04-${Date.now()}', 'Chuẩn bị')
       RETURNING id`
    );
    baseProjectId = pRes.rows[0].id;

    // 3. User Ban quản lý (được gắn vào base project)
    const bqlUser = await createTestUser("BQL User", "bql_s04@test.com", "ban_quan_ly", false, true);
    bqlUserId = bqlUser.id;
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ban_quan_ly') ON CONFLICT DO NOTHING",
      [baseProjectId, bqlUserId]
    );
    bqlCookie = await loginUser("bql_s04@test.com");

    // 4. Các vai trò khác
    const cdtUser = await createTestUser("CĐT User", "cdt_s04@test.com", "chu_dau_tu", false, true);
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'chu_dau_tu') ON CONFLICT DO NOTHING", [baseProjectId, cdtUser.id]);
    cdtCookie = await loginUser("cdt_s04@test.com");

    const chtUser = await createTestUser("CHT User", "cht_s04@test.com", "chi_huy_truong", false, true);
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'chi_huy_truong') ON CONFLICT DO NOTHING", [baseProjectId, chtUser.id]);
    chtCookie = await loginUser("cht_s04@test.com");

    const ksgsUser = await createTestUser("KSGS User", "ksgs_s04@test.com", "ky_su_giam_sat", false, true);
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ky_su_giam_sat') ON CONFLICT DO NOTHING", [baseProjectId, ksgsUser.id]);
    ksgsCookie = await loginUser("ksgs_s04@test.com");

    const dtUser = await createTestUser("ĐT User", "dt_s04@test.com", "doi_truong", false, true);
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'doi_truong') ON CONFLICT DO NOTHING", [baseProjectId, dtUser.id]);
    dtCookie = await loginUser("dt_s04@test.com");

    const ktUser = await createTestUser("KT User", "kt_s04@test.com", "ke_toan", false, true);
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ke_toan') ON CONFLICT DO NOTHING", [baseProjectId, ktUser.id]);
    ktCookie = await loginUser("kt_s04@test.com");

    const khachUser = await createTestUser("Khách User", "khach_s04@test.com", "khach", false, true);
    khachCookie = await loginUser("khach_s04@test.com");
  });

  afterAll(async () => {
    // Dọn các project test
    await pool.query("DELETE FROM projects WHERE code LIKE 'PRJ-%S04%'");
  });

  describe("1. GET /api/auth/me/permissions trả cờ project.create toàn cục", () => {
    test("System Admin nhận project.create = true", async () => {
      const res = await request(app)
        .get("/api/auth/me/permissions")
        .set("Cookie", sysAdminCookie);
      expect(res.status).toBe(200);
      expect(res.body.permissions?.["project.create"]).toBe(true);
      expect(res.body.can_create_project).toBe(true);
    });

    test("Ban quản lý của ít nhất 1 dự án nhận project.create = true", async () => {
      const res = await request(app)
        .get("/api/auth/me/permissions")
        .set("Cookie", bqlCookie);
      expect(res.status).toBe(200);
      expect(res.body.permissions?.["project.create"]).toBe(true);
      expect(res.body.can_create_project).toBe(true);
    });

    test("Các vai trò khác và khách nhận project.create = false", async () => {
      const rolesToCheck = [
        { name: "CĐT", cookie: cdtCookie },
        { name: "CHT", cookie: chtCookie },
        { name: "KSGS", cookie: ksgsCookie },
        { name: "ĐT", cookie: dtCookie },
        { name: "KT", cookie: ktCookie },
        { name: "Khách", cookie: khachCookie },
      ];

      for (const r of rolesToCheck) {
        const res = await request(app)
          .get("/api/auth/me/permissions")
          .set("Cookie", r.cookie);
        expect(res.status).toBe(200);
        expect(res.body.permissions?.["project.create"]).toBe(false);
        expect(res.body.can_create_project).toBe(false);
      }
    });
  });

  describe("2. System Admin tạo dự án: Bắt buộc chỉ định Ban quản lý hợp lệ (422)", () => {
    test("Thiếu thông tin Ban quản lý -> HTTP 422", async () => {
      const res = await request(app)
        .post("/api/projects")
        .set("Cookie", sysAdminCookie)
        .send({
          name: "Dự án thiếu PM",
          code: `PRJ-NOPM-S04-${Date.now()}`,
          start_date: "2026-11-01",
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/bắt buộc chỉ định/i);
    });

    test("Chỉ định email không tồn tại -> HTTP 422", async () => {
      const res = await request(app)
        .post("/api/projects")
        .set("Cookie", sysAdminCookie)
        .send({
          name: "Dự án PM ảo",
          code: `PRJ-FAKEPM-S04-${Date.now()}`,
          pm_email: "nonexistent_pm_99999@test.com",
          start_date: "2026-11-01",
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/không tồn tại/i);
    });

    test("Chỉ định tài khoản có vai trò 'khach' -> HTTP 422", async () => {
      const res = await request(app)
        .post("/api/projects")
        .set("Cookie", sysAdminCookie)
        .send({
          name: "Dự án PM khách",
          code: `PRJ-KHACHPM-S04-${Date.now()}`,
          pm_email: "khach_s04@test.com",
          start_date: "2026-11-01",
        });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/vai trò khách/i);
    });

    test("Chỉ định PM hợp lệ -> HTTP 201, PM được gán làm Ban quản lý, System Admin KHÔNG vào project_members", async () => {
      const code = `PRJ-SYSOK-S04-${Date.now()}`;
      const res = await request(app)
        .post("/api/projects")
        .set("Cookie", sysAdminCookie)
        .send({
          name: "Dự án hợp lệ do Admin tạo",
          code,
          pm_email: "bql_s04@test.com",
          start_date: "2026-11-01",
        });
      expect(res.status).toBe(201);
      const createdProjId = res.body.project.id;

      // Kiểm tra thành viên trong project_members
      const members = await pool.query(
        "SELECT user_id, role FROM project_members WHERE project_id = $1",
        [createdProjId]
      );
      expect(members.rows.length).toBe(1);
      expect(members.rows[0].user_id).toBe(bqlUserId);
      expect(members.rows[0].role).toBe("ban_quan_ly");

      // System Admin không có mặt trong project_members
      const adminMember = members.rows.find((m) => m.user_id === 1);
      expect(adminMember).toBeUndefined();
    });
  });

  describe("3. Phân quyền tạo dự án: 6 vai trò khác + khách gọi POST /api/projects nhận 403", () => {
    test("6 vai trò và khách đều bị chặn 403 và ghi log CREATE_PROJECT_DENIED", async () => {
      const cookies = [
        { name: "CĐT", cookie: cdtCookie },
        { name: "CHT", cookie: chtCookie },
        { name: "KSGS", cookie: ksgsCookie },
        { name: "ĐT", cookie: dtCookie },
        { name: "KT", cookie: ktCookie },
        { name: "Khách", cookie: khachCookie },
      ];

      for (const c of cookies) {
        const res = await request(app)
          .post("/api/projects")
          .set("Cookie", c.cookie)
          .send({
            name: `Thử tạo dự án bởi ${c.name}`,
            code: `PRJ-DENIED-${c.name}-${Date.now()}`,
            start_date: "2026-11-01",
          });
        expect(res.status).toBe(403);
      }

      // Kiểm tra audit_logs đã ghi nhận CREATE_PROJECT_DENIED
      const audit = await pool.query(
        "SELECT action, details, ip_address FROM audit_logs WHERE action = 'CREATE_PROJECT_DENIED' ORDER BY id DESC LIMIT 5"
      );
      expect(audit.rows.length).toBeGreaterThan(0);
      expect(audit.rows[0].action).toBe("CREATE_PROJECT_DENIED");
      expect(audit.rows[0].ip_address).toBeTruthy();
    });
  });

  describe("4. Ban quản lý tạo dự án: Thành công và cô lập dự án", () => {
    test("Ban quản lý tạo dự án thành công (201) và tự động làm Ban quản lý", async () => {
      const code = `PRJ-BQLOK-S04-${Date.now()}`;
      const res = await request(app)
        .post("/api/projects")
        .set("Cookie", bqlCookie)
        .send({
          name: "Trường THCS Ban Quản Lý Tạo",
          code,
          location: "Hà Nội",
          start_date: "2026-11-01",
        });
      expect(res.status).toBe(201);
      const newProjectId = res.body.project.id;

      // Xác nhận trong project_members: chính bqlUserId làm ban_quan_ly
      const pmRes = await pool.query(
        "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
        [newProjectId, bqlUserId]
      );
      expect(pmRes.rows.length).toBe(1);
      expect(pmRes.rows[0].role).toBe("ban_quan_ly");

      // BQL thấy dự án mới trong danh sách dự án của mình
      const listRes = await request(app)
        .get("/api/projects")
        .set("Cookie", bqlCookie);
      expect(listRes.status).toBe(200);
      const found = listRes.body.projects.find((p) => p.id === newProjectId);
      expect(found).toBeDefined();

      // Người dùng khác (như CĐT, CHT) không tham gia dự án này thì không thấy
      const cdtList = await request(app)
        .get("/api/projects")
        .set("Cookie", cdtCookie);
      const cdtFound = cdtList.body.projects.find((p) => p.id === newProjectId);
      expect(cdtFound).toBeUndefined();
    });

    test("Ban quản lý đã bị gỡ khỏi mọi dự án -> Gọi tạo dự án nhận 403", async () => {
      // Tạo một BQL riêng rồi gỡ khỏi project
      const pass = await argon2.hash("Password123!");
      const removedUser = await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
         VALUES ('BQL Bị Gỡ', 'bql_removed_s04@test.com', $1, 1, false, true)
         RETURNING id`,
        [pass]
      );
      const removedUserId = removedUser.rows[0].id;

      // Đăng nhập BQL này (chưa có dự án nào)
      const removedCookie = await loginUser("bql_removed_s04@test.com");

      const res = await request(app)
        .post("/api/projects")
        .set("Cookie", removedCookie)
        .send({
          name: "Dự án của BQL bị gỡ",
          code: `PRJ-REMOVED-S04-${Date.now()}`,
          start_date: "2026-11-01",
        });
      expect(res.status).toBe(403);
    });
  });

  describe("5. Rollback an toàn: Lỗi giữa chừng không để lại dự án rỗng hay member thừa", () => {
    test("Trùng mã dự án -> Rollback sạch sẽ", async () => {
      const duplicateCode = `PRJ-DUP-S04-${Date.now()}`;
      // Tạo lần 1
      const res1 = await request(app)
        .post("/api/projects")
        .set("Cookie", bqlCookie)
        .send({
          name: "Dự án lần 1",
          code: duplicateCode,
          start_date: "2026-11-01",
        });
      expect(res1.status).toBe(201);

      // Đếm số lượng project hiện tại
      const countBefore = await pool.query("SELECT COUNT(*) FROM projects");

      // Tạo lần 2 với cùng mã code -> Báo 400
      const res2 = await request(app)
        .post("/api/projects")
        .set("Cookie", bqlCookie)
        .send({
          name: "Dự án trùng mã",
          code: duplicateCode,
          start_date: "2026-11-01",
        });
      expect(res2.status).toBe(400);

      const countAfter = await pool.query("SELECT COUNT(*) FROM projects");
      expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
    });
  });

  describe("6. Ghi log 403 ở lớp phân quyền trung tâm cho route khác", () => {
    test("User không phải thành viên truy cập route dự án bị 403 và ghi ACCESS_DENIED_NOT_MEMBER", async () => {
      // Khách truy cập vào base project
      const res = await request(app)
        .get(`/api/projects/${baseProjectId}/categories`)
        .set("Cookie", khachCookie);
      expect(res.status).toBe(403);

      const audit = await pool.query(
        "SELECT action, ip_address FROM audit_logs WHERE action = 'ACCESS_DENIED_NOT_MEMBER' ORDER BY id DESC LIMIT 1"
      );
      expect(audit.rows.length).toBe(1);
      expect(audit.rows[0].action).toBe("ACCESS_DENIED_NOT_MEMBER");
    });
  });
});
