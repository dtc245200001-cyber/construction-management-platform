"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");
const { calculateTreeTotals } = require("../helpers/treeOracle");

describe("ĐỢT 2: Kiểm thử cây cố định qua API thật (T2, T3, T4)", () => {
  let projectId;
  let cookieChuDauTu;
  let cookieBanQuanLy;
  let passHash;

  // Helper thực hiện truy vấn SQL độc lập CTE để kiểm chéo ba chiều (T3)
  async function queryIndependentSqlTotals(pId) {
    const sql = `
      WITH RECURSIVE
      items AS (
        SELECT id, parent_id, contract_value
        FROM work_items
        WHERE project_id = $1
      ),
      descendants AS (
        SELECT id AS root_ancestor, id AS descendant_id
        FROM items
        UNION ALL
        SELECT d.root_ancestor, c.id
        FROM descendants d
        JOIN items c ON c.parent_id = d.descendant_id
      )
      SELECT
        d.root_ancestor AS id,
        COALESCE(ROUND(SUM(i.contract_value), 2)::text, '0.00') AS calculated_total
      FROM descendants d
      JOIN items i ON i.id = d.descendant_id
      GROUP BY d.root_ancestor;
    `;
    const res = await pool.query(sql, [pId]);
    const map = new Map();
    for (const row of res.rows) {
      map.set(Number(row.id), row.calculated_total);
    }
    return map;
  }

  beforeAll(async () => {
    // Dọn dẹp sạch sẽ
    await pool.query(
      "TRUNCATE users, roles, projects, project_members, work_items, tasks, audit_logs RESTART IDENTITY CASCADE"
    );

    const rolesData = ["chu_dau_tu", "ban_quan_ly", "ke_toan", "ky_su_giam_sat", "chi_huy_truong", "doi_truong"];
    for (const r of rolesData) {
      await pool.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }
    const roleBqlRes = await pool.query("SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1");
    const roleBqlId = roleBqlRes.rows[0].id;

    passHash = await argon2.hash("Password123!");

    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Chủ Đầu Tư Test', 'cdt_t88@test.com', $1, $2, false, true)
       RETURNING id`,
      [passHash, roleBqlId]
    );
    const userId = userRes.rows[0].id;

    const bqlRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Ban Quản Lý Test', 'bql_t88@test.com', $1, $2, false, true)
       RETURNING id`,
      [passHash, roleBqlId]
    );
    const bqlUserId = bqlRes.rows[0].id;

    const loginCdt = await request(app)
      .post("/api/auth/login")
      .send({ email: "cdt_t88@test.com", password: "Password123!" });
    cookieChuDauTu = loginCdt.headers["set-cookie"];

    const loginBql = await request(app)
      .post("/api/auth/login")
      .send({ email: "bql_t88@test.com", password: "Password123!" });
    cookieBanQuanLy = loginBql.headers["set-cookie"];

    const prjRes = await pool.query(
      "INSERT INTO projects (name, code) VALUES ('Dự án T88', 'PRJ-T88') RETURNING id"
    );
    projectId = prjRes.rows[0].id;

    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES
       ($1, $2, 'chu_dau_tu'),
       ($1, $3, 'ban_quan_ly')`,
      [projectId, userId, bqlUserId]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("T2: Cây A và các kịch bản qua API thật", () => {
    let nodeDbIdMap = {}; // "R" -> id, "A" -> id, "A1" -> id ...

    beforeEach(async () => {
      // Xóa hết work_items của project để dựng lại cây A nguyên vẹn
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);
      nodeDbIdMap = {};

      // 1. Tạo các nút của cây A qua DB (cây cấu trúc)
      // Thứ tự: R -> A, B -> A1, A2, A3, B1, B2 -> B11, B12
      const insertNode = async (key, parentKey, name) => {
        const parentId = parentKey ? nodeDbIdMap[parentKey] : null;
        const res = await pool.query(
          "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id",
          [projectId, parentId, name]
        );
        nodeDbIdMap[key] = res.rows[0].id;
      };

      await insertNode("R", null, "Gốc R");
      await insertNode("A", "R", "Nhánh A");
      await insertNode("B", "R", "Nhánh B");
      await insertNode("A1", "A", "Lá A1");
      await insertNode("A2", "A", "Lá A2");
      await insertNode("A3", "A", "Lá A3");
      await insertNode("B1", "B", "Nhánh B1");
      await insertNode("B2", "B", "Lá B2");
      await insertNode("B11", "B1", "Lá B11");
      await insertNode("B12", "B1", "Lá B12");

      // 2. Khai giá trị từng lá qua API PUT (gửi chuỗi)
      const leafDefs = [
        { key: "A1", quantity: "333.333", unit: "m3", unit_price: "3.00" },
        { key: "A2", quantity: "2.675", unit: "tấn", unit_price: "1.00" },
        { key: "A3", quantity: "1.005", unit: "m", unit_price: "1.00" },
        { key: "B11", quantity: "1234.567", unit: "cái", unit_price: "89000.50" },
        { key: "B12", quantity: "0.001", unit: "kg", unit_price: "0.01" },
        { key: "B2", quantity: "0.100", unit: "m2", unit_price: "0.20" },
      ];

      for (const leaf of leafDefs) {
        const wiId = nodeDbIdMap[leaf.key];
        const putRes = await request(app)
          .put(`/api/projects/${projectId}/work-items/${wiId}/contract-quantity`)
          .set("Cookie", cookieChuDauTu)
          .send({
            quantity: leaf.quantity,
            unit: leaf.unit,
            unit_price: leaf.unit_price,
          });
        expect(putRes.status).toBe(200);
      }
    });

    test("Kiểm tra toàn bộ nút Cây A nguyên vẹn khớp kỳ vọng cố định và máy đối chứng", async () => {
      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);

      expect(getRes.status).toBe(200);
      const { items, project_total } = getRes.body;

      // Project total
      expect(project_total).toBe("109878083.99");

      const itemMap = new Map();
      for (const it of items) {
        itemMap.set(it.id, it);
      }

      // So khớp từng nút
      const checkNode = (key, expectedValue, expectedTotal) => {
        const dbId = nodeDbIdMap[key];
        const it = itemMap.get(dbId);
        expect(it).toBeDefined();
        if (expectedValue !== undefined) {
          expect(it.contract_value).toBe(expectedValue);
        }
        expect(it.contract_total).toBe(expectedTotal);
      };

      checkNode("A1", "1000.00", "1000.00");
      checkNode("A2", "2.68", "2.68");
      checkNode("A3", "1.01", "1.01");
      checkNode("A", null, "1003.69");

      checkNode("B11", "109877080.28", "109877080.28");
      checkNode("B12", "0.00", "0.00");
      checkNode("B1", null, "109877080.28");
      checkNode("B2", "0.02", "0.02");
      checkNode("B", null, "109877080.30");

      checkNode("R", null, "109878083.99");
    });

    test("S1: Đổi đơn giá A3 thành 2.00", async () => {
      const wiId = nodeDbIdMap["A3"];
      const putRes = await request(app)
        .put(`/api/projects/${projectId}/work-items/${wiId}/contract-quantity`)
        .set("Cookie", cookieChuDauTu)
        .send({
          quantity: "1.005",
          unit: "m",
          unit_price: "2.00",
        });
      expect(putRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);

      const items = getRes.body.items;
      const itemMap = new Map(items.map((i) => [i.id, i]));

      expect(itemMap.get(nodeDbIdMap["A3"]).contract_value).toBe("2.01");
      expect(itemMap.get(nodeDbIdMap["A"]).contract_total).toBe("1004.69");
      expect(getRes.body.project_total).toBe("109878084.99");
    });

    test("S2: Xóa khối lượng A2 (DELETE contract-quantity)", async () => {
      const wiId = nodeDbIdMap["A2"];
      const delRes = await request(app)
        .delete(`/api/projects/${projectId}/work-items/${wiId}/contract-quantity`)
        .set("Cookie", cookieChuDauTu);
      expect(delRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);

      const itemMap = new Map(getRes.body.items.map((i) => [i.id, i]));
      expect(itemMap.get(nodeDbIdMap["A2"]).contract_value).toBeNull();
      expect(itemMap.get(nodeDbIdMap["A"]).contract_total).toBe("1001.01");
      expect(getRes.body.project_total).toBe("109878081.31");
    });

    test("S3: Xóa khối lượng B12 (bằng 0, tổng không đổi)", async () => {
      const wiId = nodeDbIdMap["B12"];
      const delRes = await request(app)
        .delete(`/api/projects/${projectId}/work-items/${wiId}/contract-quantity`)
        .set("Cookie", cookieChuDauTu);
      expect(delRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);

      const itemMap = new Map(getRes.body.items.map((i) => [i.id, i]));
      expect(itemMap.get(nodeDbIdMap["B12"]).contract_value).toBeNull();
      expect(itemMap.get(nodeDbIdMap["B1"]).contract_total).toBe("109877080.28");
      expect(itemMap.get(nodeDbIdMap["B"]).contract_total).toBe("109877080.30");
      expect(getRes.body.project_total).toBe("109878083.99");
    });

    test("S4: Xóa toàn bộ khối lượng các lá của A", async () => {
      for (const k of ["A1", "A2", "A3"]) {
        await request(app)
          .delete(`/api/projects/${projectId}/work-items/${nodeDbIdMap[k]}/contract-quantity`)
          .set("Cookie", cookieChuDauTu);
      }

      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);

      const itemMap = new Map(getRes.body.items.map((i) => [i.id, i]));
      expect(itemMap.get(nodeDbIdMap["A"]).contract_total).toBe("0.00");
      expect(getRes.body.project_total).toBe("109877080.30");
    });

    test("Kịch bản cấu trúc: Thêm lá mới vào A, chuyển nhánh B1 sang A, xóa lá WBS, xóa cha có con", async () => {
      // 1. Thêm lá mới A4 vào A qua API WBS (POST /api/categories/:projectId)
      const postRes = await request(app)
        .post(`/api/categories/${projectId}`)
        .set("Cookie", cookieBanQuanLy)
        .send({
          name: "Lá A4 mới",
          parent_id: nodeDbIdMap["A"],
        });
      expect(postRes.status).toBe(201);
      const a4Id = postRes.body.id;

      // Khai giá trị cho A4: 10 x 5.00 = 50.00
      const putA4 = await request(app)
        .put(`/api/projects/${projectId}/work-items/${a4Id}/contract-quantity`)
        .set("Cookie", cookieChuDauTu)
        .send({
          quantity: "10.000",
          unit: "m",
          unit_price: "5.00",
        });
      expect(putA4.status).toBe(200);

      let getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);
      let itemMap = new Map(getRes.body.items.map((i) => [i.id, i]));
      // Tổng A cũ là 1003.69 + 50.00 = 1053.69
      expect(itemMap.get(nodeDbIdMap["A"]).contract_total).toBe("1053.69");

      // 2. Chuyển (PATCH move) nhánh B1 sang dưới A
      const moveRes = await request(app)
        .patch(`/api/categories/${projectId}/${nodeDbIdMap["B1"]}/move`)
        .set("Cookie", cookieBanQuanLy)
        .send({
          parent_id: nodeDbIdMap["A"],
        });
      expect(moveRes.status).toBe(200);

      getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);
      itemMap = new Map(getRes.body.items.map((i) => [i.id, i]));

      // A nhận thêm B1 (109877080.28) -> A = 1053.69 + 109877080.28 = 109878133.97
      expect(itemMap.get(nodeDbIdMap["A"]).contract_total).toBe("109878133.97");
      // B chỉ còn B2 (0.02)
      expect(itemMap.get(nodeDbIdMap["B"]).contract_total).toBe("0.02");
      // Project total vẫn khớp: 109878133.97 + 0.02 = 109878133.99
      expect(getRes.body.project_total).toBe("109878133.99");

      // 3. Xóa hạng mục cha B1 đang có con (B11, B12) qua API WBS -> kỳ vọng 409
      const delParentRes = await request(app)
        .delete(`/api/categories/${projectId}/${nodeDbIdMap["B1"]}`)
        .set("Cookie", cookieBanQuanLy);
      expect(delParentRes.status).toBe(409);

      // 4. Xóa một lá còn giá trị (A4) bằng API WBS DELETE
      const delA4 = await request(app)
        .delete(`/api/categories/${projectId}/${a4Id}`)
        .set("Cookie", cookieBanQuanLy);
      expect(delA4.status).toBe(200);

      // 5. Khi mọi con của một cha bị xóa (ví dụ tạo cha C có 1 con C1, xóa C1 thì C trở thành lá)
      const postC = await request(app)
        .post(`/api/categories/${projectId}`)
        .set("Cookie", cookieBanQuanLy)
        .send({ name: "Hạng mục C", parent_id: nodeDbIdMap["R"] });
      const cId = postC.body.id;

      const postC1 = await request(app)
        .post(`/api/categories/${projectId}`)
        .set("Cookie", cookieBanQuanLy)
        .send({ name: "Lá C1", parent_id: cId });
      const c1Id = postC1.body.id;

      // Xóa lá C1
      const delC1 = await request(app)
        .delete(`/api/categories/${projectId}/${c1Id}`)
        .set("Cookie", cookieBanQuanLy);
      expect(delC1.status).toBe(200);

      // C giờ trở thành lá chưa khai -> đóng góp 0 và sau đó khai được
      getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);
      itemMap = new Map(getRes.body.items.map((i) => [i.id, i]));
      expect(itemMap.get(cId).is_leaf).toBe(true);
      expect(itemMap.get(cId).contract_total).toBe("0.00");

      // Khai giá trị cho C
      const putC = await request(app)
        .put(`/api/projects/${projectId}/work-items/${cId}/contract-quantity`)
        .set("Cookie", cookieChuDauTu)
        .send({ quantity: "1.000", unit: "m", unit_price: "100.00" });
      expect(putC.status).toBe(200);
    });
  });

  describe("T3: Số lẻ và làm tròn (V1, V2, V5) & Kiểm chéo ba chiều", () => {
    test("V1: Ba lá nhỏ 0.333 x 1.00 -> tổng 0.99, khớp 3 chiều tuyệt đối", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);

      const parentRes = await pool.query(
        "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cha V1') RETURNING id",
        [projectId]
      );
      const parentId = parentRes.rows[0].id;

      const leafIds = [];
      for (let i = 1; i <= 3; i++) {
        const lRes = await pool.query(
          "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id",
          [projectId, parentId, `Lá V1-${i}`]
        );
        leafIds.push(lRes.rows[0].id);

        await request(app)
          .put(`/api/projects/${projectId}/work-items/${lRes.rows[0].id}/contract-quantity`)
          .set("Cookie", cookieChuDauTu)
          .send({ quantity: "0.333", unit: "m", unit_price: "1.00" });
      }

      // (i) API
      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);
      const apiItemMap = new Map(getRes.body.items.map((i) => [i.id, i]));

      // (ii) Oracle
      const flatNodes = [
        { id: parentId, parent_id: null },
        ...leafIds.map((id) => ({ id, parent_id: parentId, quantity: "0.333", unit_price: "1.00" })),
      ];
      const oracle = calculateTreeTotals(flatNodes);

      // (iii) SQL CTE độc lập
      const sqlTotals = await queryIndependentSqlTotals(projectId);

      // So khớp cả 3 chiều
      for (const id of [parentId, ...leafIds]) {
        const apiTot = apiItemMap.get(id).contract_total;
        const oracleTot = oracle.nodeTotals.get(id);
        const sqlTot = sqlTotals.get(id);

        expect(apiTot).toBe(oracleTot);
        expect(apiTot).toBe(sqlTot);
      }
      expect(apiItemMap.get(parentId).contract_total).toBe("0.99");
    });

    test("V2: Hai lá 1 x 0.10 và 1 x 0.20 -> tổng 0.30", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);

      const parentRes = await pool.query(
        "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cha V2') RETURNING id",
        [projectId]
      );
      const parentId = parentRes.rows[0].id;

      const l1 = await pool.query(
        "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'L1') RETURNING id",
        [projectId, parentId]
      );
      const l2 = await pool.query(
        "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'L2') RETURNING id",
        [projectId, parentId]
      );

      await request(app)
        .put(`/api/projects/${projectId}/work-items/${l1.rows[0].id}/contract-quantity`)
        .set("Cookie", cookieChuDauTu)
        .send({ quantity: "1.000", unit: "m", unit_price: "0.10" });
      await request(app)
        .put(`/api/projects/${projectId}/work-items/${l2.rows[0].id}/contract-quantity`)
        .set("Cookie", cookieChuDauTu)
        .send({ quantity: "1.000", unit: "m", unit_price: "0.20" });

      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);
      const apiItemMap = new Map(getRes.body.items.map((i) => [i.id, i]));
      expect(apiItemMap.get(parentId).contract_total).toBe("0.30");
    });

    test("V5: Nhánh chưa khai báo giá trị đóng góp 0 và contract_total '0.00'", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);

      const parentRes = await pool.query(
        "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cha V5') RETURNING id",
        [projectId]
      );
      const parentId = parentRes.rows[0].id;

      await pool.query(
        "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Lá chưa khai') RETURNING id",
        [projectId, parentId]
      );

      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);
      const apiItemMap = new Map(getRes.body.items.map((i) => [i.id, i]));

      expect(apiItemMap.get(parentId).contract_total).toBe("0.00");
      expect(getRes.body.project_total).toBe("0.00");
    });
  });

  describe("T4: Biên lớn nhất (V3), quy mô (V4) và đo hiệu năng GET", () => {
    test("V3: Biên lớn nhất 3 lá x 99999999999.999 x 99999999999999.99 khớp từng ký tự", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);

      const parentRes = await pool.query(
        "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cha V3') RETURNING id",
        [projectId]
      );
      const parentId = parentRes.rows[0].id;

      for (let i = 1; i <= 3; i++) {
        const lRes = await pool.query(
          "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id",
          [projectId, parentId, `Lá V3-${i}`]
        );
        const putRes = await request(app)
          .put(`/api/projects/${projectId}/work-items/${lRes.rows[0].id}/contract-quantity`)
          .set("Cookie", cookieChuDauTu)
          .send({
            quantity: "99999999999.999",
            unit: "m",
            unit_price: "99999999999999.99",
          });
        expect(putRes.status).toBe(200);
      }

      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);

      expect(getRes.status).toBe(200);
      const itemMap = new Map(getRes.body.items.map((i) => [i.id, i]));
      expect(itemMap.get(parentId).contract_total).toBe("29999999999999697000000000.00");
      expect(getRes.body.project_total).toBe("29999999999999697000000000.00");
    });

    test("V4: Quy mô 2000 lá và 1000 lá với số lẻ", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);

      // Tạo nhanh bằng SQL
      const parentRes = await pool.query(
        "INSERT INTO work_items (project_id, name) VALUES ($1, 'Cha 2000 lá') RETURNING id",
        [projectId]
      );
      const parentId = parentRes.rows[0].id;

      // Chèn 2000 lá qua SQL batch
      await pool.query(`
        INSERT INTO work_items (project_id, parent_id, name, quantity, unit, unit_price)
        SELECT
          ${projectId},
          ${parentId},
          'Lá ' || s,
          0.100,
          'm',
          0.10
        FROM generate_series(1, 2000) AS s;
      `);

      const getRes = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);
      expect(getRes.status).toBe(200);
      const itemMap = new Map(getRes.body.items.map((i) => [i.id, i]));
      expect(itemMap.get(parentId).contract_total).toBe("20.00");
    });

    test("Hiệu năng: Dự án 1000 hạng mục (5 tầng, mỗi lá có giá trị) phản hồi GET dưới 500 ms", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);

      // Tạo cấu trúc cây 5 tầng gồm 1000 hạng mục
      // Tầng 1: 5 gốc
      // Tầng 2: 25 nút
      // Tầng 3: 100 nút
      // Tầng 4: 370 nút
      // Tầng 5: 500 lá
      await pool.query(`
        -- Tầng 1
        WITH RECURSIVE
        t1 AS (
          INSERT INTO work_items (project_id, name)
          SELECT ${projectId}, 'Tầng 1 - ' || i FROM generate_series(1, 5) i
          RETURNING id
        ),
        -- Tầng 2
        t2 AS (
          INSERT INTO work_items (project_id, parent_id, name)
          SELECT ${projectId}, t1.id, 'Tầng 2 - ' || i
          FROM t1 CROSS JOIN generate_series(1, 5) i
          RETURNING id
        ),
        -- Tầng 3
        t3 AS (
          INSERT INTO work_items (project_id, parent_id, name)
          SELECT ${projectId}, t2.id, 'Tầng 3 - ' || i
          FROM t2 CROSS JOIN generate_series(1, 4) i
          RETURNING id
        ),
        -- Tầng 4
        t4 AS (
          INSERT INTO work_items (project_id, parent_id, name)
          SELECT ${projectId}, t3.id, 'Tầng 4 - ' || i
          FROM t3 CROSS JOIN generate_series(1, 4) i
          LIMIT 370
          RETURNING id
        )
        -- Tầng 5 (Lá có giá trị)
        INSERT INTO work_items (project_id, parent_id, name, quantity, unit, unit_price)
        SELECT
          ${projectId},
          t4.id,
          'Lá T5 - ' || i,
          10.000,
          'm',
          100.00
        FROM t4 CROSS JOIN generate_series(1, 2) i
        LIMIT 500;
      `);

      // Đo thời gian GET
      const start = Date.now();
      const res = await request(app)
        .get(`/api/projects/${projectId}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThanOrEqual(900);
      // Ngưỡng 500 ms theo yêu cầu
      expect(elapsed).toBeLessThan(500);
    });
  });
});
