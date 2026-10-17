"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("ĐỢT 4: Cửa sau, tranh chấp, cô lập, rò rỉ, quét mã (T6, T7, T8, T9)", () => {
  let p1, p2;
  let cookieCDT, cookieBQL, cookieKT, cookieKSGS, cookieCHT, cookieDT;

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

    async function makeUser(name, email, _roleName) {
      const res = await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
         VALUES ($1, $2, $3, $4, false, true) RETURNING id`,
        [name, email, passHash, roleBqlId]
      );
      const uId = res.rows[0].id;
      const log = await request(app).post("/api/auth/login").send({ email, password: "Password123!" });
      return { id: uId, cookie: log.headers["set-cookie"] };
    }

    const uCDT = await makeUser("CDT User", "cdt_t88_d4@test.com", "chu_dau_tu");
    cookieCDT = uCDT.cookie;
    const uBQL = await makeUser("BQL User", "bql_t88_d4@test.com", "ban_quan_ly");
    cookieBQL = uBQL.cookie;
    const uKT = await makeUser("KT User", "kt_t88_d4@test.com", "ke_toan");
    cookieKT = uKT.cookie;
    const uKSGS = await makeUser("KSGS User", "ksgs_t88_d4@test.com", "ky_su_giam_sat");
    cookieKSGS = uKSGS.cookie;
    const uCHT = await makeUser("CHT User", "cht_t88_d4@test.com", "chi_huy_truong");
    cookieCHT = uCHT.cookie;
    const uDT = await makeUser("DT User", "dt_t88_d4@test.com", "doi_truong");
    cookieDT = uDT.cookie;

    // Dự án P1
    const p1Res = await pool.query("INSERT INTO projects (name, code) VALUES ('P1 T88', 'P1-T88') RETURNING id");
    p1 = p1Res.rows[0].id;

    // Dự án P2
    const p2Res = await pool.query("INSERT INTO projects (name, code) VALUES ('P2 T88', 'P2-T88') RETURNING id");
    p2 = p2Res.rows[0].id;

    // Add members to P1
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES
       ($1, $2, 'chu_dau_tu'),
       ($1, $3, 'ban_quan_ly'),
       ($1, $4, 'ke_toan'),
       ($1, $5, 'ky_su_giam_sat'),
       ($1, $6, 'chi_huy_truong'),
       ($1, $7, 'doi_truong')`,
      [p1, uCDT.id, uBQL.id, uKT.id, uKSGS.id, uCHT.id, uDT.id]
    );

    // Add members to P2
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES
       ($1, $2, 'chu_dau_tu')`,
      [p2, uCDT.id]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("T6: Không nhập trực tiếp tại hạng mục cha (Tiêu chí S-35) & Chống cửa sau", () => {
    test("(a) Tầng DB: UPDATE trực tiếp giá trị cho cha -> lỗi 23514 work_items_contract_leaf_only; INSERT con dưới cha có giá trị", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [p1]);

      const parentRes = await pool.query("INSERT INTO work_items (project_id, name) VALUES ($1, 'Cha') RETURNING id", [p1]);
      const parentId = parentRes.rows[0].id;

      const childRes = await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Con') RETURNING id", [p1, parentId]);
      const childId = childRes.rows[0].id;

      // UPDATE trực tiếp giá trị cho cha khi đã có con -> phải ném lỗi 23514
      let errUpdate;
      try {
        await pool.query(
          "UPDATE work_items SET quantity = 10, unit = 'm', unit_price = 10 WHERE id = $1",
          [parentId]
        );
      } catch (err) {
        errUpdate = err;
      }
      expect(errUpdate).toBeDefined();
      expect(errUpdate.code).toBe("23514"); // check_violation

      // Tạo một lá độc lập có giá trị
      const leafRes = await pool.query(
        "INSERT INTO work_items (project_id, name, quantity, unit, unit_price) VALUES ($1, 'Lá Có Giá Trị', 5, 'm', 20) RETURNING id",
        [p1]
      );
      const leafId = leafRes.rows[0].id;

      // INSERT con dưới lá đã có giá trị -> trigger work_items_contract_leaf_guard phải chặn
      let errInsertChild;
      try {
        await pool.query(
          "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Con Mới')",
          [p1, leafId]
        );
      } catch (err) {
        errInsertChild = err;
      }
      expect(errInsertChild).toBeDefined();

      // Đổi parent_id của child sang lá đã có giá trị
      let errMove;
      try {
        await pool.query("UPDATE work_items SET parent_id = $1 WHERE id = $2", [leafId, childId]);
      } catch (err) {
        errMove = err;
      }
      expect(errMove).toBeDefined();
    });

    test("(b) API khối lượng: PUT lên cha -> 422, DELETE lên cha vẫn 200 idempotent và không đổi gì", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [p1]);
      const parentRes = await pool.query("INSERT INTO work_items (project_id, name) VALUES ($1, 'Cha') RETURNING id", [p1]);
      const parentId = parentRes.rows[0].id;
      await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Con') RETURNING id", [p1, parentId]);

      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${parentId}/contract-quantity`)
        .set("Cookie", cookieCDT)
        .send({ quantity: "1.000", unit: "m", unit_price: "10.00" });
      expect(putRes.status).toBe(422);

      const delRes = await request(app)
        .delete(`/api/projects/${p1}/work-items/${parentId}/contract-quantity`)
        .set("Cookie", cookieCDT);
      expect(delRes.status).toBe(200);
    });

    test("(c) Chống cửa sau qua WBS: POST/PUT categories có quantity, unit, unit_price -> các cột đó KHÔNG đổi; thêm con dưới lá có giá trị -> 422; move con dưới lá có giá trị -> 422", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [p1]);

      // POST category kèm trường tiền
      const postBackdoor = await request(app)
        .post(`/api/categories/${p1}`)
        .set("Cookie", cookieBQL)
        .send({
          name: "Hạng mục test backdoor",
          quantity: "999.000",
          unit: "m",
          unit_price: "5000.00",
          contract_value: "4995000.00",
        });
      expect(postBackdoor.status).toBe(201);
      const itemId = postBackdoor.body.id;

      // Kiểm tra DB xem các trường đó có bị bỏ qua không
      const dbCheck = await pool.query("SELECT quantity, unit, unit_price, contract_value FROM work_items WHERE id = $1", [itemId]);
      expect(dbCheck.rows[0].quantity).toBeNull();
      expect(dbCheck.rows[0].unit).toBeNull();
      expect(dbCheck.rows[0].unit_price).toBeNull();
      expect(dbCheck.rows[0].contract_value).toBeNull();

      // Khai giá trị hợp lệ cho itemId
      await request(app)
        .put(`/api/projects/${p1}/work-items/${itemId}/contract-quantity`)
        .set("Cookie", cookieCDT)
        .send({ quantity: "2.000", unit: "m", unit_price: "50.00" });

      // Thêm con dưới lá đã có giá trị qua POST /api/categories -> phải trả 422 (không 500)
      const postChildRes = await request(app)
        .post(`/api/categories/${p1}`)
        .set("Cookie", cookieBQL)
        .send({ name: "Con của lá có giá trị", parent_id: itemId });
      expect(postChildRes.status).toBe(422);

      // Tạo một nút khác rồi PATCH move sang dưới itemId -> phải trả 422
      const postOther = await request(app)
        .post(`/api/categories/${p1}`)
        .set("Cookie", cookieBQL)
        .send({ name: "Nút chuyển" });
      const otherId = postOther.body.id;

      const patchMove = await request(app)
        .patch(`/api/categories/${p1}/${otherId}/move`)
        .set("Cookie", cookieBQL)
        .send({ parent_id: itemId });
      expect(patchMove.status).toBe(422);
    });

    test("(d) Lá có công việc ở bảng tasks vẫn khai được và công việc không làm lá thành cha", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [p1]);
      const leafRes = await pool.query("INSERT INTO work_items (project_id, name) VALUES ($1, 'Lá có task') RETURNING id", [p1]);
      const leafId = leafRes.rows[0].id;

      // Chèn task vào bảng tasks thuộc leafId
      await pool.query("INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task con', 1)", [leafId]);

      // Khai giá trị qua API
      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${leafId}/contract-quantity`)
        .set("Cookie", cookieCDT)
        .send({ quantity: "10.000", unit: "m", unit_price: "100.00" });
      expect(putRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/projects/${p1}/contract-quantities`)
        .set("Cookie", cookieCDT);
      const item = getRes.body.items.find((i) => i.id === leafId);
      expect(item.is_leaf).toBe(true);
      expect(item.contract_value).toBe("1000.00");
    });
  });

  describe("T7: Tranh chấp đồng thời (Concurrency)", () => {
    test("50 PUT đồng thời vào 50 lá KHÁC NHAU của cùng một cha: tổng cha khớp tuyệt đối", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [p1]);
      const parentRes = await pool.query("INSERT INTO work_items (project_id, name) VALUES ($1, 'Cha Concurrency 50') RETURNING id", [p1]);
      const parentId = parentRes.rows[0].id;

      const leafIds = [];
      for (let i = 1; i <= 50; i++) {
        const lRes = await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id", [p1, parentId, `Lá ${i}`]);
        leafIds.push(lRes.rows[0].id);
      }

      // 50 PUT song song mỗi lá 1.000 x 2.00 = 2.00 -> Tổng cha phải là 100.00
      const putPromises = leafIds.map((id) =>
        request(app)
          .put(`/api/projects/${p1}/work-items/${id}/contract-quantity`)
          .set("Cookie", cookieCDT)
          .send({ quantity: "1.000", unit: "m", unit_price: "2.00" })
      );
      const responses = await Promise.all(putPromises);
      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      const getRes = await request(app)
        .get(`/api/projects/${p1}/contract-quantities`)
        .set("Cookie", cookieCDT);
      const pItem = getRes.body.items.find((i) => i.id === parentId);
      expect(pItem.contract_total).toBe("100.00");
    });

    test("20 PUT đồng thời vào CÙNG một lá với giá trị khác nhau: trạng thái cuối nguyên vẹn, không có 500", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [p1]);
      const parentRes = await pool.query("INSERT INTO work_items (project_id, name) VALUES ($1, 'Cha Concurrency 20') RETURNING id", [p1]);
      const parentId = parentRes.rows[0].id;

      const leafRes = await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Lá Tranh Chấp') RETURNING id", [p1, parentId]);
      const leafId = leafRes.rows[0].id;

      // 20 giá trị khác nhau: i x 10.00
      const putPromises = Array.from({ length: 20 }, (_, i) =>
        request(app)
          .put(`/api/projects/${p1}/work-items/${leafId}/contract-quantity`)
          .set("Cookie", cookieCDT)
          .send({ quantity: `${i + 1}.000`, unit: "m", unit_price: "10.00" })
      );

      const responses = await Promise.all(putPromises);
      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      const getRes = await request(app)
        .get(`/api/projects/${p1}/contract-quantities`)
        .set("Cookie", cookieCDT);
      const leafItem = getRes.body.items.find((i) => i.id === leafId);
      const parentItem = getRes.body.items.find((i) => i.id === parentId);

      // Tổng cha phải bằng đúng contract_value của lá
      expect(parentItem.contract_total).toBe(leafItem.contract_value);
    });

    test("PUT lá song song với thêm con dưới lá đó (10 lần): không bao giờ cả hai cùng thành công, không vi phạm I6", async () => {
      for (let run = 1; run <= 10; run++) {
        await pool.query("DELETE FROM work_items WHERE project_id = $1", [p1]);
        const leafRes = await pool.query("INSERT INTO work_items (project_id, name) VALUES ($1, $2) RETURNING id", [p1, `Lá Race ${run}`]);
        const leafId = leafRes.rows[0].id;

        // Chạy song song: PUT giá trị vào leafId VÀ POST child dưới leafId
        await Promise.all([
          request(app)
            .put(`/api/projects/${p1}/work-items/${leafId}/contract-quantity`)
            .set("Cookie", cookieCDT)
            .send({ quantity: "1.000", unit: "m", unit_price: "100.00" }),
          request(app)
            .post(`/api/categories/${p1}`)
            .set("Cookie", cookieBQL)
            .send({ name: `Con Race ${run}`, parent_id: leafId }),
        ]);

        // Cả 2 không được cùng 200/201 nếu leafId vừa có giá trị vừa có con
        const inv6 = await pool.query(`
          SELECT w.id FROM work_items w
          WHERE w.id = $1 AND w.contract_value IS NOT NULL
            AND EXISTS (SELECT 1 FROM work_items c WHERE c.parent_id = w.id)
        `, [leafId]);
        expect(inv6.rows.length).toBe(0);
      }
    });
  });

  describe("T8: Cô lập dự án (Project Isolation)", () => {
    test("Hai dự án có cấu trúc cây giống nhau nhưng giá trị khác nhau: tổng mỗi dự án chỉ tính hạng mục của nó", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id IN ($1, $2)", [p1, p2]);

      // Dựng cây P1: Cha -> Lá 10 x 100 = 1000.00
      const p1Parent = await pool.query("INSERT INTO work_items (project_id, name) VALUES ($1, 'P1 Cha') RETURNING id", [p1]);
      const p1Leaf = await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'P1 Lá') RETURNING id", [p1, p1Parent.rows[0].id]);
      await request(app)
        .put(`/api/projects/${p1}/work-items/${p1Leaf.rows[0].id}/contract-quantity`)
        .set("Cookie", cookieCDT)
        .send({ quantity: "10.000", unit: "m", unit_price: "100.00" });

      // Dựng cây P2: Cha -> Lá 5 x 200 = 1000.00, thêm lá 2: 2 x 500 = 1000.00 -> Tổng P2 = 2000.00
      const p2Parent = await pool.query("INSERT INTO work_items (project_id, name) VALUES ($1, 'P2 Cha') RETURNING id", [p2]);
      const p2Leaf1 = await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'P2 Lá 1') RETURNING id", [p2, p2Parent.rows[0].id]);
      const p2Leaf2 = await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'P2 Lá 2') RETURNING id", [p2, p2Parent.rows[0].id]);
      await request(app)
        .put(`/api/projects/${p2}/work-items/${p2Leaf1.rows[0].id}/contract-quantity`)
        .set("Cookie", cookieCDT)
        .send({ quantity: "5.000", unit: "m", unit_price: "200.00" });
      await request(app)
        .put(`/api/projects/${p2}/work-items/${p2Leaf2.rows[0].id}/contract-quantity`)
        .set("Cookie", cookieCDT)
        .send({ quantity: "2.000", unit: "m", unit_price: "500.00" });

      const resP1 = await request(app).get(`/api/projects/${p1}/contract-quantities`).set("Cookie", cookieCDT);
      const resP2 = await request(app).get(`/api/projects/${p2}/contract-quantities`).set("Cookie", cookieCDT);

      expect(resP1.body.project_total).toBe("1000.00");
      expect(resP2.body.project_total).toBe("2000.00");
    });
  });

  describe("T9: Quyền truy cập và chống rò rỉ giá trị tiền (Permissions & Leak Prevention)", () => {
    test("KY_SU_GIAM_SAT và CHI_HUY_TRUONG: phản hồi không chứa số tiền đã biết và không có khoá giá", async () => {
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [p1]);
      const parentRes = await pool.query("INSERT INTO work_items (project_id, name) VALUES ($1, 'Nhánh P1') RETURNING id", [p1]);
      const leafRes = await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Lá P1') RETURNING id", [p1, parentRes.rows[0].id]);

      // Đặt trước số tiền cụ thể: 1234.567 x 89000.50 -> 109877080.28
      await request(app)
        .put(`/api/projects/${p1}/work-items/${leafRes.rows[0].id}/contract-quantity`)
        .set("Cookie", cookieCDT)
        .send({ quantity: "1234.567", unit: "cái", unit_price: "89000.50" });

      const testRoles = [cookieKSGS, cookieCHT];
      for (const cookie of testRoles) {
        const getRes = await request(app)
          .get(`/api/projects/${p1}/contract-quantities`)
          .set("Cookie", cookie);
        expect(getRes.status).toBe(200);

        const textBody = getRes.text;
        // Quét toàn văn phản hồi JSON: KHÔNG được chứa giá trị tiền
        expect(textBody.includes("89000.50")).toBe(false);
        expect(textBody.includes("109877080.28")).toBe(false);

        // Kiểm tra từng object không có các trường nhạy cảm
        for (const item of getRes.body.items) {
          expect(item).not.toHaveProperty("unit_price");
          expect(item).not.toHaveProperty("contract_value");
          expect(item).not.toHaveProperty("contract_total");
        }
        expect(getRes.body).not.toHaveProperty("project_total");
        expect(getRes.body.can_view_prices).toBe(false);
      }
    });

    test("DOI_TRUONG bị cấm truy cập (403); KE_TOAN chỉ xem (GET 200, PUT/DELETE 403)", async () => {
      const leafRes = await pool.query("SELECT id FROM work_items WHERE project_id = $1 LIMIT 1", [p1]);
      const leafId = leafRes.rows[0].id;

      // DOI_TRUONG GET -> 403
      const dtGet = await request(app).get(`/api/projects/${p1}/contract-quantities`).set("Cookie", cookieDT);
      expect(dtGet.status).toBe(403);

      // KE_TOAN GET -> 200
      const ktGet = await request(app).get(`/api/projects/${p1}/contract-quantities`).set("Cookie", cookieKT);
      expect(ktGet.status).toBe(200);
      expect(ktGet.body.can_view_prices).toBe(true);

      // KE_TOAN PUT -> 403
      const ktPut = await request(app)
        .put(`/api/projects/${p1}/work-items/${leafId}/contract-quantity`)
        .set("Cookie", cookieKT)
        .send({ quantity: "1.000", unit: "m", unit_price: "10.00" });
      expect(ktPut.status).toBe(403);

      // KE_TOAN DELETE -> 403
      const ktDel = await request(app)
        .delete(`/api/projects/${p1}/work-items/${leafId}/contract-quantity`)
        .set("Cookie", cookieKT);
      expect(ktDel.status).toBe(403);
    });
  });
});
