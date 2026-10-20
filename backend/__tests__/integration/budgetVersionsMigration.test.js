"use strict";

const path = require("path");
const fs = require("fs");
const pool = require("../../config/db");
const runner = require("node-pg-migrate").default || require("node-pg-migrate");

describe("T-118: Migration lưu dự toán theo hạng mục lá và phiên bản (S-46)", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    "postgres://postgres:khanhhoa123!@localhost:5432/construction_db_test";

  let testUserId;
  let testProjectId;
  let otherProjectId;
  let parentWorkItemId;
  let leafWorkItemId1;
  let leafWorkItemId2;
  let otherProjectLeafId;

  const projectCode = `PRJ-T118-${Date.now()}`;
  const otherProjectCode = `PRJ-T118-OTHER-${Date.now()}`;

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

    // 2. Tạo role ban_quan_ly nếu chưa có
    const roleRes = await pool.query(`
      SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1
    `);
    const roleId = roleRes.rows[0]?.id || 1;

    // 3. Tạo user kiểm thử
    const userRes = await pool.query(`
      INSERT INTO users (name, email, password_hash, role_id)
      VALUES ('Kỹ sư Quản lý T118', 't118_engineer@test.com', 'dummy_hash', $1)
      ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name, role_id = EXCLUDED.role_id
      RETURNING id
    `, [roleId]);
    testUserId = userRes.rows[0].id;

    // 4. Tạo dự án chính và dự án phụ để test cross-project check
    const projRes = await pool.query(`
      INSERT INTO projects (name, code, start_date)
      VALUES ('Dự án Kiểm thử T-118', $1, '2026-10-01')
      RETURNING id
    `, [projectCode]);
    testProjectId = projRes.rows[0].id;

    const otherProjRes = await pool.query(`
      INSERT INTO projects (name, code, start_date)
      VALUES ('Dự án Khác T-118', $1, '2026-10-01')
      RETURNING id
    `, [otherProjectCode]);
    otherProjectId = otherProjRes.rows[0].id;

    // 5. Tạo cấu trúc cây WBS: Cha -> 2 Con lá
    const parentRes = await pool.query(`
      INSERT INTO work_items (project_id, name)
      VALUES ($1, 'Hạng mục Cha T118 (Phần Thô)')
      RETURNING id
    `, [testProjectId]);
    parentWorkItemId = parentRes.rows[0].id;

    const leaf1Res = await pool.query(`
      INSERT INTO work_items (project_id, parent_id, name)
      VALUES ($1, $2, 'Hạng mục Lá 1: Bê tông móng')
      RETURNING id
    `, [testProjectId, parentWorkItemId]);
    leafWorkItemId1 = leaf1Res.rows[0].id;

    const leaf2Res = await pool.query(`
      INSERT INTO work_items (project_id, parent_id, name)
      VALUES ($1, $2, 'Hạng mục Lá 2: Cốt thép móng')
      RETURNING id
    `, [testProjectId, parentWorkItemId]);
    leafWorkItemId2 = leaf2Res.rows[0].id;

    // Hạng mục lá thuộc dự án khác
    const otherLeafRes = await pool.query(`
      INSERT INTO work_items (project_id, name)
      VALUES ($1, 'Hạng mục lá dự án khác')
      RETURNING id
    `, [otherProjectId]);
    otherProjectLeafId = otherLeafRes.rows[0].id;
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu kiểm thử
    if (testProjectId) {
      await pool.query("DELETE FROM budget_versions WHERE project_id IN ($1, $2)", [
        testProjectId,
        otherProjectId,
      ]).catch(() => {});
      await pool.query("DELETE FROM work_items WHERE project_id IN ($1, $2)", [
        testProjectId,
        otherProjectId,
      ]).catch(() => {});
      await pool.query("DELETE FROM projects WHERE id IN ($1, $2)", [
        testProjectId,
        otherProjectId,
      ]).catch(() => {});
    }
  });

  describe("1. Kiểm tra tĩnh file migration T-118 (NFR & Tiêu chuẩn kiểu dữ liệu)", () => {
    const migrationFile = path.resolve(
      __dirname,
      "../../migrations/1800300000000_create-budget-versions-and-items.js"
    );

    it("File migration T-118 tồn tại", () => {
      expect(fs.existsSync(migrationFile)).toBe(true);
    });

    it("Không dùng kiểu số thực (float, real, double precision, money) mà dùng NUMERIC", () => {
      const content = fs.readFileSync(migrationFile, "utf8");
      expect(content).not.toMatch(/\bfloat\b/i);
      expect(content).not.toMatch(/\breal\b/i);
      expect(content).not.toMatch(/\bdouble\s+precision\b/i);
      expect(content).not.toMatch(/\bmoney\b/i);
      expect(content).toMatch(/numeric\(16,\s*2\)/i);
    });
  });

  describe("2. Kiểm tra ràng buộc phiên bản dự toán (budget_versions)", () => {
    it("Tạo phiên bản v1 hợp lệ thành công", async () => {
      const res = await pool.query(`
        INSERT INTO budget_versions (project_id, version_number, description, created_by)
        VALUES ($1, 1, 'Phiên bản dự toán ban đầu', $2)
        RETURNING id, version_number, description
      `, [testProjectId, testUserId]);

      expect(res.rows[0].version_number).toBe(1);
      expect(res.rows[0].description).toBe("Phiên bản dự toán ban đầu");
    });

    it("Từ chối version_number < 1 (CHECK constraint)", async () => {
      await expect(
        pool.query(`
          INSERT INTO budget_versions (project_id, version_number, created_by)
          VALUES ($1, 0, $2)
        `, [testProjectId, testUserId])
      ).rejects.toThrow(/budget_versions_version_positive/);

      await expect(
        pool.query(`
          INSERT INTO budget_versions (project_id, version_number, created_by)
          VALUES ($1, -1, $2)
        `, [testProjectId, testUserId])
      ).rejects.toThrow(/budget_versions_version_positive/);
    });

    it("Từ chối trùng lặp version_number trong cùng một dự án (UNIQUE constraint)", async () => {
      await expect(
        pool.query(`
          INSERT INTO budget_versions (project_id, version_number, created_by)
          VALUES ($1, 1, $2)
        `, [testProjectId, testUserId])
      ).rejects.toThrow(/budget_versions_project_version_unique/);
    });

    it("Cho phép tạo phiên bản v2 cho dự án và phiên bản v1 cho dự án khác", async () => {
      const v2Res = await pool.query(`
        INSERT INTO budget_versions (project_id, version_number, description, created_by)
        VALUES ($1, 2, 'Phiên bản dự toán điều chỉnh lần 1', $2)
        RETURNING id, version_number
      `, [testProjectId, testUserId]);
      expect(v2Res.rows[0].version_number).toBe(2);

      const otherV1Res = await pool.query(`
        INSERT INTO budget_versions (project_id, version_number, created_by)
        VALUES ($1, 1, $2)
        RETURNING id, version_number
      `, [otherProjectId, testUserId]);
      expect(otherV1Res.rows[0].version_number).toBe(1);
    });
  });

  describe("3. Kiểm tra chi tiết dự toán và ràng buộc hạng mục lá (budget_items)", () => {
    let v1Id;
    let v2Id;

    beforeAll(async () => {
      const r1 = await pool.query(
        "SELECT id FROM budget_versions WHERE project_id = $1 AND version_number = 1",
        [testProjectId]
      );
      v1Id = r1.rows[0].id;

      const r2 = await pool.query(
        "SELECT id FROM budget_versions WHERE project_id = $1 AND version_number = 2",
        [testProjectId]
      );
      v2Id = r2.rows[0].id;
    });

    it("Cho phép nhập số tiền dự toán hợp lệ cho các hạng mục lá", async () => {
      const item1 = await pool.query(`
        INSERT INTO budget_items (budget_version_id, work_item_id, amount, note)
        VALUES ($1, $2, 150000000.50, 'Dự toán bê tông')
        RETURNING id, amount
      `, [v1Id, leafWorkItemId1]);

      expect(parseFloat(item1.rows[0].amount)).toBe(150000000.50);

      const item2 = await pool.query(`
        INSERT INTO budget_items (budget_version_id, work_item_id, amount)
        VALUES ($1, $2, 85000000.00)
        RETURNING id, amount
      `, [v1Id, leafWorkItemId2]);

      expect(parseFloat(item2.rows[0].amount)).toBe(85000000.00);
    });

    it("Chặn nhập dự toán trực tiếp ở hạng mục cha (Leaf Guard Trigger)", async () => {
      let caughtErr;
      try {
        await pool.query(`
          INSERT INTO budget_items (budget_version_id, work_item_id, amount)
          VALUES ($1, $2, 235000000.00)
        `, [v1Id, parentWorkItemId]);
      } catch (err) {
        caughtErr = err;
      }
      expect(caughtErr).toBeDefined();
      expect(caughtErr.message).toMatch(/Chỉ được nhập dự toán cho hạng mục lá/);
      expect(caughtErr.constraint).toBe("budget_items_leaf_only");
    });

    it("Từ chối số tiền dự toán âm (CHECK constraint)", async () => {
      await expect(
        pool.query(`
          INSERT INTO budget_items (budget_version_id, work_item_id, amount)
          VALUES ($1, $2, -50000.00)
        `, [v2Id, leafWorkItemId1])
      ).rejects.toThrow(/budget_items_amount_non_negative/);
    });

    it("Chặn gắn hạng mục của dự án khác vào phiên bản dự toán (Cross-project Guard)", async () => {
      let caughtErr;
      try {
        await pool.query(`
          INSERT INTO budget_items (budget_version_id, work_item_id, amount)
          VALUES ($1, $2, 50000000.00)
        `, [v1Id, otherProjectLeafId]);
      } catch (err) {
        caughtErr = err;
      }
      expect(caughtErr).toBeDefined();
      expect(caughtErr.message).toMatch(/Hạng mục không thuộc dự án của phiên bản dự toán/);
      expect(caughtErr.constraint).toBe("budget_items_project_match");
    });

    it("Chặn trùng lặp hạng mục trong cùng một phiên bản dự toán (UNIQUE constraint)", async () => {
      await expect(
        pool.query(`
          INSERT INTO budget_items (budget_version_id, work_item_id, amount)
          VALUES ($1, $2, 99999999.00)
        `, [v1Id, leafWorkItemId1])
      ).rejects.toThrow(/budget_items_version_work_item_unique/);
    });
  });

  describe("4. Hỗ trợ lịch sử nhiều phiên bản: phiên bản cũ vẫn truy vấn được đầy đủ khi có phiên bản mới", () => {
    it("Phiên bản v2 lưu dự toán đã điều chỉnh, phiên bản cũ v1 vẫn nguyên vẹn", async () => {
      const v1Res = await pool.query(
        "SELECT id FROM budget_versions WHERE project_id = $1 AND version_number = 1",
        [testProjectId]
      );
      const v1Id = v1Res.rows[0].id;

      const v2Res = await pool.query(
        "SELECT id FROM budget_versions WHERE project_id = $1 AND version_number = 2",
        [testProjectId]
      );
      const v2Id = v2Res.rows[0].id;

      // Nhập dự toán cho v2 với số tiền điều chỉnh khác v1
      await pool.query(`
        INSERT INTO budget_items (budget_version_id, work_item_id, amount, note)
        VALUES ($1, $2, 180000000.00, 'Điều chỉnh tăng bê tông')
      `, [v2Id, leafWorkItemId1]);

      await pool.query(`
        INSERT INTO budget_items (budget_version_id, work_item_id, amount, note)
        VALUES ($1, $2, 90000000.00, 'Điều chỉnh tăng thép')
      `, [v2Id, leafWorkItemId2]);

      // Truy vấn kiểm tra phiên bản cũ v1 vẫn giữ nguyên số tiền ban đầu
      const v1Items = await pool.query(`
        SELECT bi.work_item_id, bi.amount
        FROM budget_items bi
        WHERE bi.budget_version_id = $1
        ORDER BY bi.work_item_id
      `, [v1Id]);

      expect(v1Items.rows).toHaveLength(2);
      expect(parseFloat(v1Items.rows[0].amount)).toBe(150000000.50);
      expect(parseFloat(v1Items.rows[1].amount)).toBe(85000000.00);

      // Truy vấn kiểm tra phiên bản mới v2 phản ánh đúng số tiền điều chỉnh
      const v2Items = await pool.query(`
        SELECT bi.work_item_id, bi.amount
        FROM budget_items bi
        WHERE bi.budget_version_id = $1
        ORDER BY bi.work_item_id
      `, [v2Id]);

      expect(v2Items.rows).toHaveLength(2);
      expect(parseFloat(v2Items.rows[0].amount)).toBe(180000000.00);
      expect(parseFloat(v2Items.rows[1].amount)).toBe(90000000.00);
    });
  });

  describe("5. Khả năng chạy Migration Up/Down/Re-Up sạch sẽ", () => {
    it("Migration down và up 1 bước hoạt động chính xác không lỗi", async () => {
      // 1. Chạy down 1 migration (chính là migration tạo budget_versions & budget_items)
      await runner({
        databaseUrl: dbUrl,
        dir: path.resolve(__dirname, "../../migrations"),
        direction: "down",
        migrationsTable: "pgmigrations",
        count: 1,
        checkOrder: false,
        log: () => {},
      });

      // Kiểm tra bảng budget_items và budget_versions không còn tồn tại
      const tablesAfterDown = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('budget_versions', 'budget_items')
      `);
      expect(tablesAfterDown.rows).toHaveLength(0);

      // 2. Chạy up lại 1 migration
      await runner({
        databaseUrl: dbUrl,
        dir: path.resolve(__dirname, "../../migrations"),
        direction: "up",
        migrationsTable: "pgmigrations",
        count: 1,
        checkOrder: false,
        log: () => {},
      });

      // Kiểm tra bảng đã được tạo lại sạch sẽ
      const tablesAfterReUp = await pool.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('budget_versions', 'budget_items')
      `);
      expect(tablesAfterReUp.rows).toHaveLength(2);
    });
  });
});
