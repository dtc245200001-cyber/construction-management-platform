"use strict";

const { randomUUID } = require("crypto");
const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Story S-32: Diary Entries Versioning & Conflict Resolution (T-76, T-77, T-78, T-79)", () => {
  let cookieKySuA;
  let cookieKySuB;
  let cookieKeToan; // User without site_log.create permission
  let userKySuAId;
  let userKySuBId;
  let userKeToanId;
  let projectId;
  let workItemId;
  let otherProjectId;
  let otherWorkItemId;

  beforeAll(async () => {
    // Dọn dẹp dữ liệu test
    await pool.query(
      "TRUNCATE TABLE diary_entry_conflicts, diary_entries, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    for (const r of ["ky_su_giam_sat", "ke_toan", "ban_quan_ly"]) {
      await pool.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }
    const { rows: roles } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => roles.find((r) => r.name === name).id;

    const passwordHash = await argon2.hash("Password123!");

    const resUserA = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Kỹ sư A', 'kysu_a_s32@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ky_su_giam_sat")]
    );
    userKySuAId = resUserA.rows[0].id;

    const resUserB = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Kỹ sư B', 'kysu_b_s32@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ky_su_giam_sat")]
    );
    userKySuBId = resUserB.rows[0].id;

    const resUserKeToan = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Kế toán', 'ketoan_s32@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ke_toan")]
    );
    userKeToanId = resUserKeToan.rows[0].id;

    cookieKySuA = (
      await request(app).post("/api/auth/login").send({ email: "kysu_a_s32@test.com", password: "Password123!" })
    ).headers["set-cookie"];

    cookieKySuB = (
      await request(app).post("/api/auth/login").send({ email: "kysu_b_s32@test.com", password: "Password123!" })
    ).headers["set-cookie"];

    cookieKeToan = (
      await request(app).post("/api/auth/login").send({ email: "ketoan_s32@test.com", password: "Password123!" })
    ).headers["set-cookie"];

    // Tạo dự án
    const pRes = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Dự án S32 Test', 'PRJ-S32', '2026-01-01') RETURNING id"
    );
    projectId = pRes.rows[0].id;

    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ky_su_giam_sat'), ($1, $3, 'ky_su_giam_sat'), ($1, $4, 'ke_toan')",
      [projectId, userKySuAId, userKySuBId, userKeToanId]
    );

    const wiRes = await pool.query(
      "INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'Hạng mục S32', 'HM-S32', 'category') RETURNING id",
      [projectId]
    );
    workItemId = wiRes.rows[0].id;

    // Dự án khác để test cross-project
    const otherPRes = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Dự án khác', 'PRJ-OTHER', '2026-01-01') RETURNING id"
    );
    otherProjectId = otherPRes.rows[0].id;

    const otherWiRes = await pool.query(
      "INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'Hạng mục ngoài', 'HM-OTHER', 'category') RETURNING id",
      [otherProjectId]
    );
    otherWorkItemId = otherWiRes.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  // ========================================================
  // T-76: Version kiểm soát sửa đồng thời & Validation
  // ========================================================
  describe("T-76: Version control on update", () => {
    let entryId;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/diary-entries`)
        .set("Cookie", cookieKySuA)
        .send({
          work_item_id: workItemId,
          content: "Nội dung ban đầu T-76",
          entry_at: "2026-10-13T08:00:00.000Z",
          client_id: randomUUID(),
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      entryId = res.body.id;
      expect(res.body.version).toBe(1);
    });

    it("Yêu cầu version hợp lệ khi cập nhật (thiếu version -> 400)", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}/diary-entries/${entryId}`)
        .set("Cookie", cookieKySuA)
        .send({
          content: "Cập nhật không có version",
        });
      expect(res.status).toBe(400);
      expect(res.body.errors).toContain(
        "version is required and must be a positive integer"
      );
    });

    it("Chặn cross-project work_item_id (422)", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}/diary-entries/${entryId}`)
        .set("Cookie", cookieKySuA)
        .send({
          content: "Cập nhật work item sai dự án",
          version: 1,
          work_item_id: otherWorkItemId,
        });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("INVALID_WORK_ITEM");
    });

    it("Cập nhật thành công khi đúng version -> version tăng nguyên tử (1 -> 2)", async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}/diary-entries/${entryId}`)
        .set("Cookie", cookieKySuA)
        .send({
          content: "Nội dung cập nhật hợp lệ",
          version: 1,
        });
      expect(res.status).toBe(200);
      expect(res.body.version).toBe(2);
      expect(res.body.content).toBe("Nội dung cập nhật hợp lệ");
    });
  });

  // ========================================================
  // T-79: Kiểm thử xung đột hai thiết bị & race condition
  // ========================================================
  describe("T-79 & T-77: Two device concurrent conflict simulation", () => {
    it("Mô phỏng 2 thiết bị cùng gửi update version 1: 1 thắng (200), 1 xung đột (409)", async () => {
      // 1. Tạo bản ghi ban đầu: version = 1
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/diary-entries`)
        .set("Cookie", cookieKySuA)
        .send({
          work_item_id: workItemId,
          content: "ORIGINAL_CONTENT_V1",
          entry_at: "2026-10-13T08:00:00.000Z",
          client_id: randomUUID(),
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.id).toBeDefined();
      const entryId = createRes.body.id;
      expect(createRes.body.version).toBe(1);

      // 2. Hai thiết bị cùng đọc version 1 và cùng gửi update đồng thời
      const reqA = request(app)
        .put(`/api/projects/${projectId}/diary-entries/${entryId}`)
        .set("Cookie", cookieKySuA)
        .send({
          content: "CONTENT_FROM_DEVICE_A",
          version: 1,
          source: "offline_sync",
          client_updated_at: new Date().toISOString(),
        });

      const reqB = request(app)
        .put(`/api/projects/${projectId}/diary-entries/${entryId}`)
        .set("Cookie", cookieKySuB)
        .send({
          content: "CONTENT_FROM_DEVICE_B",
          version: 1,
          source: "offline_sync",
          client_updated_at: new Date().toISOString(),
        });

      const [resA, resB] = await Promise.all([reqA, reqB]);

      const statuses = [resA.status, resB.status].sort();
      // Kỳ vọng chính xác: 1 request 200, 1 request 409
      expect(statuses).toEqual([200, 409]);

      const winnerRes = resA.status === 200 ? resA : resB;
      const loserRes = resA.status === 409 ? resA : resB;

      // Winner nhận version 2
      expect(winnerRes.body.version).toBe(2);

      // Loser nhận HTTP 409 với mã DIARY_VERSION_CONFLICT
      expect(loserRes.body.code).toBe("DIARY_VERSION_CONFLICT");
      expect(loserRes.body.conflict_id).toBeDefined();
      expect(loserRes.body.server_version).toBe(2);
      expect(loserRes.body.client_version).toBe(1);

      // 3. Kiểm tra không bị ghi đè âm thầm & bảo toàn dữ liệu (Section 31)
      const dbEntry = await pool.query("SELECT * FROM diary_entries WHERE id = $1", [entryId]);
      expect(dbEntry.rows[0].version).toBe(2);
      expect(dbEntry.rows[0].content).toBe(winnerRes.body.content);

      // 4. Kiểm tra bảng diary_entry_conflicts lưu đủ cả hai bản snapshot
      const conflictRecord = await pool.query(
        "SELECT * FROM diary_entry_conflicts WHERE id = $1",
        [loserRes.body.conflict_id]
      );
      expect(conflictRecord.rows.length).toBe(1);
      const conf = conflictRecord.rows[0];

      expect(conf.status).toBe("pending");
      expect(conf.server_version).toBe(2);
      expect(conf.client_version).toBe(1);

      // Kiểm tra snapshots
      const sSnap = conf.server_snapshot;
      const cSnap = conf.client_snapshot;
      expect(sSnap.content).toBe(winnerRes.body.content);
      expect(cSnap.content).toBe(loserRes.body.content);
    });
  });

  // ========================================================
  // T-78: Giải quyết xung đột (Resolve Server / Resolve Client)
  // ========================================================
  describe("T-78: Conflict resolution endpoints and permissions", () => {
    let entryId;
    let conflictId;

    beforeEach(async () => {
      // Setup: tạo entry v1
      const cRes = await request(app)
        .post(`/api/projects/${projectId}/diary-entries`)
        .set("Cookie", cookieKySuA)
        .send({
          work_item_id: workItemId,
          content: "BASE_CONTENT_V1",
          entry_at: "2026-10-13T08:00:00.000Z",
          client_id: randomUUID(),
        });
      expect(cRes.status).toBe(201);
      expect(cRes.body.id).toBeDefined();
      entryId = cRes.body.id;

      // Cập nhật lên v2
      const putV2Res = await request(app)
        .put(`/api/projects/${projectId}/diary-entries/${entryId}`)
        .set("Cookie", cookieKySuA)
        .send({
          content: "SERVER_CONTENT_V2",
          version: 1,
        });
      expect(putV2Res.status).toBe(200);

      // Tạo conflict bằng cách gửi request dựa trên v1
      const confRes = await request(app)
        .put(`/api/projects/${projectId}/diary-entries/${entryId}`)
        .set("Cookie", cookieKySuB)
        .send({
          content: "CLIENT_CONTENT_FROM_DEVICE_B",
          version: 1,
          source: "offline_sync",
        });

      expect(confRes.status).toBe(409);
      conflictId = confRes.body.conflict_id;
    });

    it("1. GET /diary-conflicts trả về danh sách xung đột đang pending của project", async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/diary-conflicts?status=pending`)
        .set("Cookie", cookieKySuA);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((c) => c.id === conflictId);
      expect(found).toBeDefined();
      expect(found.status).toBe("pending");
      expect(found.server_snapshot.content).toBe("SERVER_CONTENT_V2");
      expect(found.client_snapshot.content).toBe("CLIENT_CONTENT_FROM_DEVICE_B");
    });

    it("2. Resolve chọn 'server': giữ nguyên server content, version không tăng, conflict resolved", async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/diary-conflicts/${conflictId}/resolve`)
        .set("Cookie", cookieKySuA)
        .send({ resolution: "server" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.resolution).toBe("server");
      expect(res.body.resulting_version).toBe(2);

      // Kiểm tra trong DB: nội dung server không đổi, version vẫn là 2
      const entryInDb = await pool.query("SELECT * FROM diary_entries WHERE id = $1", [entryId]);
      expect(entryInDb.rows[0].version).toBe(2);
      expect(entryInDb.rows[0].content).toBe("SERVER_CONTENT_V2");

      const confInDb = await pool.query("SELECT * FROM diary_entry_conflicts WHERE id = $1", [conflictId]);
      expect(confInDb.rows[0].status).toBe("resolved");
      expect(confInDb.rows[0].resolved_by).toBe(userKySuAId);
      expect(confInDb.rows[0].resolved_at).toBeDefined();
    });

    it("3. Resolve chọn 'client': áp dụng client snapshot, version tăng 2 -> 3, conflict resolved", async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/diary-conflicts/${conflictId}/resolve`)
        .set("Cookie", cookieKySuA)
        .send({ resolution: "client" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.resolution).toBe("client");
      expect(res.body.resulting_version).toBe(3);

      // Kiểm tra trong DB: nội dung chuyển sang client content, version là 3
      const entryInDb = await pool.query("SELECT * FROM diary_entries WHERE id = $1", [entryId]);
      expect(entryInDb.rows[0].version).toBe(3);
      expect(entryInDb.rows[0].content).toBe("CLIENT_CONTENT_FROM_DEVICE_B");

      const confInDb = await pool.query("SELECT * FROM diary_entry_conflicts WHERE id = $1", [conflictId]);
      expect(confInDb.rows[0].status).toBe("resolved");
      expect(confInDb.rows[0].resolved_by).toBe(userKySuAId);
      expect(confInDb.rows[0].resolved_version).toBe(3);
    });

    it("4. Server thay đổi sau khi conflict được tạo: chặn resolve client (409 CONFLICT_STATE_CHANGED)", async () => {
      // Giả sử có người khác sửa server lên version 3
      await request(app)
        .put(`/api/projects/${projectId}/diary-entries/${entryId}`)
        .set("Cookie", cookieKySuA)
        .send({
          content: "NEWER_SERVER_CONTENT_V3",
          version: 2,
        });

      // Bây giờ cố resolve conflict cũ (vốn dựa trên server v2) bằng client snapshot
      const res = await request(app)
        .post(`/api/projects/${projectId}/diary-conflicts/${conflictId}/resolve`)
        .set("Cookie", cookieKySuA)
        .send({ resolution: "client" });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CONFLICT_STATE_CHANGED");

      // Đảm bảo không ghi đè lên server v3
      const entryInDb = await pool.query("SELECT * FROM diary_entries WHERE id = $1", [entryId]);
      expect(entryInDb.rows[0].version).toBe(3);
      expect(entryInDb.rows[0].content).toBe("NEWER_SERVER_CONTENT_V3");
    });

    it("5. Phân quyền backend: Người không có quyền (kế toán không có site_log.create) bị từ chối 403", async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/diary-conflicts/${conflictId}/resolve`)
        .set("Cookie", cookieKeToan)
        .send({ resolution: "server" });

      expect(res.status).toBe(403);

      // Đảm bảo conflict vẫn pending
      const confInDb = await pool.query("SELECT * FROM diary_entry_conflicts WHERE id = $1", [conflictId]);
      expect(confInDb.rows[0].status).toBe("pending");
    });
  });
});
