"use strict";

const path = require("path");
const { URL } = require("url");
const { Pool } = require("pg");
const pool = require("../../config/db");
const runner = require("node-pg-migrate").default || require("node-pg-migrate");
const request = require("supertest");
const app = require("../../app");

describe("T-85: Thiết kế cấu trúc khối lượng và đơn giá hợp đồng (work_items)", () => {
  let projectId;
  let workItemId;
  let adminCookie;

  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    "postgres://postgres:postgres123@localhost:5434/construction_db_test";

  beforeAll(async () => {
    // Chạy migration up để đảm bảo schema mới nhất
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "../../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      log: () => {},
    });

    // Dọn dẹp dữ liệu bảng liên quan
    await pool.query(
      "TRUNCATE users, roles, projects, project_members, work_items, tasks RESTART IDENTITY CASCADE"
    );

    // Tạo roles nếu chưa có
    const rolesRes = await pool.query(`
      INSERT INTO roles (name)
      VALUES ('ban_quan_ly'), ('chu_dau_tu'), ('doi_truong')
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name
    `);
    const bqlRole = rolesRes.rows.find((r) => r.name === "ban_quan_ly") || rolesRes.rows[0];

    // Tạo user ban_quan_ly
    await request(app)
      .post("/api/auth/register")
      .send({
        name: "Admin BQL",
        email: "bql_t85@example.com",
        password: "Password123",
        confirmPassword: "Password123",
      });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({
        email: "bql_t85@example.com",
        password: "Password123",
      });
    adminCookie = loginRes.headers["set-cookie"];

    const uRes = await pool.query(
      "SELECT id FROM users WHERE email = 'bql_t85@example.com'"
    );
    const userId = uRes.rows[0].id;
    await pool.query("UPDATE users SET role_id = $1 WHERE id = $2", [
      bqlRole.id,
      userId,
    ]);

    // Tạo dự án
    const projRes = await pool.query(`
      INSERT INTO projects (name, code, start_date)
      VALUES ('Dự án T-85 Hợp Đồng', 'PRJ-T85', '2026-10-01')
      RETURNING id
    `);
    projectId = projRes.rows[0].id;

    await pool.query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES ($1, $2, 'ban_quan_ly')
    `, [projectId, userId]);

    // Tạo work_item mẫu
    const wiRes = await pool.query(`
      INSERT INTO work_items (project_id, name)
      VALUES ($1, 'Hạng mục kiểm thử T-85')
      RETURNING id
    `, [projectId]);
    workItemId = wiRes.rows[0].id;
  });

  afterAll(async () => {
    // Đảm bảo migration kết thúc ở trạng thái migrated up
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "../../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      log: () => {},
    });
    await pool.end();
  });

  describe("1. Kiểm tra cấu trúc bảng work_items trong pg_catalog và information_schema", () => {
    it("Các cột quantity, unit, unit_price, contract_value có đúng kiểu dữ liệu, nullability và không dùng float/money", async () => {
      const { rows } = await pool.query(`
        SELECT column_name, data_type, numeric_precision, numeric_scale, character_maximum_length, is_nullable, is_generated
        FROM information_schema.columns
        WHERE table_name = 'work_items'
          AND column_name IN ('quantity', 'unit', 'unit_price', 'contract_value')
        ORDER BY column_name
      `);

      expect(rows).toHaveLength(4);
      const colMap = {};
      rows.forEach((r) => {
        colMap[r.column_name] = r;
      });

      // quantity numeric(14,3) NULL
      expect(colMap.quantity).toBeDefined();
      expect(colMap.quantity.data_type).toBe("numeric");
      expect(colMap.quantity.numeric_precision).toBe(14);
      expect(colMap.quantity.numeric_scale).toBe(3);
      expect(colMap.quantity.is_nullable).toBe("YES");

      // unit varchar(30) NULL
      expect(colMap.unit).toBeDefined();
      expect(colMap.unit.data_type).toBe("character varying");
      expect(colMap.unit.character_maximum_length).toBe(30);
      expect(colMap.unit.is_nullable).toBe("YES");

      // unit_price numeric(16,2) NULL
      expect(colMap.unit_price).toBeDefined();
      expect(colMap.unit_price.data_type).toBe("numeric");
      expect(colMap.unit_price.numeric_precision).toBe(16);
      expect(colMap.unit_price.numeric_scale).toBe(2);
      expect(colMap.unit_price.is_nullable).toBe("YES");

      // contract_value numeric(30,2) GENERATED ALWAYS AS STORED
      expect(colMap.contract_value).toBeDefined();
      expect(colMap.contract_value.data_type).toBe("numeric");
      expect(colMap.contract_value.numeric_precision).toBe(30);
      expect(colMap.contract_value.numeric_scale).toBe(2);
      expect(colMap.contract_value.is_generated).toBe("ALWAYS");

      // Khẳng định KHÔNG có cột nào mang kiểu float, double, real, money
      const allCols = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'work_items'
          AND data_type IN ('real', 'double precision', 'money', 'float')
      `);
      expect(allCols.rows).toHaveLength(0);
    });
  });

  describe("2. Hàng cũ: tạo hạng mục không truyền giá trị hợp đồng thì cả 4 cột là NULL", () => {
    it("Hạng mục chèn trước đó hoặc không truyền giá trị có quantity, unit, unit_price, contract_value đều NULL", async () => {
      const res = await pool.query(`
        SELECT quantity, unit, unit_price, contract_value
        FROM work_items
        WHERE id = $1
      `, [workItemId]);

      expect(res.rows[0].quantity).toBeNull();
      expect(res.rows[0].unit).toBeNull();
      expect(res.rows[0].unit_price).toBeNull();
      expect(res.rows[0].contract_value).toBeNull();
    });
  });

  describe("3. Độ chính xác số học (NUMERIC) và làm tròn contract_value", () => {
    const testCases = [
      { q: "1234.567", u: "m3", p: "89000.50", expectedVal: "109877080.28" },
      { q: "2.675", u: "m2", p: "1.00", expectedVal: "2.68" },
      { q: "1.005", u: "tấn", p: "1.00", expectedVal: "1.01" },
      { q: "0.100", u: "m", p: "0.20", expectedVal: "0.02" },
      { q: "333.333", u: "bộ", p: "3.00", expectedVal: "1000.00" },
      { q: "0.001", u: "kg", p: "0.01", expectedVal: "0.00" },
      {
        q: "99999999999.999",
        u: "gói",
        p: "99999999999999.99",
        expectedVal: "9999999999999899000000000.00",
      },
    ];

    testCases.forEach(({ q, u, p, expectedVal }, idx) => {
      it(`Cặp dữ liệu chuẩn xác #${idx + 1}: q=${q}, p=${p} -> contract_value="${expectedVal}"`, async () => {
        const ins = await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING quantity, unit, unit_price, contract_value
        `, [projectId, `HM Chính Xác ${idx}`, q, u, p]);

        const row = ins.rows[0];
        expect(row.contract_value).toBe(expectedVal);
        expect(row.unit).toBe(u);
      });
    });

    it("Cộng dồn SQL: 10 hạng mục lá mỗi cái 0.100 x 0.10 (mỗi lá 0.01) -> SUM là '0.10'", async () => {
      const tenProj = await pool.query(`
        INSERT INTO projects (name, code)
        VALUES ('Dự án Sum 10', 'PRJ-SUM10')
        RETURNING id
      `);
      const sumPid = tenProj.rows[0].id;

      for (let i = 0; i < 10; i++) {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, $2, '0.100', 'm3', '0.10')
        `, [sumPid, `Lá ${i}`]);
      }

      const sumRes = await pool.query(`
        SELECT SUM(contract_value)::text AS total_val
        FROM work_items
        WHERE project_id = $1
      `, [sumPid]);

      expect(sumRes.rows[0].total_val).toBe("0.10");
    });

    it("SUM của 3 lá NUMERIC có giá trị 0.1, 0.2, 0.3 khớp tuyệt đối '0.6' (không sai số binary float)", async () => {
      const threeProj = await pool.query(`
        INSERT INTO projects (name, code)
        VALUES ('Dự án 0.1 0.2 0.3', 'PRJ-SUM3')
        RETURNING id
      `);
      const pid = threeProj.rows[0].id;

      await pool.query(`INSERT INTO work_items (project_id, name, quantity, unit, unit_price) VALUES ($1, 'Lá 1', '1.000', 'cái', '0.10')`, [pid]);
      await pool.query(`INSERT INTO work_items (project_id, name, quantity, unit, unit_price) VALUES ($1, 'Lá 2', '1.000', 'cái', '0.20')`, [pid]);
      await pool.query(`INSERT INTO work_items (project_id, name, quantity, unit, unit_price) VALUES ($1, 'Lá 3', '1.000', 'cái', '0.30')`, [pid]);

      const sumRes = await pool.query(`
        SELECT SUM(contract_value)::text AS total_val
        FROM work_items
        WHERE project_id = $1
      `, [pid]);

      expect(sumRes.rows[0].total_val).toBe("0.60");
    });
  });

  describe("4. Chặn dữ liệu sai ở tầng cơ sở dữ liệu (mã lỗi Postgres)", () => {
    it("Từ chối quantity âm (23514 check_violation, work_items_quantity_non_negative)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, 'HM quantity âm', -1, 'm3', 100)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_quantity_non_negative");
    });

    it("Từ chối unit_price âm (23514 check_violation, work_items_unit_price_non_negative)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, 'HM price âm', 10, 'm3', -50)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_unit_price_non_negative");
    });

    it("Từ chối unit rỗng '' (23514, work_items_unit_trimmed_not_empty)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, 'HM unit rỗng', 10, '', 100)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_unit_trimmed_not_empty");
    });

    it("Từ chối unit chỉ chứa khoảng trắng (23514, work_items_unit_trimmed_not_empty)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, 'HM unit khoảng trắng', 10, '   ', 100)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_unit_trimmed_not_empty");
    });

    it("Từ chối unit có khoảng trắng đầu hoặc cuối (23514, work_items_unit_trimmed_not_empty)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, 'HM unit chưa trim', 10, ' m3 ', 100)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_unit_trimmed_not_empty");
    });

    it("Từ chối unit dài hơn 30 ký tự (22001 string_data_right_truncation)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, 'HM unit dài', 10, '1234567890123456789012345678901', 100)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("22001");
    });

    it("Từ chối quantity vượt kiểu numeric(14,3) - 10^11 trở lên (22003 numeric_value_out_of_range)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, 'HM tràn quantity', 100000000000000, 'm3', 100)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("22003");
    });

    it("Từ chối unit_price vượt kiểu numeric(16,2) - 10^15 trở lên (22003 numeric_value_out_of_range)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
          VALUES ($1, 'HM tràn price', 10, 'm3', 1000000000000000)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("22003");
    });
  });

  describe("5. Ràng buộc all-or-none: cả ba cột cùng NULL hoặc cùng NOT NULL", () => {
    it("Từ chối khi chỉ có quantity (23514, work_items_contract_all_or_none)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity)
          VALUES ($1, 'Chỉ quantity', 10)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_contract_all_or_none");
    });

    it("Từ chối khi chỉ có unit (23514, work_items_contract_all_or_none)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, unit)
          VALUES ($1, 'Chỉ unit', 'm3')
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_contract_all_or_none");
    });

    it("Từ chối khi chỉ có unit_price (23514, work_items_contract_all_or_none)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, unit_price)
          VALUES ($1, 'Chỉ price', 500)
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_contract_all_or_none");
    });

    it("Từ chối khi có quantity và unit nhưng thiếu unit_price (23514, work_items_contract_all_or_none)", async () => {
      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit)
          VALUES ($1, 'Thiếu price', 10, 'm3')
        `, [projectId]);
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_contract_all_or_none");
    });

    it("Chấp nhận khi đủ cả 3 cột", async () => {
      const res = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Đủ cả 3', 10, 'm3', 500)
        RETURNING id, quantity, unit, unit_price
      `, [projectId]);
      expect(res.rows[0].quantity).toBe("10.000");
      expect(res.rows[0].unit).toBe("m3");
      expect(res.rows[0].unit_price).toBe("500.00");
    });

    it("Chấp nhận khi cả 3 cột đều NULL", async () => {
      const res = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Cả 3 NULL', NULL, NULL, NULL)
        RETURNING id, quantity, unit, unit_price
      `, [projectId]);
      expect(res.rows[0].quantity).toBeNull();
      expect(res.rows[0].unit).toBeNull();
      expect(res.rows[0].unit_price).toBeNull();
    });

    it("Cập nhật từ có giá trị về cả 3 NULL thành công", async () => {
      const ins = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Sẽ reset về null', 10, 'm3', 500)
        RETURNING id
      `, [projectId]);
      const id = ins.rows[0].id;

      const upd = await pool.query(`
        UPDATE work_items
        SET quantity = NULL, unit = NULL, unit_price = NULL
        WHERE id = $1
        RETURNING quantity, unit, unit_price, contract_value
      `, [id]);

      expect(upd.rows[0].quantity).toBeNull();
      expect(upd.rows[0].unit).toBeNull();
      expect(upd.rows[0].unit_price).toBeNull();
      expect(upd.rows[0].contract_value).toBeNull();
    });
  });

  describe("6. Cột sinh contract_value", () => {
    it("contract_value tự động cập nhật khi đổi quantity hoặc unit_price", async () => {
      const ins = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'HM cập nhật', 10, 'm3', 100)
        RETURNING id, contract_value
      `, [projectId]);
      const id = ins.rows[0].id;
      expect(ins.rows[0].contract_value).toBe("1000.00");

      const upd = await pool.query(`
        UPDATE work_items
        SET quantity = 15, unit_price = 200
        WHERE id = $1
        RETURNING contract_value
      `, [id]);
      expect(upd.rows[0].contract_value).toBe("3000.00");
    });

    it("Từ chối INSERT hoặc UPDATE trực tiếp vào contract_value (428C9 cannot insert into generated column)", async () => {
      let insErr;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, name, quantity, unit, unit_price, contract_value)
          VALUES ($1, 'Ghi đè contract_value', 10, 'm3', 100, 9999)
        `, [projectId]);
      } catch (e) {
        insErr = e;
      }
      expect(insErr).toBeDefined();
      expect(insErr.code).toBe("428C9");

      const insOk = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Tạo hợp lệ', 10, 'm3', 100)
        RETURNING id
      `, [projectId]);
      const id = insOk.rows[0].id;

      let updErr;
      try {
        await pool.query(`
          UPDATE work_items
          SET contract_value = 500
          WHERE id = $1
        `, [id]);
      } catch (e) {
        updErr = e;
      }
      expect(updErr).toBeDefined();
      expect(updErr.code).toBe("428C9");
    });
  });

  describe("7. Làm tròn im lặng ở Postgres: ghi nhận hành vi", () => {
    it("quantity 1.0005 tự làm tròn thành '1.001', unit_price 0.005 tự làm tròn thành '0.01'", async () => {
      const res = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Làm tròn im lặng', 1.0005, 'cái', 0.005)
        RETURNING quantity, unit_price
      `, [projectId]);

      expect(res.rows[0].quantity).toBe("1.001");
      expect(res.rows[0].unit_price).toBe("0.01");
    });
  });

  describe("8. Trigger chặn hạng mục cha giữ giá trị (Phần B)", () => {
    it("Đặt giá trị cho hạng mục đã có con -> vi phạm (23514, work_items_contract_leaf_only)", async () => {
      const parentRes = await pool.query(`
        INSERT INTO work_items (project_id, name)
        VALUES ($1, 'Cha chưa có con')
        RETURNING id
      `, [projectId]);
      const pId = parentRes.rows[0].id;

      await pool.query(`
        INSERT INTO work_items (project_id, parent_id, name)
        VALUES ($1, $2, 'Con của cha')
      `, [projectId, pId]);

      let err;
      try {
        await pool.query(`
          UPDATE work_items
          SET quantity = 10, unit = 'm3', unit_price = 100
          WHERE id = $1
        `, [pId]);
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_contract_leaf_only");
      expect(err.message).toContain("Hạng mục cha không được khai");
    });

    it("Thêm hạng mục con vào cha đã có giá trị -> vi phạm (23514, work_items_contract_leaf_only)", async () => {
      const leafRes = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Lá có giá trị', 10, 'm3', 100)
        RETURNING id
      `, [projectId]);
      const leafId = leafRes.rows[0].id;

      let err;
      try {
        await pool.query(`
          INSERT INTO work_items (project_id, parent_id, name)
          VALUES ($1, $2, 'Con mới cố gắn vào lá có giá trị')
        `, [projectId, leafId]);
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_contract_leaf_only");
      expect(err.message).toContain("Không thể thêm hoặc chuyển hạng mục con vào hạng mục đã có khối lượng hợp đồng");
    });

    it("Đổi parent_id của một hạng mục sang cha đang có giá trị -> vi phạm (23514, work_items_contract_leaf_only)", async () => {
      const targetRes = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Đích có giá trị', 20, 'm3', 200)
        RETURNING id
      `, [projectId]);
      const targetId = targetRes.rows[0].id;

      const orphanRes = await pool.query(`
        INSERT INTO work_items (project_id, name)
        VALUES ($1, 'Hạng mục độc lập')
        RETURNING id
      `, [projectId]);
      const orphanId = orphanRes.rows[0].id;

      let err;
      try {
        await pool.query(`
          UPDATE work_items
          SET parent_id = $1
          WHERE id = $2
        `, [targetId, orphanId]);
      } catch (e) {
        err = e;
      }

      expect(err).toBeDefined();
      expect(err.code).toBe("23514");
      expect(err.constraint).toBe("work_items_contract_leaf_only");
    });

    it("Hạng mục lá có công việc trong bảng tasks -> vẫn khai được giá trị bình thường", async () => {
      const leafWithTaskRes = await pool.query(`
        INSERT INTO work_items (project_id, name)
        VALUES ($1, 'Lá chứa tasks')
        RETURNING id
      `, [projectId]);
      const leafId = leafWithTaskRes.rows[0].id;

      // Thêm task vào hạng mục này
      await pool.query(`
        INSERT INTO tasks (work_item_id, name, duration_days)
        VALUES ($1, 'Công việc thi công', 3)
      `, [leafId]);

      // Gán giá trị hợp đồng cho hạng mục này -> Phải thành công!
      const updateRes = await pool.query(`
        UPDATE work_items
        SET quantity = 50, unit = 'tấn', unit_price = 1200
        WHERE id = $1
        RETURNING contract_value
      `, [leafId]);

      expect(updateRes.rows[0].contract_value).toBe("60000.00");
    });

    it("Chuyển hạng mục có giá trị sang cha KHÔNG có giá trị -> thành công", async () => {
      const emptyParentRes = await pool.query(`
        INSERT INTO work_items (project_id, name)
        VALUES ($1, 'Cha rỗng không có giá trị')
        RETURNING id
      `, [projectId]);
      const parentId = emptyParentRes.rows[0].id;

      const leafRes = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Lá chuyển cha', 10, 'm2', 300)
        RETURNING id
      `, [projectId]);
      const leafId = leafRes.rows[0].id;

      const moveRes = await pool.query(`
        UPDATE work_items
        SET parent_id = $1
        WHERE id = $2
        RETURNING parent_id
      `, [parentId, leafId]);

      expect(moveRes.rows[0].parent_id).toBe(parentId);
    });

    it("Xoá giá trị của cha (về NULL) rồi thêm con -> thành công", async () => {
      const formerlyLeafRes = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Trước là lá sau làm cha', 5, 'cái', 100)
        RETURNING id
      `, [projectId]);
      const id = formerlyLeafRes.rows[0].id;

      // Reset về NULL
      await pool.query(`
        UPDATE work_items
        SET quantity = NULL, unit = NULL, unit_price = NULL
        WHERE id = $1
      `, [id]);

      // Giờ thêm con -> OK
      const childRes = await pool.query(`
        INSERT INTO work_items (project_id, parent_id, name)
        VALUES ($1, $2, 'Con mới sinh')
        RETURNING id, parent_id
      `, [projectId, id]);

      expect(childRes.rows[0].parent_id).toBe(id);
    });
  });

  describe("9. Tương thích ngược: dữ liệu và thao tác cũ vẫn hoạt động bình thường", () => {
    it("Tạo, đổi tên, chuyển nhánh các hạng mục không có giá trị như trước mà không bị cản", async () => {
      const r1 = await pool.query(`
        INSERT INTO work_items (project_id, name)
        VALUES ($1, 'Nhánh cũ gốc')
        RETURNING id
      `, [projectId]);
      const id1 = r1.rows[0].id;

      const r2 = await pool.query(`
        INSERT INTO work_items (project_id, parent_id, name)
        VALUES ($1, $2, 'Nhánh con')
        RETURNING id
      `, [projectId, id1]);
      const id2 = r2.rows[0].id;

      // Đổi tên
      const rename = await pool.query(`
        UPDATE work_items
        SET name = 'Nhánh con đã đổi tên'
        WHERE id = $1
        RETURNING name
      `, [id2]);
      expect(rename.rows[0].name).toBe("Nhánh con đã đổi tên");

      // Chuyển sang root
      const unparent = await pool.query(`
        UPDATE work_items
        SET parent_id = NULL
        WHERE id = $1
        RETURNING parent_id
      `, [id2]);
      expect(unparent.rows[0].parent_id).toBeNull();
    });
  });

  describe("10. Kiểm tra tranh chấp đồng thời (Concurrency / Race Conditions)", () => {
    it("Thứ tự 1 (10 lần): A UPDATE cha P, B INSERT con vào P -> B bị chặn và thất bại 23514 sau khi A COMMIT", async () => {
      for (let run = 0; run < 10; run++) {
        const pRes = await pool.query(`
          INSERT INTO work_items (project_id, name)
          VALUES ($1, $2)
          RETURNING id
        `, [projectId, `P-Order1-${run}`]);
        const pId = pRes.rows[0].id;

        const clientA = await pool.connect();
        const clientB = await pool.connect();

        try {
          await clientA.query("BEGIN");
          await clientA.query(`
            UPDATE work_items
            SET quantity = 10, unit = 'm3', unit_price = 100
            WHERE id = $1
          `, [pId]);

          let clientBError = null;
          // B bắt đầu chèn con vào P - không await để B bị block trong DB
          const promiseB = (async () => {
            try {
              await clientB.query("BEGIN");
              await clientB.query(`
                INSERT INTO work_items (project_id, parent_id, name)
                VALUES ($1, $2, 'Child from B')
              `, [projectId, pId]);
              await clientB.query("COMMIT");
            } catch (e) {
              clientBError = e;
              await clientB.query("ROLLBACK").catch(() => {});
            }
          })();

          // Chờ để bảo đảm B đã chạm DB và đang đợi khóa dòng của A
          await new Promise((resolve) => setTimeout(resolve, 300));

          // A commit
          await clientA.query("COMMIT");

          // Đợi B hoàn tất
          await promiseB;

          expect(clientBError).toBeDefined();
          expect(clientBError.code).toBe("23514");
          expect(clientBError.constraint).toBe("work_items_contract_leaf_only");

          // Kiểm tra tính bất biến: Không có hạng mục nào vừa có giá trị vừa có con
          const invariantCheck = await pool.query(`
            SELECT p.id
            FROM work_items p
            JOIN work_items c ON c.parent_id = p.id
            WHERE p.id = $1 AND (p.quantity IS NOT NULL OR p.unit IS NOT NULL OR p.unit_price IS NOT NULL)
          `, [pId]);
          expect(invariantCheck.rows).toHaveLength(0);
        } finally {
          clientA.release();
          clientB.release();
        }
      }
    });

    it("Thứ tự 2 (10 lần): B INSERT con vào P, A UPDATE giá trị cho P -> A bị chặn và thất bại 23514 sau khi B COMMIT", async () => {
      for (let run = 0; run < 10; run++) {
        const pRes = await pool.query(`
          INSERT INTO work_items (project_id, name)
          VALUES ($1, $2)
          RETURNING id
        `, [projectId, `P-Order2-${run}`]);
        const pId = pRes.rows[0].id;

        const clientA = await pool.connect();
        const clientB = await pool.connect();

        try {
          await clientB.query("BEGIN");
          await clientB.query(`
            INSERT INTO work_items (project_id, parent_id, name)
            VALUES ($1, $2, 'Child from B')
          `, [projectId, pId]);

          let clientAError = null;
          // A bắt đầu UPDATE P - không await để A bị block do B đang giữ share lock trên P
          const promiseA = (async () => {
            try {
              await clientA.query("BEGIN");
              await clientA.query(`
                UPDATE work_items
                SET quantity = 20, unit = 'm2', unit_price = 200
                WHERE id = $1
              `, [pId]);
              await clientA.query("COMMIT");
            } catch (e) {
              clientAError = e;
              await clientA.query("ROLLBACK").catch(() => {});
            }
          })();

          // Chờ để bảo đảm A đã chạm DB và đang đợi khóa của B
          await new Promise((resolve) => setTimeout(resolve, 300));

          // B commit
          await clientB.query("COMMIT");

          // Đợi A hoàn tất
          await promiseA;

          expect(clientAError).toBeDefined();
          expect(clientAError.code).toBe("23514");
          expect(clientAError.constraint).toBe("work_items_contract_leaf_only");

          // Kiểm tra tính bất biến
          const invariantCheck = await pool.query(`
            SELECT p.id
            FROM work_items p
            JOIN work_items c ON c.parent_id = p.id
            WHERE p.id = $1 AND (p.quantity IS NOT NULL OR p.unit IS NOT NULL OR p.unit_price IS NOT NULL)
          `, [pId]);
          expect(invariantCheck.rows).toHaveLength(0);
        } finally {
          clientA.release();
          clientB.release();
        }
      }
    });
  });

  describe("11. Khả năng đảo ngược migration trên database tạm (Up -> Down -> Up)", () => {
    it("Tạo DB tạm, chạy migration tới Phần B, down 2 bước (biến mất cột/trigger), up lại 2 bước (đầy đủ)", async () => {
      const tempDbName = `t85_migration_check_${Date.now()}`;
      const parsedUrl = new URL(dbUrl);
      parsedUrl.pathname = "/postgres";
      const adminConnString = parsedUrl.toString();

      const adminPool = new Pool({ connectionString: adminConnString });
      await adminPool.query(`CREATE DATABASE ${tempDbName}`);

      try {
        const tempDbUrl = new URL(dbUrl);
        tempDbUrl.pathname = `/${tempDbName}`;
        const tempConnString = tempDbUrl.toString();

        const fs = require("fs");
        const migrationsDir = path.resolve(__dirname, "../../migrations");
        const migrationFiles = fs.readdirSync(migrationsDir).sort();
        const partBFileIndex = migrationFiles.findIndex((f) =>
          f.includes("add-contract-leaf-guard-to-work-items")
        );
        expect(partBFileIndex).toBeGreaterThan(-1);

        // 1. Chạy up tới hết file migration của Phần B
        await runner({
          databaseUrl: tempConnString,
          dir: migrationsDir,
          direction: "up",
          migrationsTable: "pgmigrations",
          count: partBFileIndex + 1,
          checkOrder: false,
          log: () => {},
        });

        const tempPool = new Pool({ connectionString: tempConnString });
        try {
          // Khẳng định có cột và trigger
          const colsBefore = await tempPool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'work_items' AND column_name IN ('quantity', 'contract_value')
          `);
          expect(colsBefore.rows).toHaveLength(2);

          // 2. Chạy down count 2
          await runner({
            databaseUrl: tempConnString,
            dir: migrationsDir,
            direction: "down",
            migrationsTable: "pgmigrations",
            count: 2,
            checkOrder: false,
            log: () => {},
          });

          // Khẳng định cột và trigger biến mất
          const colsAfterDown = await tempPool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'work_items' AND column_name IN ('quantity', 'unit', 'unit_price', 'contract_value')
          `);
          expect(colsAfterDown.rows).toHaveLength(0);

          const triggerAfterDown = await tempPool.query(`
            SELECT trigger_name FROM information_schema.triggers
            WHERE event_object_table = 'work_items' AND trigger_name = 'trg_work_items_contract_leaf_guard'
          `);
          expect(triggerAfterDown.rows).toHaveLength(0);

          // 3. Chạy up count 2
          await runner({
            databaseUrl: tempConnString,
            dir: migrationsDir,
            direction: "up",
            migrationsTable: "pgmigrations",
            count: 2,
            checkOrder: false,
            log: () => {},
          });

          // Khẳng định xuất hiện lại
          const colsAfterReUp = await tempPool.query(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'work_items' AND column_name IN ('quantity', 'contract_value')
          `);
          expect(colsAfterReUp.rows).toHaveLength(2);
        } finally {
          await tempPool.end();
        }
      } finally {
        await adminPool.query(`DROP DATABASE IF EXISTS ${tempDbName}`);
        await adminPool.end();
      }
    });
  });

  describe("12. Không lộ cột hợp đồng mới ra API hiện có", () => {
    function assertNoContractFields(obj) {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        obj.forEach(assertNoContractFields);
        return;
      }
      expect(obj).not.toHaveProperty("quantity");
      expect(obj).not.toHaveProperty("unit");
      expect(obj).not.toHaveProperty("unit_price");
      expect(obj).not.toHaveProperty("contract_value");
      for (const val of Object.values(obj)) {
        if (typeof val === "object" && val !== null) {
          assertNoContractFields(val);
        }
      }
    }

    it("Các endpoint GET /api/categories/:projectId, GET /api/categories/:projectId/tree/all, PUT /api/categories/:projectId/:id, PATCH move không lộ 4 cột mới", async () => {
      // Đặt giá trị cho hạng mục lá trực tiếp bằng SQL
      const leafRes = await pool.query(`
        INSERT INTO work_items (project_id, name, quantity, unit, unit_price)
        VALUES ($1, 'Hạng mục lá bí mật', 123.456, 'm3', 50000)
        RETURNING id
      `, [projectId]);
      const leafId = leafRes.rows[0].id;

      // 1. GET /api/categories/:projectId
      const resGetTree = await request(app)
        .get(`/api/categories/${projectId}`)
        .set("Cookie", adminCookie);
      expect(resGetTree.status).toBe(200);
      assertNoContractFields(resGetTree.body);

      // 2. GET /api/categories/:projectId/tree/all
      const resGetAll = await request(app)
        .get(`/api/categories/${projectId}/tree/all`)
        .set("Cookie", adminCookie);
      expect(resGetAll.status).toBe(200);
      assertNoContractFields(resGetAll.body);

      // 3. PUT /api/categories/:projectId/:id
      const resPut = await request(app)
        .put(`/api/categories/${projectId}/${leafId}`)
        .set("Cookie", adminCookie)
        .send({ name: "Tên cập nhật qua PUT" });
      expect(resPut.status).toBe(200);
      assertNoContractFields(resPut.body);

      // 4. PATCH /api/categories/:projectId/:id/move
      const resMove = await request(app)
        .patch(`/api/categories/${projectId}/${leafId}/move`)
        .set("Cookie", adminCookie)
        .send({ parentId: null });
      expect(resMove.status).toBe(200);
      assertNoContractFields(resMove.body);
    });
  });
});
