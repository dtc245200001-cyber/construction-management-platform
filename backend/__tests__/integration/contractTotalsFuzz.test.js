"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");
const { calculateTreeTotals } = require("../helpers/treeOracle");

/**
 * Bộ sinh số giả ngẫu nhiên Mulberry32 có hạt giống (seed)
 * Không sử dụng thư viện ngoài, tạo số nguyên 32-bit xác định.
 */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("ĐỢT 3: Kiểm thử ngẫu nhiên có hạt giống (T5 Fuzzing)", () => {
  let projectId;
  let cookieChuDauTu;
  let cookieBanQuanLy;

  // Xác định danh sách seed cần chạy (mặc định 1 đến 30)
  const defaultSeedCount = 30;
  const envSeedCount = process.env.CONTRACT_FUZZ_SEEDS
    ? parseInt(process.env.CONTRACT_FUZZ_SEEDS, 10)
    : defaultSeedCount;
  const seeds = Array.from({ length: envSeedCount }, (_, i) => i + 1);

  // Helper thực hiện truy vấn SQL độc lập CTE để kiểm chéo ba chiều (I5)
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
    await pool.query(
      "TRUNCATE users, roles, projects, project_members, work_items, tasks, audit_logs RESTART IDENTITY CASCADE"
    );

    const rolesData = ["chu_dau_tu", "ban_quan_ly", "ke_toan", "ky_su_giam_sat", "chi_huy_truong", "doi_truong"];
    for (const r of rolesData) {
      await pool.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }
    const roleBqlRes = await pool.query("SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1");
    const roleBqlId = roleBqlRes.rows[0].id;

    const passHash = await argon2.hash("Password123!");

    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Chủ Đầu Tư Fuzz', 'cdt_fuzz@test.com', $1, $2, false, true)
       RETURNING id`,
      [passHash, roleBqlId]
    );
    const userId = userRes.rows[0].id;

    const bqlRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Ban Quản Lý Fuzz', 'bql_fuzz@test.com', $1, $2, false, true)
       RETURNING id`,
      [passHash, roleBqlId]
    );
    const bqlUserId = bqlRes.rows[0].id;

    const loginCdt = await request(app)
      .post("/api/auth/login")
      .send({ email: "cdt_fuzz@test.com", password: "Password123!" });
    cookieChuDauTu = loginCdt.headers["set-cookie"];

    const loginBql = await request(app)
      .post("/api/auth/login")
      .send({ email: "bql_fuzz@test.com", password: "Password123!" });
    cookieBanQuanLy = loginBql.headers["set-cookie"];

    const prjRes = await pool.query(
      "INSERT INTO projects (name, code) VALUES ('Dự án Fuzzing T88', 'PRJ-FUZZ') RETURNING id"
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

  // Chạy từng hạt giống
  describe.each(seeds)("Hạt giống Fuzz Seed #%i", (seed) => {
    test(
      `Seed ${seed}: Sinh cây ngẫu nhiên và thực hiện chuỗi 40 thao tác kiểm tra bất biến`,
      async () => {
        const rand = mulberry32(seed);
        const actionHistory = [];

        // Dọn sạch work_items trước mỗi seed
        await pool.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);

        // Helper sinh số ngẫu nhiên dạng chuỗi
        const randomInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
        const randomQtyStr = () => {
          const intPart = randomInt(0, 999);
          const dec = randomInt(0, 999);
          return `${intPart}.${dec.toString().padStart(3, "0")}`;
        };
        const randomPriceStr = () => {
          const intPart = randomInt(0, 9999);
          const dec = randomInt(0, 99);
          return `${intPart}.${dec.toString().padStart(2, "0")}`;
        };

        // 1. Dựng cây ban đầu ngẫu nhiên: tối đa 20 nút, sâu tối đa 4 tầng để tối ưu thời gian dưới 90s
        const initialNodeCount = randomInt(8, 16);
        const nodeIds = [];
        const parentMap = new Map(); // id -> parent_id

        // Nút gốc đầu tiên
        const rootRes = await pool.query(
          "INSERT INTO work_items (project_id, name) VALUES ($1, 'Gốc Fuzz') RETURNING id",
          [projectId]
        );
        const rootId = rootRes.rows[0].id;
        nodeIds.push(rootId);
        parentMap.set(rootId, null);

        for (let i = 2; i <= initialNodeCount; i++) {
          const parentId = nodeIds[randomInt(0, nodeIds.length - 1)];
          const nRes = await pool.query(
            "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id",
            [projectId, parentId, `Nút ${i}`]
          );
          const nId = nRes.rows[0].id;
          nodeIds.push(nId);
          parentMap.set(nId, parentId);
        }

        // 2. Thực hiện 40 thao tác ngẫu nhiên qua API thật
        const operationsCount = 40;

        for (let opIdx = 0; opIdx < operationsCount; opIdx++) {
          // Lấy danh sách work_items hiện tại từ DB
          const currentNodesRes = await pool.query(
            "SELECT id, parent_id, quantity, unit_price, contract_value FROM work_items WHERE project_id = $1",
            [projectId]
          );
          const currentNodes = currentNodesRes.rows.map((r) => ({
            id: Number(r.id),
            parent_id: r.parent_id != null ? Number(r.parent_id) : null,
            quantity: r.quantity != null ? r.quantity.toString() : null,
            unit_price: r.unit_price != null ? r.unit_price.toString() : null,
          }));

          const curIdList = currentNodes.map((n) => n.id);
          const parentSet = new Set(currentNodes.map((n) => n.parent_id).filter(Boolean));
          const leafNodes = currentNodes.filter((n) => !parentSet.has(n.id));

          const actionType = randomInt(1, 5);
          let opLog = "";

          try {
            if (actionType === 1 && leafNodes.length > 0) {
              // Thao tác 1: PUT khai/sửa lá
              const target = leafNodes[randomInt(0, leafNodes.length - 1)];
              const qty = randomQtyStr();
              const price = randomPriceStr();
              opLog = `PUT leaf ${target.id} qty=${qty} price=${price}`;
              await request(app)
                .put(`/api/projects/${projectId}/work-items/${target.id}/contract-quantity`)
                .set("Cookie", cookieChuDauTu)
                .send({ quantity: qty, unit: "m", unit_price: price });
            } else if (actionType === 2 && leafNodes.length > 0) {
              // Thao tác 2: DELETE khối lượng lá
              const target = leafNodes[randomInt(0, leafNodes.length - 1)];
              opLog = `DELETE contract-quantity leaf ${target.id}`;
              await request(app)
                .delete(`/api/projects/${projectId}/work-items/${target.id}/contract-quantity`)
                .set("Cookie", cookieChuDauTu);
            } else if (actionType === 3 && curIdList.length > 0) {
              // Thao tác 3: POST thêm hạng mục con
              const targetParent = curIdList[randomInt(0, curIdList.length - 1)];
              opLog = `POST new item under parent ${targetParent}`;
              await request(app)
                .post(`/api/categories/${projectId}`)
                .set("Cookie", cookieBanQuanLy)
                .send({ name: `Con mới op ${opIdx}`, parent_id: targetParent });
            } else if (actionType === 4 && curIdList.length > 1) {
              // Thao tác 4: PATCH move chuyển nhánh
              const itemToMove = curIdList[randomInt(0, curIdList.length - 1)];
              const newParent = randomInt(0, 1) === 0 ? null : curIdList[randomInt(0, curIdList.length - 1)];
              opLog = `PATCH move ${itemToMove} -> parent ${newParent}`;
              await request(app)
                .patch(`/api/categories/${projectId}/${itemToMove}/move`)
                .set("Cookie", cookieBanQuanLy)
                .send({ parent_id: newParent });
            } else if (actionType === 5 && leafNodes.length > 1) {
              // Thao tác 5: DELETE hạng mục lá qua WBS (không xoá nút gốc duy nhất)
              const targetLeaf = leafNodes[randomInt(0, leafNodes.length - 1)];
              opLog = `DELETE work_item ${targetLeaf.id}`;
              await request(app)
                .delete(`/api/categories/${projectId}/${targetLeaf.id}`)
                .set("Cookie", cookieBanQuanLy);
            }

            actionHistory.push({ opIdx, opLog });

            // 3. KIỂM TRA BẤT BIẾN SAU MỖI THAO TÁC (I1 -> I6)
            // Lấy dữ liệu API
            const getRes = await request(app)
              .get(`/api/projects/${projectId}/contract-quantities`)
              .set("Cookie", cookieChuDauTu);
            expect(getRes.status).toBe(200);

            const apiItems = getRes.body.items;
            const projectTotalApi = getRes.body.project_total;

            // (I6): Không tồn tại hạng mục nào vừa có khối lượng vừa có con
            const inv6Res = await pool.query(`
              SELECT w.id
              FROM work_items w
              WHERE w.project_id = $1
                AND w.contract_value IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM work_items c WHERE c.parent_id = w.id
                )
            `, [projectId]);
            expect(inv6Res.rows.length).toBe(0);

            // Xây dựng cây và so sánh với máy đối chiếu (Oracle)
            const latestNodesRes = await pool.query(
              "SELECT id, parent_id, quantity, unit_price, contract_value FROM work_items WHERE project_id = $1",
              [projectId]
            );
            const flatNodes = latestNodesRes.rows.map((r) => ({
              id: Number(r.id),
              parent_id: r.parent_id != null ? Number(r.parent_id) : null,
              quantity: r.quantity != null ? r.quantity.toString() : null,
              unit_price: r.unit_price != null ? r.unit_price.toString() : null,
            }));
            const oracle = calculateTreeTotals(flatNodes);

            // (I5): Truy vấn SQL độc lập CTE của test
            const sqlTotals = await queryIndependentSqlTotals(projectId);

            const apiMap = new Map(apiItems.map((it) => [it.id, it]));

            for (const node of flatNodes) {
              const apiItem = apiMap.get(node.id);
              expect(apiItem).toBeDefined();

              // (I4): Mọi giá trị tiền là chuỗi đúng 2 chữ số thập phân, không dấu +, không khoa học
              if (apiItem.contract_total != null) {
                expect(apiItem.contract_total).toMatch(/^\d+\.\d{2}$/);
              }
              if (apiItem.contract_value != null) {
                expect(apiItem.contract_value).toMatch(/^\d+\.\d{2}$/);
              }

              // (I1) & (I2) & (I5): Khớp tuyệt đối với Oracle và SQL độc lập
              const expectedTotal = oracle.nodeTotals.get(node.id);
              const expectedSqlTotal = sqlTotals.get(node.id) || "0.00";

              expect(apiItem.contract_total).toBe(expectedTotal);
              expect(apiItem.contract_total).toBe(expectedSqlTotal);
            }

            // (I3): project_total bằng tổng contract_total các gốc
            expect(projectTotalApi).toBe(oracle.projectTotal);
          } catch (err) {
            console.error(
              `[FUZZ FAILURE] Seed: ${seed}, Op Index: ${opIdx}, Action: ${opLog}\nHistory:`,
              JSON.stringify(actionHistory, null, 2)
            );
            throw err;
          }
        }
      },
      30000 // Timeout 30s cho mỗi seed
    );
  });
});
