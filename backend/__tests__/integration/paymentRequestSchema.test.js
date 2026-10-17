"use strict";

const path = require("path");
const pool = require("../../config/db");
const runner = require("node-pg-migrate").default || require("node-pg-migrate");

describe("T-111: Thiết kế dữ liệu đề nghị thanh toán và chi tiết (S-43)", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    "postgres://postgres:khanhhoa123!@localhost:5432/construction_db_test";

  let testUserId;
  let testProjectId;
  let testWorkItemId;
  let testAcceptanceId1;
  let testAcceptanceId2;
  const projectCode = `PRJ-T111-${Date.now()}`;

  beforeAll(async () => {
    // Đảm bảo toàn bộ migration up đã chạy
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "../../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      checkOrder: false,
      log: () => {},
    });

    // Lấy hoặc tạo role ban_quan_ly
    const roleRes = await pool.query(`
      SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1
    `);
    const roleId = roleRes.rows[0]?.id || 1;

    // Tạo user kiểm thử
    const userRes = await pool.query(`
      INSERT INTO users (name, email, password_hash, role_id)
      VALUES ('Test Engineer T111', 't111_engineer@test.com', 'dummy_hash', $1)
      ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name, role_id = EXCLUDED.role_id
      RETURNING id
    `, [roleId]);
    testUserId = userRes.rows[0].id;

    // Tạo dự án kiểm thử
    const projRes = await pool.query(`
      INSERT INTO projects (name, code, start_date)
      VALUES ('Dự án Kiểm thử T-111', $1, '2026-10-01')
      RETURNING id
    `, [projectCode]);
    testProjectId = projRes.rows[0].id;

    // Tạo hạng mục công việc kiểm thử (work_items) có khối lượng hợp đồng = 100.000
    const wiRes = await pool.query(`
      INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
      VALUES ($1, 'Hạng mục móng T111', 100.000, 'm3', 2500000.00)
      RETURNING id
    `, [testProjectId]);
    testWorkItemId = wiRes.rows[0].id;

    // Tạo phiếu nghiệm thu 1 ở trạng thái draft
    const acc1 = await pool.query(`
      INSERT INTO acceptance_vouchers (
        project_id, batch_name, status, created_by
      ) VALUES ($1, 'Nghiệm thu đợt 1', 'draft', $2)
      RETURNING id
    `, [testProjectId, testUserId]);
    testAcceptanceId1 = acc1.rows[0].id;

    // Tạo phiếu nghiệm thu 2 ở trạng thái draft
    const acc2 = await pool.query(`
      INSERT INTO acceptance_vouchers (
        project_id, batch_name, status, created_by
      ) VALUES ($1, 'Nghiệm thu đợt 2', 'draft', $2)
      RETURNING id
    `, [testProjectId, testUserId]);
    testAcceptanceId2 = acc2.rows[0].id;

    // Gắn chi tiết cho phiếu 1 (50.000 m3 <= 100.000 m3 hợp đồng)
    await pool.query(`
      INSERT INTO acceptance_voucher_items (
        voucher_id, work_item_id, cumulative_quantity, prev_approved_cumulative, delta_quantity, unit
      ) VALUES ($1, $2, 50.000, 0.000, 50.000, 'm3')
    `, [testAcceptanceId1, testWorkItemId]);

    // Gắn chi tiết cho phiếu 2 (80.000 m3 luỹ kế, delta 30.000 m3)
    await pool.query(`
      INSERT INTO acceptance_voucher_items (
        voucher_id, work_item_id, cumulative_quantity, prev_approved_cumulative, delta_quantity, unit
      ) VALUES ($1, $2, 80.000, 50.000, 30.000, 'm3')
    `, [testAcceptanceId2, testWorkItemId]);
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu kiểm thử theo đúng thứ tự khóa ngoại
    await pool.query("DELETE FROM payment_request_lines");
    await pool.query("DELETE FROM payment_request_acceptances");
    await pool.query("DELETE FROM payment_requests WHERE project_id = $1", [testProjectId]);
    await pool.query("DELETE FROM acceptance_voucher_items WHERE voucher_id = ANY($1::int[])", [
      [testAcceptanceId1, testAcceptanceId2],
    ]);
    await pool.query("DELETE FROM acceptance_vouchers WHERE id = ANY($1::int[])", [
      [testAcceptanceId1, testAcceptanceId2],
    ]);
    await pool.query("DELETE FROM work_items WHERE id = $1", [testWorkItemId]);
    await pool.query("DELETE FROM projects WHERE id = $1", [testProjectId]);
    await pool.query("DELETE FROM users WHERE id = $1", [testUserId]);
  });

  describe("1. Kiểm tra vòng đời Migration (up → down → up)", () => {
    it("chạy rollback (down 1) và re-apply (up 1) sạch sẽ mà không gặp lỗi", async () => {
      // Rollback migration T-111
      await expect(
        runner({
          databaseUrl: dbUrl,
          dir: path.resolve(__dirname, "../../migrations"),
          direction: "down",
          migrationsTable: "pgmigrations",
          count: 1,
          checkOrder: false,
          log: () => {},
        })
      ).resolves.not.toThrow();

      // Kiểm tra các bảng đã bị xoá
      const checkTables = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('payment_requests', 'payment_request_acceptances', 'payment_request_lines')
      `);
      expect(checkTables.rows).toHaveLength(0);

      // Re-apply migration T-111
      await expect(
        runner({
          databaseUrl: dbUrl,
          dir: path.resolve(__dirname, "../../migrations"),
          direction: "up",
          migrationsTable: "pgmigrations",
          count: 1,
          checkOrder: false,
          log: () => {},
        })
      ).resolves.not.toThrow();

      // Kiểm tra các bảng đã được tạo lại đầy đủ
      const verifyTables = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('payment_requests', 'payment_request_acceptances', 'payment_request_lines')
        ORDER BY table_name
      `);
      expect(verifyTables.rows.map((r) => r.table_name)).toEqual([
        "payment_request_acceptances",
        "payment_request_lines",
        "payment_requests",
      ]);
    });
  });

  describe("2. Ràng buộc payment_requests: period_end, status và total_amount", () => {
    it("từ chối khi period_end < period_start", async () => {
      await expect(
        pool.query(`
          INSERT INTO payment_requests (
            project_id, period_start, period_end, status, total_amount, created_by
          ) VALUES ($1, '2026-10-15', '2026-10-10', 'DRAFT', 1000000, $2)
        `, [testProjectId, testUserId])
      ).rejects.toThrow(/payment_requests_period_check/);
    });

    it("từ chối khi status nằm ngoài danh sách ('DRAFT', 'APPROVED', 'RETURNED')", async () => {
      await expect(
        pool.query(`
          INSERT INTO payment_requests (
            project_id, period_start, period_end, status, total_amount, created_by
          ) VALUES ($1, '2026-10-01', '2026-10-15', 'INVALID_STATUS', 1000000, $2)
        `, [testProjectId, testUserId])
      ).rejects.toThrow(/payment_requests_status_check/);
    });

    it("chấp nhận các trạng thái hợp lệ 'DRAFT', 'APPROVED', 'RETURNED'", async () => {
      const statuses = ["DRAFT", "APPROVED", "RETURNED"];
      for (const st of statuses) {
        const res = await pool.query(`
          INSERT INTO payment_requests (
            project_id, period_start, period_end, status, total_amount, created_by
          ) VALUES ($1, '2026-10-01', '2026-10-15', $2, 0, $3)
          RETURNING id, status
        `, [testProjectId, st, testUserId]);
        expect(res.rows[0].status).toBe(st);

        await pool.query("DELETE FROM payment_requests WHERE id = $1", [res.rows[0].id]);
      }
    });

    it("từ chối khi total_amount < 0", async () => {
      await expect(
        pool.query(`
          INSERT INTO payment_requests (
            project_id, period_start, period_end, status, total_amount, created_by
          ) VALUES ($1, '2026-10-01', '2026-10-15', 'DRAFT', -100, $2)
        `, [testProjectId, testUserId])
      ).rejects.toThrow(/payment_requests_total_amount_check/);
    });
  });

  describe("3. Ràng buộc payment_request_acceptances: Partial Unique Index", () => {
    let reqId1;
    let reqId2;

    beforeEach(async () => {
      await pool.query("DELETE FROM payment_request_lines");
      await pool.query("DELETE FROM payment_request_acceptances");
      await pool.query("DELETE FROM payment_requests WHERE project_id = $1", [testProjectId]);

      const r1 = await pool.query(`
        INSERT INTO payment_requests (
          project_id, period_start, period_end, status, total_amount, created_by
        ) VALUES ($1, '2026-10-01', '2026-10-15', 'DRAFT', 10000000, $2)
        RETURNING id
      `, [testProjectId, testUserId]);
      reqId1 = r1.rows[0].id;

      const r2 = await pool.query(`
        INSERT INTO payment_requests (
          project_id, period_start, period_end, status, total_amount, created_by
        ) VALUES ($1, '2026-10-16', '2026-10-31', 'DRAFT', 5000000, $2)
        RETURNING id
      `, [testProjectId, testUserId]);
      reqId2 = r2.rows[0].id;
    });

    it("gán cùng một phiếu vào hai đề nghị đang hiệu lực (released_at IS NULL) → DB từ chối", async () => {
      // Gán phiếu vào đề nghị 1 thành công
      await pool.query(`
        INSERT INTO payment_request_acceptances (payment_request_id, acceptance_id, released_at)
        VALUES ($1, $2, NULL)
      `, [reqId1, testAcceptanceId1]);

      // Cố gắng gán cùng phiếu 1 vào đề nghị 2 khi chưa release → DB từ chối bởi partial unique index
      await expect(
        pool.query(`
          INSERT INTO payment_request_acceptances (payment_request_id, acceptance_id, released_at)
          VALUES ($1, $2, NULL)
        `, [reqId2, testAcceptanceId1])
      ).rejects.toThrow(/payment_request_acceptances_active_acceptance_unique/);
    });

    it("đặt released_at cho liên kết cũ → phiếu gán được vào đề nghị khác thành công", async () => {
      // Gán phiếu vào đề nghị 1
      const link1 = await pool.query(`
        INSERT INTO payment_request_acceptances (payment_request_id, acceptance_id, released_at)
        VALUES ($1, $2, NULL)
        RETURNING id
      `, [reqId1, testAcceptanceId1]);

      // Release liên kết cũ (khi đề nghị 1 bị RETURNED)
      await pool.query(`
        UPDATE payment_request_acceptances
        SET released_at = NOW()
        WHERE id = $1
      `, [link1.rows[0].id]);

      // Giờ có thể gán phiếu 1 vào đề nghị 2 thành công
      const link2 = await pool.query(`
        INSERT INTO payment_request_acceptances (payment_request_id, acceptance_id, released_at)
        VALUES ($1, $2, NULL)
        RETURNING id, payment_request_id, acceptance_id
      `, [reqId2, testAcceptanceId1]);

      expect(link2.rows[0].payment_request_id).toBe(reqId2);
      expect(link2.rows[0].acceptance_id).toBe(testAcceptanceId1);
    });

    it("từ chối gán trùng cùng 1 cặp (payment_request_id, acceptance_id) kể cả khi có released_at", async () => {
      await pool.query(`
        INSERT INTO payment_request_acceptances (payment_request_id, acceptance_id, released_at)
        VALUES ($1, $2, NOW())
      `, [reqId1, testAcceptanceId1]);

      await expect(
        pool.query(`
          INSERT INTO payment_request_acceptances (payment_request_id, acceptance_id, released_at)
          VALUES ($1, $2, NULL)
        `, [reqId1, testAcceptanceId1])
      ).rejects.toThrow(/payment_request_acceptances_request_acceptance_unique/);
    });
  });

  describe("4. Ràng buộc payment_request_lines: FK ghép và CHECK amount = ROUND(quantity * unit_price, 0)", () => {
    let reqId;

    beforeEach(async () => {
      await pool.query("DELETE FROM payment_request_lines");
      await pool.query("DELETE FROM payment_request_acceptances");
      await pool.query("DELETE FROM payment_requests WHERE project_id = $1", [testProjectId]);

      const r = await pool.query(`
        INSERT INTO payment_requests (
          project_id, period_start, period_end, status, total_amount, created_by
        ) VALUES ($1, '2026-10-01', '2026-10-15', 'DRAFT', 125000000, $2)
        RETURNING id
      `, [testProjectId, testUserId]);
      reqId = r.rows[0].id;

      // Liên kết chỉ testAcceptanceId1 vào reqId
      await pool.query(`
        INSERT INTO payment_request_acceptances (payment_request_id, acceptance_id)
        VALUES ($1, $2)
      `, [reqId, testAcceptanceId1]);
    });

    it("chèn dòng cho phiếu không thuộc đề nghị → bị từ chối bởi FK ghép", async () => {
      // testAcceptanceId2 CHƯA được gán vào reqId trong payment_request_acceptances
      await expect(
        pool.query(`
          INSERT INTO payment_request_lines (
            payment_request_id, acceptance_id, work_item_id, quantity, unit_price, amount
          ) VALUES ($1, $2, $3, 10.000, 2500000.00, 25000000.00)
        `, [reqId, testAcceptanceId2, testWorkItemId])
      ).rejects.toThrow(/payment_request_lines_request_acceptance_fk/);
    });

    it("chèn dòng có amount không khớp ROUND(quantity * unit_price, 0) → bị từ chối", async () => {
      // quantity = 10.000, unit_price = 2500000.00 -> amount đúng phải là 25000000.00
      // Cố tình truyền 25000001.00
      await expect(
        pool.query(`
          INSERT INTO payment_request_lines (
            payment_request_id, acceptance_id, work_item_id, quantity, unit_price, amount
          ) VALUES ($1, $2, $3, 10.000, 2500000.00, 25000001.00)
        `, [reqId, testAcceptanceId1, testWorkItemId])
      ).rejects.toThrow(/payment_request_lines_amount_round_check/);
    });

    it("chèn dòng có amount khớp chuẩn xác ROUND(quantity * unit_price, 0) theo quy tắc half-up → thành công", async () => {
      // Test số lẻ làm tròn: quantity = 3.333, unit_price = 100.50
      // 3.333 * 100.50 = 334.9665 -> ROUND(..., 0) = 335.00
      const lineRes = await pool.query(`
        INSERT INTO payment_request_lines (
          payment_request_id, acceptance_id, work_item_id, quantity, unit_price, amount
        ) VALUES ($1, $2, $3, 3.333, 100.50, 335.00)
        RETURNING id, amount
      `, [reqId, testAcceptanceId1, testWorkItemId]);

      expect(parseFloat(lineRes.rows[0].amount)).toBe(335);
    });

    it("hỗ trợ dòng âm (khối lượng đợt âm theo quy tắc S-43) với amount âm làm tròn chuẩn", async () => {
      // quantity = -2.500, unit_price = 1000.00 -> amount = -2500.00
      const negLine = await pool.query(`
        INSERT INTO payment_request_lines (
          payment_request_id, acceptance_id, work_item_id, quantity, unit_price, amount
        ) VALUES ($1, $2, $3, -2.500, 1000.00, -2500.00)
        RETURNING id, amount
      `, [reqId, testAcceptanceId1, testWorkItemId]);

      expect(parseFloat(negLine.rows[0].amount)).toBe(-2500);
    });

    it("từ chối khi unit_price < 0", async () => {
      await expect(
        pool.query(`
          INSERT INTO payment_request_lines (
            payment_request_id, acceptance_id, work_item_id, quantity, unit_price, amount
          ) VALUES ($1, $2, $3, 10.000, -500.00, -5000.00)
        `, [reqId, testAcceptanceId1, testWorkItemId])
      ).rejects.toThrow(/payment_request_lines_unit_price_check/);
    });
  });

  describe("5. Ràng buộc toàn vẹn ON DELETE RESTRICT", () => {
    let reqId;

    beforeEach(async () => {
      await pool.query("DELETE FROM payment_request_lines");
      await pool.query("DELETE FROM payment_request_acceptances");
      await pool.query("DELETE FROM payment_requests WHERE project_id = $1", [testProjectId]);

      const r = await pool.query(`
        INSERT INTO payment_requests (
          project_id, period_start, period_end, status, total_amount, created_by
        ) VALUES ($1, '2026-10-01', '2026-10-15', 'DRAFT', 25000000, $2)
        RETURNING id
      `, [testProjectId, testUserId]);
      reqId = r.rows[0].id;

      await pool.query(`
        INSERT INTO payment_request_acceptances (payment_request_id, acceptance_id)
        VALUES ($1, $2)
      `, [reqId, testAcceptanceId1]);

      await pool.query(`
        INSERT INTO payment_request_lines (
          payment_request_id, acceptance_id, work_item_id, quantity, unit_price, amount
        ) VALUES ($1, $2, $3, 10.000, 2500000.00, 25000000.00)
      `, [reqId, testAcceptanceId1, testWorkItemId]);
    });

    it("không cho phép xoá payment_requests khi đang có payment_request_acceptances (ON DELETE RESTRICT)", async () => {
      await expect(
        pool.query("DELETE FROM payment_requests WHERE id = $1", [reqId])
      ).rejects.toThrow();
    });

    it("không cho phép xoá payment_request_acceptances khi đang có payment_request_lines (ON DELETE RESTRICT)", async () => {
      await expect(
        pool.query(
          "DELETE FROM payment_request_acceptances WHERE payment_request_id = $1 AND acceptance_id = $2",
          [reqId, testAcceptanceId1]
        )
      ).rejects.toThrow();
    });

    it("không cho phép xoá acceptance_vouchers khi đang nằm trong payment_request_acceptances", async () => {
      await expect(
        pool.query("DELETE FROM acceptance_vouchers WHERE id = $1", [testAcceptanceId1])
      ).rejects.toThrow();
    });

    it("không cho phép xoá work_items khi đang nằm trong payment_request_lines", async () => {
      await expect(
        pool.query("DELETE FROM work_items WHERE id = $1", [testWorkItemId])
      ).rejects.toThrow();
    });
  });
});
