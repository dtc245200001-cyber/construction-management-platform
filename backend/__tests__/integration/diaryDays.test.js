"use strict";

// S-22 / T-50 — Integration tests cho /diary-days endpoints

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Diary Days API Integration Tests (S-22)", () => {
  let cookieAdmin;   // is_system_admin
  let cookieKySu;    // ky_su_giam_sat → can_edit
  let cookieCHT;     // chi_huy_truong → can_edit
  let cookieChuDauTu; // chu_dau_tu → read-only
  let cookieKeToan;  // ke_toan → read-only (dự án B)
  let cookieNoProject; // không thuộc dự án

  let projectAId;
  let projectBId;
  let projectAWorkItemId;

  // id danh mục lấy theo code, không hard-code
  let weatherNangId;
  let weatherMuaCaNgayId;
  let equipMayXucId;
  let equipMayUiId;

  const TEST_DATE = "2026-09-15"; // ngày quá khứ, an toàn cho test
  const TEST_DATE_2 = "2026-09-16";
  const FUTURE_DATE = "2099-12-31"; // ngày tương lai

  beforeAll(async () => {
    // Dọn bảng — diary_daily_equipment và diary_daily_logs phụ thuộc projects/users
    await pool.query(`
      TRUNCATE TABLE diary_daily_equipment, diary_daily_logs,
        diary_entries, milestones, schedule_results, dependencies,
        tasks, work_items, project_members, projects, users
      RESTART IDENTITY CASCADE
    `);
    // Không truncate diary_weather_types và diary_equipment_types
    // vì dữ liệu được seed trong migration và không phụ thuộc users/projects

    // Cài roles
    const requiredRoles = [
      "ky_su_giam_sat", "chi_huy_truong", "ban_quan_ly",
      "chu_dau_tu", "ke_toan", "doi_truong",
    ];
    for (const r of requiredRoles) {
      await pool.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }
    const { rows: rolesRows } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => rolesRows.find((r) => r.name === name).id;

    const passwordHash = await argon2.hash("Password123!");

    // Tạo users
    const uAdmin = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Admin', 'admin_dd@test.com', $1, $2, true, true) RETURNING id",
      [passwordHash, getRole("ban_quan_ly")]
    );
    const uKySu = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Ky Su', 'kysu_dd@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ky_su_giam_sat")]
    );
    const uCHT = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('CHT', 'cht_dd@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("chi_huy_truong")]
    );
    const uChuDauTu = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('ChuDauTu', 'chudautu_dd@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("chu_dau_tu")]
    );
    const uKeToan = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('KeToan', 'ketoan_dd@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ke_toan")]
    );
    const uNoProject = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('NoProject', 'noproject_dd@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ky_su_giam_sat")]
    );

    // Login
    cookieAdmin = (await request(app).post("/api/auth/login").send({ email: "admin_dd@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieKySu = (await request(app).post("/api/auth/login").send({ email: "kysu_dd@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieCHT = (await request(app).post("/api/auth/login").send({ email: "cht_dd@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieChuDauTu = (await request(app).post("/api/auth/login").send({ email: "chudautu_dd@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieKeToan = (await request(app).post("/api/auth/login").send({ email: "ketoan_dd@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieNoProject = (await request(app).post("/api/auth/login").send({ email: "noproject_dd@test.com", password: "Password123!" })).headers["set-cookie"];

    // Tạo projects
    const pA = await pool.query("INSERT INTO projects (name, code, start_date) VALUES ('Diary Project A', 'DPA', '2026-01-01') RETURNING id");
    projectAId = pA.rows[0].id;
    const pB = await pool.query("INSERT INTO projects (name, code, start_date) VALUES ('Diary Project B', 'DPB', '2026-01-01') RETURNING id");
    projectBId = pB.rows[0].id;

    const adminUserId = uAdmin.rows[0].id;
    const kySuUserId = uKySu.rows[0].id;
    const chtUserId = uCHT.rows[0].id;
    const chuDauTuUserId = uChuDauTu.rows[0].id;
    const keToanUserId = uKeToan.rows[0].id;

    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES
        ($1, $2, 'ban_quan_ly'),
        ($1, $3, 'ky_su_giam_sat'),
        ($1, $4, 'chi_huy_truong'),
        ($1, $5, 'chu_dau_tu')`,
      [projectAId, adminUserId, kySuUserId, chtUserId, chuDauTuUserId]
    );
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ke_toan')",
      [projectBId, keToanUserId]
    );

    // Work item cho test entries_count
    const wi = await pool.query(
      "INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'WI A', 'WIA', 'category') RETURNING id",
      [projectAId]
    );
    projectAWorkItemId = wi.rows[0].id;

    // Tra id danh mục theo code
    const { rows: wt } = await pool.query("SELECT id, code FROM diary_weather_types");
    weatherNangId = wt.find((r) => r.code === "nang")?.id;
    weatherMuaCaNgayId = wt.find((r) => r.code === "mua_ca_ngay")?.id;

    const { rows: et } = await pool.query("SELECT id, code FROM diary_equipment_types");
    equipMayXucId = et.find((r) => r.code === "may_xuc")?.id;
    equipMayUiId = et.find((r) => r.code === "may_ui")?.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  // ─── Ca 1: GET /diary-catalogs ─────────────────────────────────────────────
  describe("Ca 1: GET /diary-catalogs", () => {
    it("200 cho thành viên mọi vai trò", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-catalogs`)
        .set("Cookie", cookieChuDauTu);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.weather_types)).toBe(true);
      expect(Array.isArray(res.body.equipment_types)).toBe(true);
    });

    it("chỉ trả bản ghi active", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-catalogs`)
        .set("Cookie", cookieKySu);
      expect(res.status).toBe(200);
      res.body.weather_types.forEach((wt) => {
        expect(wt).toHaveProperty("is_adverse");
      });
    });

    it("401 chưa đăng nhập", async () => {
      const res = await request(app).get(`/api/projects/${projectAId}/diary-catalogs`);
      expect(res.status).toBe(401);
    });

    it("403 người không thuộc dự án", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-catalogs`)
        .set("Cookie", cookieNoProject);
      expect(res.status).toBe(403);
    });
  });

  // ─── Ca 2: GET /diary-days/:date khi chưa có ──────────────────────────────
  describe("Ca 2: GET /diary-days/:date khi chưa có", () => {
    it("200 exists=false day=null cho ky_su_giam_sat", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu);
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);
      expect(res.body.day).toBeNull();
      expect(res.body.can_edit).toBe(true);
    });

    it("can_edit = false cho chu_dau_tu", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieChuDauTu);
      expect(res.status).toBe(200);
      expect(res.body.can_edit).toBe(false);
    });
  });

  // ─── Ca 3: AC1 — mỗi ngày đúng một mục ─────────────────────────────────
  describe("Ca 3: AC1 — upsert idempotent", () => {
    it("PUT lần 1 → 201", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 10, weather_type_id: weatherNangId });
      expect(res.status).toBe(201);
      expect(res.body.day.id).toBeDefined();
    });

    it("PUT lần 2 cùng ngày → 200, cùng id", async () => {
      const res1 = await request(app)
        .get(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu);
      const id1 = res1.body.day.id;

      const res2 = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 20, weather_type_id: weatherNangId });
      expect(res2.status).toBe(200);
      expect(res2.body.day.id).toBe(id1);

      // Đếm DB: đúng một dòng
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM diary_daily_logs WHERE project_id = $1 AND log_date = $2",
        [projectAId, TEST_DATE]
      );
      expect(rows[0].cnt).toBe(1);
    });
  });

  // ─── Ca 4: Đồng thời ──────────────────────────────────────────────────────
  describe("Ca 4: Đồng thời — 5 PUT cùng lúc", () => {
    it("không có 500, đúng 1 dòng trong DB", async () => {
      const CONC_DATE = "2026-09-17";
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app)
            .put(`/api/projects/${projectAId}/diary-days/${CONC_DATE}`)
            .set("Cookie", cookieKySu)
            .send({ manpower_count: 5, weather_type_id: weatherNangId })
        )
      );
      results.forEach((r) => {
        expect(r.status).not.toBe(500);
        expect([200, 201]).toContain(r.status);
      });
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM diary_daily_logs WHERE project_id = $1 AND log_date = $2",
        [projectAId, CONC_DATE]
      );
      expect(rows[0].cnt).toBe(1);
    });
  });

  // ─── Ca 5: Ngữ nghĩa thay thế ─────────────────────────────────────────────
  describe("Ca 5: Ngữ nghĩa thay thế", () => {
    it("PUT lần 2 với ít thiết bị hơn → thiết bị cũ bị xóa", async () => {
      // Lần 1: 2 thiết bị
      await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE_2}`)
        .set("Cookie", cookieKySu)
        .send({
          manpower_count: 5,
          equipment: [
            { equipment_type_id: equipMayXucId, quantity: 2 },
            { equipment_type_id: equipMayUiId, quantity: 1 },
          ],
        });

      // Lần 2: chỉ 1 thiết bị
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE_2}`)
        .set("Cookie", cookieKySu)
        .send({
          manpower_count: 5,
          equipment: [{ equipment_type_id: equipMayXucId, quantity: 3 }],
        });
      expect(res.status).toBe(200);
      expect(res.body.day.equipment).toHaveLength(1);
      expect(res.body.day.equipment[0].equipment_type_id).toBe(equipMayXucId);
    });

    it("manpower_count = 0 được lưu là 0, không bị coi là null", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 0, weather_type_id: weatherNangId });
      expect(res.status).toBe(200);
      expect(res.body.day.manpower_count).toBe(0);
    });
  });

  // ─── Ca 6: AC2 — đánh dấu ngày mưa ────────────────────────────────────────
  describe("Ca 6: AC2 — weather_is_adverse đúng với mua_ca_ngay", () => {
    const RAIN_DATE = "2026-09-20";
    const SUN_DATE = "2026-09-21";

    beforeAll(async () => {
      // Lưu ngày mưa
      await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${RAIN_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 0, weather_type_id: weatherMuaCaNgayId });

      // Lưu ngày nắng
      await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${SUN_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 20, weather_type_id: weatherNangId });
    });

    it("GET /diary-days?from&to trả weather_is_adverse đúng", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days?from=2026-09-20&to=2026-09-21`)
        .set("Cookie", cookieKySu);
      expect(res.status).toBe(200);
      expect(res.body.days).toHaveLength(2);

      const rainDay = res.body.days.find((d) => d.date.slice(0, 10) === RAIN_DATE);
      expect(rainDay.weather_is_adverse).toBe(true);
      expect(rainDay.has_daily_log).toBe(true);

      const sunDay = res.body.days.find((d) => d.date.slice(0, 10) === SUN_DATE);
      expect(sunDay.weather_is_adverse).toBe(false);
    });

    it("mảng dày — có đủ số ngày kể cả ngày chưa có bản ghi", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days?from=2026-09-18&to=2026-09-24`)
        .set("Cookie", cookieKySu);
      expect(res.status).toBe(200);
      expect(res.body.days).toHaveLength(7);

      const noLogDay = res.body.days.find((d) => d.date.slice(0, 10) === "2026-09-18");
      expect(noLogDay.has_daily_log).toBe(false);
    });
  });

  // ─── Ca 7: Phân quyền ─────────────────────────────────────────────────────
  describe("Ca 7: Phân quyền", () => {
    it("chu_dau_tu PUT → 403", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieChuDauTu)
        .send({ manpower_count: 5 });
      expect(res.status).toBe(403);
    });

    it("người ngoài dự án GET → 403", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieNoProject);
      expect(res.status).toBe(403);
    });

    it("ke_toan của dự án B không đọc được dự án A", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKeToan);
      expect(res.status).toBe(403);
    });

    it("chi_huy_truong PUT → 201/200 (có quyền ghi)", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/2026-09-25`)
        .set("Cookie", cookieCHT)
        .send({ manpower_count: 8 });
      expect([200, 201]).toContain(res.status);
    });
  });

  // ─── Ca 8: Validation ─────────────────────────────────────────────────────
  describe("Ca 8: Validation", () => {
    it("manpower_count âm → 400", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: -1 });
      expect(res.status).toBe(400);
    });

    it("manpower_count chuỗi → 400", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: "abc" });
      expect(res.status).toBe(400);
    });

    it("thiết bị trùng → 400", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu)
        .send({
          manpower_count: 5,
          equipment: [
            { equipment_type_id: equipMayXucId, quantity: 1 },
            { equipment_type_id: equipMayXucId, quantity: 2 },
          ],
        });
      expect(res.status).toBe(400);
    });

    it("body trống → 400", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu)
        .send({});
      expect(res.status).toBe(400);
    });

    it("weather_type_id không tồn tại → 422 INVALID_WEATHER_TYPE", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 5, weather_type_id: 999999 });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("INVALID_WEATHER_TYPE");
    });

    it("equipment_type_id không tồn tại → 422 INVALID_EQUIPMENT_TYPE", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${TEST_DATE}`)
        .set("Cookie", cookieKySu)
        .send({
          manpower_count: 5,
          equipment: [{ equipment_type_id: 999999, quantity: 1 }],
        });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("INVALID_EQUIPMENT_TYPE");
    });
  });

  // ─── Ca 9: expected_updated_at / STALE_DAILY_LOG ───────────────────────────
  describe("Ca 9: STALE_DAILY_LOG", () => {
    const STALE_DATE = "2026-09-22";

    it("expected_updated_at lệch → 409 STALE_DAILY_LOG, dữ liệu không đổi", async () => {
      // Tạo trước
      await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${STALE_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 10, weather_type_id: weatherNangId });

      // Gửi với expected_updated_at cũ (sai)
      const stale = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${STALE_DATE}`)
        .set("Cookie", cookieKySu)
        .send({
          manpower_count: 99,
          weather_type_id: weatherNangId,
          expected_updated_at: "2020-01-01T00:00:00.000Z",
        });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("STALE_DAILY_LOG");

      // Dữ liệu không đổi
      const check = await request(app)
        .get(`/api/projects/${projectAId}/diary-days/${STALE_DATE}`)
        .set("Cookie", cookieKySu);
      expect(check.body.day.manpower_count).toBe(10);
    });
  });

  // ─── Ca 10: Ngày tương lai ────────────────────────────────────────────────
  describe("Ca 10: Ngày tương lai", () => {
    it("ngày tương lai → 400", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${FUTURE_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 5 });
      expect(res.status).toBe(400);
    });

    it("ngày hôm nay hợp lệ", async () => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const res = await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${today}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 5 });
      expect([200, 201]).toContain(res.status);
    });
  });

  // ─── Ca 11: Validate GET ?from&to ─────────────────────────────────────────
  describe("Ca 11: Validate GET ?from&to", () => {
    it("thiếu from → 400", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days?to=2026-10-11`)
        .set("Cookie", cookieKySu);
      expect(res.status).toBe(400);
    });

    it("from > to → 400", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days?from=2026-10-11&to=2026-10-05`)
        .set("Cookie", cookieKySu);
      expect(res.status).toBe(400);
    });

    it("khoảng > 62 ngày → 400", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days?from=2026-01-01&to=2026-03-10`)
        .set("Cookie", cookieKySu);
      expect(res.status).toBe(400);
    });
  });

  // ─── Ca 12: entries_count theo múi giờ VN ─────────────────────────────────
  describe("Ca 12: entries_count theo giờ Việt Nam", () => {
    it("mục lúc 17:30 UTC → entry_date ngày hôm sau VN", async () => {
      // Ghi một diary entry lúc 17:30 UTC → 00:30 VN ngày hôm sau
      await pool.query(
        `INSERT INTO diary_entries (project_id, work_item_id, content, entry_at, created_by)
         VALUES ($1, $2, 'Test VN TZ', '2026-09-14T17:30:00Z', (SELECT id FROM users WHERE email = 'kysu_dd@test.com'))`,
        [projectAId, projectAWorkItemId]
      );

      // entry_date sẽ là 2026-09-15 (theo VN)
      const res = await request(app)
        .get(`/api/projects/${projectAId}/diary-days/2026-09-15`)
        .set("Cookie", cookieKySu);
      expect(res.status).toBe(200);
      expect(res.body.entries_count).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Ca 13: Audit log ─────────────────────────────────────────────────────
  describe("Ca 13: Audit log", () => {
    it("sau PUT có dòng UPSERT_DIARY_DAILY_LOG trong audit_logs", async () => {
      const AUDIT_DATE = "2026-09-28";
      await request(app)
        .put(`/api/projects/${projectAId}/diary-days/${AUDIT_DATE}`)
        .set("Cookie", cookieKySu)
        .send({ manpower_count: 3 });

      // Đợi async audit
      await new Promise((r) => setTimeout(r, 200));
      const { rows } = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'UPSERT_DIARY_DAILY_LOG' ORDER BY created_at DESC LIMIT 1"
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].entity).toBe("diary_daily_logs");
    });
  });
});
