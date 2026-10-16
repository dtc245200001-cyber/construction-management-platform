"use strict";

const request = require("supertest");
const path = require("path");
const argon2 = require("argon2");
const app = require("../../app");
const pool = require("../../config/db");
const runner = require("node-pg-migrate").default || require("node-pg-migrate");

describe("T-112: API lập đề nghị từ phiếu nghiệm thu đã duyệt (S-43)", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    "postgres://postgres:khanhhoa123!@localhost:5432/construction_db_test";

  let p1Id;
  let p2Id;

  // Users & Cookies
  let cookieBql;
  let cookieCdt;
  let cookieKsgs;
  let cookieDoiTruong;
  let cookieOutside;

  let uBqlId;
  let uCdtId;
  let uKsgsId;

  // Counter để tạo mã và tên duy nhất
  let wiCounter = 0;

  beforeAll(async () => {
    // 1. Chạy migration up để đảm bảo schema mới nhất
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "../../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      checkOrder: false,
      log: () => {},
    });

    // 2. Dọn dẹp dữ liệu bảng liên quan
    await pool.query(`
      TRUNCATE payment_request_lines, payment_request_acceptances, payment_requests,
               acceptance_voucher_photos, acceptance_voucher_items, acceptance_vouchers,
               work_items, project_members, projects, users
      RESTART IDENTITY CASCADE
    `);

    // 3. Khởi tạo roles
    const rolesData = [
      "chu_dau_tu",
      "ban_quan_ly",
      "ky_su_giam_sat",
      "chi_huy_truong",
      "doi_truong",
      "ke_toan",
    ];
    for (const r of rolesData) {
      await pool.query(
        "INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [r]
      );
    }

    const defaultRoleRes = await pool.query(
      "SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1"
    );
    const defaultRoleId = defaultRoleRes.rows[0].id;

    const passHash = await argon2.hash("Password123!");

    async function createUser(name, email) {
      const res = await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
         VALUES ($1, $2, $3, $4, false, true)
         RETURNING id`,
        [name, email, passHash, defaultRoleId]
      );
      const userId = res.rows[0].id;

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "Password123!" });
      const cookie = loginRes.headers["set-cookie"];
      return { userId, cookie };
    }

    const uBQL = await createUser("Ban Quản Lý T112", "bql_t112@test.com");
    uBqlId = uBQL.userId;
    cookieBql = uBQL.cookie;

    const uCDT = await createUser("Chủ Đầu Tư T112", "cdt_t112@test.com");
    uCdtId = uCDT.userId;
    cookieCdt = uCDT.cookie;

    const uKSGS = await createUser("Kỹ Sư Giám Sát T112", "ksgs_t112@test.com");
    uKsgsId = uKSGS.userId;
    cookieKsgs = uKSGS.cookie;

    const uDT = await createUser("Đội Trưởng T112", "dt_t112@test.com");
    cookieDoiTruong = uDT.cookie;

    const uOut = await createUser("Người Ngoài Dự Án", "out_t112@test.com");
    cookieOutside = uOut.cookie;

    // 4. Tạo 2 dự án (p1 và p2)
    const p1Res = await pool.query(`
      INSERT INTO projects (name, code, start_date)
      VALUES ('Dự Án T112 Chính', 'PRJ-T112-P1', '2026-10-01')
      RETURNING id
    `);
    p1Id = p1Res.rows[0].id;

    const p2Res = await pool.query(`
      INSERT INTO projects (name, code, start_date)
      VALUES ('Dự Án T112 Khác', 'PRJ-T112-P2', '2026-10-01')
      RETURNING id
    `);
    p2Id = p2Res.rows[0].id;

    // Gán thành viên vào p1
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'ban_quan_ly'),
              ($1, $3, 'chu_dau_tu'),
              ($1, $4, 'ky_su_giam_sat'),
              ($1, $5, 'doi_truong')`,
      [p1Id, uBqlId, uCdtId, uKsgsId, uDT.userId]
    );

    // Gán thành viên vào p2
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'ban_quan_ly')`,
      [p2Id, uBqlId]
    );
  });

  afterAll(async () => {
    await pool.query(`
      TRUNCATE payment_request_lines, payment_request_acceptances, payment_requests,
               acceptance_voucher_photos, acceptance_voucher_items, acceptance_vouchers,
               work_items, project_members, projects, users
      RESTART IDENTITY CASCADE
    `);
  });

  // Helper tạo hạng mục có khối lượng hợp đồng và đơn giá
  async function createWorkItem(projectId, name, price, qty = 1000.0) {
    wiCounter++;
    const res = await pool.query(
      `INSERT INTO work_items (project_id, name, code, quantity, unit, unit_price)
       VALUES ($1, $2, $3, $4, 'm3', $5)
       RETURNING id`,
      [projectId, name, `HM-${wiCounter}`, qty, price]
    );
    return res.rows[0].id;
  }

  // Helper tạo và duyệt phiếu nghiệm thu
  async function createApprovedVoucher(projectId, batchName, reviewedDate, items) {
    const vRes = await pool.query(
      `INSERT INTO acceptance_vouchers (project_id, batch_name, status, created_by)
       VALUES ($1, $2, 'draft', $3)
       RETURNING id`,
      [projectId, batchName, uKsgsId]
    );
    const voucherId = vRes.rows[0].id;

    for (const it of items) {
      const delta = Number(it.delta_quantity);
      const prev = it.prev_approved_cumulative !== undefined ? Number(it.prev_approved_cumulative) : (delta < 0 ? 10.0 : 0);
      const cumulative = it.cumulative_quantity !== undefined ? Number(it.cumulative_quantity) : prev + delta;

      await pool.query(
        `INSERT INTO acceptance_voucher_items (
           voucher_id, work_item_id, cumulative_quantity, prev_approved_cumulative, delta_quantity, unit
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          voucherId,
          it.work_item_id,
          cumulative,
          prev,
          delta,
          it.unit || "m3",
        ]
      );
    }

    await pool.query(
      `UPDATE acceptance_vouchers
       SET status = 'approved', reviewed_by = $2, reviewed_at = $3::timestamptz
       WHERE id = $1`,
      [voucherId, uCdtId, reviewedDate]
    );

    return voucherId;
  }

  describe("1. Tính toán số tiền với đáp án TÍNH TAY viết cứng", () => {
    let voucherExactId;
    let wi1Id;
    let wi2Id;
    let wi3Id;

    beforeAll(async () => {
      // Tạo các hạng mục riêng cho test tính tay
      wi1Id = await createWorkItem(p1Id, "Bê tông móng T112", 1234567.00, 500.0);
      wi2Id = await createWorkItem(p1Id, "Cốt thép T112", 100000.00, 500.0);
      wi3Id = await createWorkItem(p1Id, "Ván khuôn T112", 1000001.00, 500.0);

      // Phiếu chứa đúng 3 ca tính tay theo đề bài:
      // Ca 1: delta = 12.500, price = 1234567.00
      //       12.5 × 1.234.567 = 15.432.087,5 → 15.432.088
      // Ca 2: delta = 3.333, price = 100000.00
      //       3.333 × 100.000 = 333.300 → 333.300
      // Ca 3: delta = -2.500, price = 1000001.00 (ca âm, prev=10, cumulative=7.5 >= 0)
      //       -2.5 × 1.000.001 = -2.500.002,5 → -2.500.003
      // Tổng kỳ vọng tính tay:
      //       15.432.088 + 333.300 - 2.500.003 = 13.265.385
      voucherExactId = await createApprovedVoucher(
        p1Id,
        "Đợt Tính Tay Chính Xác",
        "2026-10-15 10:00:00+07",
        [
          { work_item_id: wi1Id, delta_quantity: 12.500, unit: "m3" },
          { work_item_id: wi2Id, delta_quantity: 3.333, unit: "kg" },
          {
            work_item_id: wi3Id,
            delta_quantity: -2.500,
            prev_approved_cumulative: 10.000,
            cumulative_quantity: 7.500,
            unit: "m2",
          },
        ]
      );
    });

    it("lập đề nghị thanh toán và đối chiếu khớp 100% với đáp án tính tay viết cứng", async () => {
      const res = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          acceptance_ids: [voucherExactId],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("payment_request");
      const pr = res.body.payment_request;

      // Tổng đề nghị = 13265385.00
      expect(pr.total_amount).toBe("13265385.00");
      expect(pr.status).toBe("DRAFT");
      expect(pr.lines).toHaveLength(3);

      // Tìm dòng từng hạng mục và đối chiếu số tiền tính tay
      const line1 = pr.lines.find((l) => l.work_item_id === wi1Id);
      expect(line1).toBeDefined();
      expect(line1.quantity).toBe("12.500");
      expect(line1.unit_price).toBe("1234567.00");
      expect(line1.amount).toBe("15432088.00"); // 12.5 × 1.234.567 = 15.432.087,5 -> 15.432.088

      const line2 = pr.lines.find((l) => l.work_item_id === wi2Id);
      expect(line2).toBeDefined();
      expect(line2.quantity).toBe("3.333");
      expect(line2.unit_price).toBe("100000.00");
      expect(line2.amount).toBe("333300.00"); // 3.333 × 100.000 = 333.300

      const line3 = pr.lines.find((l) => l.work_item_id === wi3Id);
      expect(line3).toBeDefined();
      expect(line3.quantity).toBe("-2.500");
      expect(line3.unit_price).toBe("1000001.00");
      expect(line3.amount).toBe("-2500003.00"); // -2.5 × 1.000.001 = -2.500.002,5 -> -2.500.003
    });
  });

  describe("2. Tổng đề nghị = tổng các dòng (nhiều phiếu, nhiều hạng mục)", () => {
    let vMulti1Id;
    let vMulti2Id;

    beforeAll(async () => {
      const wiM1 = await createWorkItem(p1Id, "HM Nhiều Phiếu 1", 1234567.00, 500.0);
      const wiM2 = await createWorkItem(p1Id, "HM Nhiều Phiếu 2", 100000.00, 500.0);
      const wiM3 = await createWorkItem(p1Id, "HM Nhiều Phiếu 3", 1000001.00, 500.0);

      // Phiếu 1: HM1 = 10.000 (đơn giá 1234567) -> amount = 12345670.00
      vMulti1Id = await createApprovedVoucher(
        p1Id,
        "Đợt Nhiều Phiếu 1",
        "2026-11-05 09:00:00+07",
        [{ work_item_id: wiM1, delta_quantity: 10.000, unit: "m3" }]
      );

      // Phiếu 2: HM2 = 5.000 (đơn giá 100000) -> 500000.00; HM3 = 2.000 (đơn giá 1000001) -> 2000002.00
      vMulti2Id = await createApprovedVoucher(
        p1Id,
        "Đợt Nhiều Phiếu 2",
        "2026-11-10 14:00:00+07",
        [
          { work_item_id: wiM2, delta_quantity: 5.000, unit: "kg" },
          { work_item_id: wiM3, delta_quantity: 2.000, unit: "m2" },
        ]
      );
    });

    it("tự động gom tất cả các phiếu trong kỳ khi không truyền acceptance_ids và tính tổng khớp tuyệt đối", async () => {
      // Tổng kỳ vọng: 12345670 + 500000 + 2000002 = 14845672.00
      const res = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql)
        .send({
          period_start: "2026-11-01",
          period_end: "2026-11-30",
        });

      expect(res.status).toBe(201);
      const pr = res.body.payment_request;
      expect(pr.total_amount).toBe("14845672.00");
      expect(pr.acceptances).toEqual(
        expect.arrayContaining([vMulti1Id, vMulti2Id])
      );
      expect(pr.lines).toHaveLength(3);

      // Kiểm tra tổng các dòng trong CSDL
      const dbSumRes = await pool.query(
        "SELECT SUM(amount)::text as sum_amount FROM payment_request_lines WHERE payment_request_id = $1",
        [pr.id]
      );
      expect(dbSumRes.rows[0].sum_amount).toBe("14845672.00");
    });
  });

  describe("3. Tính toàn vẹn, từ chối và Rollback giao dịch", () => {
    it("từ chối phiếu chưa duyệt (status = 'draft') và không để lại bản ghi dở", async () => {
      const wiDraft = await createWorkItem(p1Id, "HM Draft Test", 50000.00);

      const draftRes = await pool.query(
        `INSERT INTO acceptance_vouchers (project_id, batch_name, status, created_by)
         VALUES ($1, 'Phiếu Draft', 'draft', $2)
         RETURNING id`,
        [p1Id, uKsgsId]
      );
      const draftId = draftRes.rows[0].id;

      await pool.query(
        `INSERT INTO acceptance_voucher_items (voucher_id, work_item_id, cumulative_quantity, prev_approved_cumulative, delta_quantity, unit)
         VALUES ($1, $2, 10, 0, 10, 'm3')`,
        [draftId, wiDraft]
      );

      const countBefore = await pool.query("SELECT COUNT(*)::int as count FROM payment_requests");

      const res = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          acceptance_ids: [draftId],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("chưa được duyệt");

      // Đảm bảo không tạo bản ghi nào trong DB
      const countAfter = await pool.query("SELECT COUNT(*)::int as count FROM payment_requests");
      expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
    });

    it("từ chối khi chứa phiếu của dự án khác và không để lộ dữ liệu dự án khác", async () => {
      // Tạo hạng mục và phiếu thuộc p2
      const wiP2 = await createWorkItem(p2Id, "HM Thuộc Dự Án 2", 100000.00);
      const vP2Id = await createApprovedVoucher(
        p2Id,
        "Phiếu Dự Án 2",
        "2026-10-20 10:00:00+07",
        [{ work_item_id: wiP2, delta_quantity: 10.000, unit: "m3" }]
      );

      const res = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          acceptance_ids: [vP2Id],
        });

      expect(res.status).toBe(400);
      // Thông báo chung, không tiết lộ tên hay id của dự án khác
      expect(res.body.error).toMatch(/không hợp lệ hoặc không thuộc dự án/);
      expect(res.body.error).not.toContain("PRJ-T112-P2");
    });

    it("từ chối khi phiếu đã nằm trong đề nghị khác đang hiệu lực (409 Conflict)", async () => {
      const wiSingle = await createWorkItem(p1Id, "HM Phiếu Đơn", 200000.00);
      const vSingleId = await createApprovedVoucher(
        p1Id,
        "Phiếu Đơn",
        "2026-10-22 10:00:00+07",
        [{ work_item_id: wiSingle, delta_quantity: 1.000, unit: "m3" }]
      );

      // Tạo đề nghị lần 1 thành công
      const res1 = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          acceptance_ids: [vSingleId],
        });
      expect(res1.status).toBe(201);

      // Cố gắng lập đề nghị lần 2 chứa cùng phiếu vSingleId
      const res2 = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          acceptance_ids: [vSingleId],
        });
      expect(res2.status).toBe(409);
      expect(res2.body.error).toContain("đã nằm trong một đề nghị thanh toán khác đang hiệu lực");
    });

    it("từ chối khi hạng mục thiếu đơn giá hợp đồng, nêu danh sách hạng mục thiếu", async () => {
      const wiMissingPrice = await createWorkItem(p1Id, "Hạng mục A Thiếu Giá", 10000.00);
      const vMissingPriceId = await createApprovedVoucher(
        p1Id,
        "Phiếu Thiếu Đơn Giá",
        "2026-10-25 10:00:00+07",
        [{ work_item_id: wiMissingPrice, delta_quantity: 5.000, unit: "m3" }]
      );

      // Tạm thời đặt unit_price = NULL (kèm quantity, unit = NULL theo CHECK all_or_none) trên work_items qua replication_role để kiểm thử nhánh thiếu đơn giá
      const client = await pool.connect();
      try {
        await client.query("SET session_replication_role = 'replica'");
        await client.query("UPDATE work_items SET quantity = NULL, unit = NULL, unit_price = NULL WHERE id = $1", [wiMissingPrice]);
        await client.query("SET session_replication_role = 'origin'");
      } finally {
        client.release();
      }

      const res = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          acceptance_ids: [vMissingPriceId],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Hạng mục thiếu đơn giá hợp đồng");
      expect(res.body.missing_work_items).toContain("Hạng mục A Thiếu Giá");
    });

    it("từ chối khi tổng đề nghị < 0", async () => {
      const wiNeg = await createWorkItem(p1Id, "HM Khối Lượng Âm Lớn", 100000.00);

      // Phiếu có delta âm lớn (prev=200, cumulative=100 -> delta=-100)
      const vNegativeTotalId = await createApprovedVoucher(
        p1Id,
        "Phiếu Tổng Âm",
        "2026-10-28 10:00:00+07",
        [{
          work_item_id: wiNeg,
          delta_quantity: -100.000,
          prev_approved_cumulative: 200.000,
          cumulative_quantity: 100.000,
          unit: "m3",
        }]
      );

      const res = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          acceptance_ids: [vNegativeTotalId],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Tổng giá trị đề nghị thanh toán không được âm");
    });
  });

  describe("4. Phân quyền và Kiểm tra truy cập", () => {
    it("người dùng vai trò ky_su_giam_sat hoặc doi_truong không có quyền lập đề nghị → 403", async () => {
      const resKsgs = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieKsgs)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
        });
      expect(resKsgs.status).toBe(403);

      const resDt = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieDoiTruong)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
        });
      expect(resDt.status).toBe(403);
    });

    it("người dùng ngoài dự án không có quyền truy cập → 403", async () => {
      const resOut = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieOutside)
        .send({
          period_start: "2026-10-01",
          period_end: "2026-10-31",
        });
      expect(resOut.status).toBe(403);
    });
  });

  describe("5. ĐỒNG THỜI (Concurrency): 2 yêu cầu cùng lúc trên 2 kết nối DB riêng", () => {
    it("chạy 20 vòng lặp đồng thời: đúng MỘT yêu cầu thành công (201), một bị từ chối 409", async () => {
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const wiConcur = await createWorkItem(p1Id, `HM Đồng Thời ${i + 1}`, 100000.00);

        const vConcurId = await createApprovedVoucher(
          p1Id,
          `Đợt Đồng Thời #${i + 1}`,
          "2026-12-01 10:00:00+07",
          [{ work_item_id: wiConcur, delta_quantity: 1.000, unit: "m3" }]
        );

        // Bắn 2 request đồng thời qua supertest (tương đương 2 kết nối HTTP/DB riêng biệt)
        const [resA, resB] = await Promise.all([
          request(app)
            .post(`/api/projects/${p1Id}/payment-requests`)
            .set("Cookie", cookieBql)
            .send({
              period_start: "2026-12-01",
              period_end: "2026-12-31",
              acceptance_ids: [vConcurId],
            }),
          request(app)
            .post(`/api/projects/${p1Id}/payment-requests`)
            .set("Cookie", cookieBql)
            .send({
              period_start: "2026-12-01",
              period_end: "2026-12-31",
              acceptance_ids: [vConcurId],
            }),
        ]);

        const statuses = [resA.status, resB.status].sort();
        // Một thành công (201) và một bị xung đột (409)
        expect(statuses).toEqual([201, 409]);

        // Kiểm tra trong DB: phiếu vConcurId chỉ có đúng MỘT liên kết hiệu lực
        const activeLinksRes = await pool.query(
          "SELECT COUNT(*)::int as count FROM payment_request_acceptances WHERE acceptance_id = $1 AND released_at IS NULL",
          [vConcurId]
        );
        expect(activeLinksRes.rows[0].count).toBe(1);
      }
    });
  });

  describe("6. GET danh sách và GET chi tiết đề nghị thanh toán", () => {
    let createdPrId;

    beforeAll(async () => {
      const wiGet = await createWorkItem(p1Id, "HM Dành Cho Xem GET", 250000.00);

      const vGetId = await createApprovedVoucher(
        p1Id,
        "Đợt Dành Cho Xem GET",
        "2026-12-15 10:00:00+07",
        [{ work_item_id: wiGet, delta_quantity: 2.000, unit: "m3" }]
      );

      const createRes = await request(app)
        .post(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql)
        .send({
          period_start: "2026-12-01",
          period_end: "2026-12-31",
          acceptance_ids: [vGetId],
        });
      createdPrId = createRes.body.payment_request.id;
    });

    it("GET danh sách đề nghị của dự án: BQL và CĐT xem được, trả về danh sách hợp lệ", async () => {
      // Ban quản lý xem
      const resBql = await request(app)
        .get(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieBql);
      expect(resBql.status).toBe(200);
      expect(Array.isArray(resBql.body.payment_requests)).toBe(true);
      expect(resBql.body.payment_requests.length).toBeGreaterThan(0);

      // Chủ đầu tư xem
      const resCdt = await request(app)
        .get(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieCdt);
      expect(resCdt.status).toBe(200);

      // Đội trưởng không có quyền xem danh sách đề nghị -> 403
      const resDt = await request(app)
        .get(`/api/projects/${p1Id}/payment-requests`)
        .set("Cookie", cookieDoiTruong);
      expect(resDt.status).toBe(403);
    });

    it("GET chi tiết đề nghị: trả về đầy đủ header, acceptances, lines với số tiền là chuỗi", async () => {
      const res = await request(app)
        .get(`/api/projects/${p1Id}/payment-requests/${createdPrId}`)
        .set("Cookie", cookieCdt);

      expect(res.status).toBe(200);
      const pr = res.body.payment_request;
      expect(pr.id).toBe(createdPrId);
      expect(typeof pr.total_amount).toBe("string");
      expect(Array.isArray(pr.acceptances)).toBe(true);
      expect(Array.isArray(pr.lines)).toBe(true);
      expect(typeof pr.lines[0].amount).toBe("string");
      expect(typeof pr.lines[0].quantity).toBe("string");
      expect(typeof pr.lines[0].unit_price).toBe("string");
    });

    it("GET chi tiết đề nghị không tồn tại hoặc của dự án khác qua URL dự án này trả về 404", async () => {
      // createdPrId thuộc p1, nhưng truy cập qua URL của p2 (bql có quyền truy cập p2, nhưng p2 không có createdPrId)
      const res = await request(app)
        .get(`/api/projects/${p2Id}/payment-requests/${createdPrId}`)
        .set("Cookie", cookieBql);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Không tìm thấy đề nghị thanh toán");
    });
  });
});
