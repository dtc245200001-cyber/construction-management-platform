"use strict";

const path = require("path");
const request = require("supertest");
const argon2 = require("argon2");
const app = require("../../app");
const pool = require("../../config/db");
const runner = require("node-pg-migrate").default || require("node-pg-migrate");

describe("T-119: API tạo, xem, cập nhật phiên bản dự toán và cộng tổng theo cây (S-46)", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_URL ||
    "postgres://postgres:khanhhoa123!@localhost:5432/construction_db_test";

  let bqlCookie;
  let bqlUserId;
  let keToanCookie;
  let keToanUserId;
  let doiTruongCookie;
  let outsiderCookie;

  let testProjectId;
  let parentWorkItemId;
  let leafWorkItemId1;
  let leafWorkItemId2;

  const projectCode = `PRJ-T119-${Date.now()}`;

  beforeAll(async () => {
    // 1. Chạy migration up
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "../../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      checkOrder: false,
      log: () => {},
    });

    // 2. Tạo hoặc lấy roles
    const rolesRes = await pool.query(
      "SELECT id, name FROM roles WHERE name IN ('ban_quan_ly', 'ke_toan', 'doi_truong')"
    );
    const roleMap = new Map(rolesRes.rows.map((r) => [r.name, r.id]));
    const bqlRoleId = roleMap.get("ban_quan_ly") || 1;
    const keToanRoleId = roleMap.get("ke_toan") || 6;
    const doiTruongRoleId = roleMap.get("doi_truong") || 4;

    const passHash = await argon2.hash("Password123!");

    // Helper tạo và login user (dùng passHash đã tính trước để test chạy nhanh)
    async function createUserAndLogin(name, email, roleId) {
      const uRes = await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
         VALUES ($1, $2, $3, $4, false, true)
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [name, email, passHash, roleId]
      );
      const userId = uRes.rows[0].id;

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email,
          password: "Password123!",
        });

      return {
        userId,
        cookie: loginRes.headers["set-cookie"],
      };
    }

    const bqlUser = await createUserAndLogin(
      "BQL T119",
      `bql_t119_${Date.now()}@test.com`,
      bqlRoleId
    );
    bqlUserId = bqlUser.userId;
    bqlCookie = bqlUser.cookie;

    const keToanUser = await createUserAndLogin(
      "Ke Toan T119",
      `ketoan_t119_${Date.now()}@test.com`,
      keToanRoleId
    );
    keToanUserId = keToanUser.userId;
    keToanCookie = keToanUser.cookie;

    const doiTruongUser = await createUserAndLogin(
      "Doi Truong T119",
      `doitruong_t119_${Date.now()}@test.com`,
      doiTruongRoleId
    );
    doiTruongCookie = doiTruongUser.cookie;

    const outsiderUser = await createUserAndLogin(
      "Outsider T119",
      `outsider_t119_${Date.now()}@test.com`,
      bqlRoleId
    );
    outsiderCookie = outsiderUser.cookie;

    // 3. Tạo dự án kiểm thử
    const projRes = await pool.query(`
      INSERT INTO projects (name, code, start_date)
      VALUES ('Dự án Kiểm thử T-119', $1, '2026-10-01')
      RETURNING id
    `, [projectCode]);
    testProjectId = projRes.rows[0].id;

    // 4. Gán project members (cột role là string)
    await pool.query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES
        ($1, $2, 'ban_quan_ly'),
        ($1, $3, 'ke_toan'),
        ($1, $4, 'doi_truong')
    `, [
      testProjectId,
      bqlUserId,
      keToanUser.userId,
      doiTruongUser.userId,
    ]);

    // 5. Tạo cây WBS: Cha (Phần móng) -> 2 Con lá (Bê tông, Cốt thép)
    const parentRes = await pool.query(`
      INSERT INTO work_items (project_id, name, code)
      VALUES ($1, 'Phần móng công trình', 'HM-01')
      RETURNING id
    `, [testProjectId]);
    parentWorkItemId = parentRes.rows[0].id;

    const leaf1Res = await pool.query(`
      INSERT INTO work_items (project_id, parent_id, name, code)
      VALUES ($1, $2, 'Đổ bê tông móng', 'HM-01.01')
      RETURNING id
    `, [testProjectId, parentWorkItemId]);
    leafWorkItemId1 = leaf1Res.rows[0].id;

    const leaf2Res = await pool.query(`
      INSERT INTO work_items (project_id, parent_id, name, code)
      VALUES ($1, $2, 'Gia công cốt thép móng', 'HM-01.02')
      RETURNING id
    `, [testProjectId, parentWorkItemId]);
    leafWorkItemId2 = leaf2Res.rows[0].id;
  });

  afterAll(async () => {
    if (testProjectId) {
      await pool.query("DELETE FROM actual_costs WHERE project_id = $1", [testProjectId]).catch(() => {});
      await pool.query("DELETE FROM budget_versions WHERE project_id = $1", [testProjectId]).catch(() => {});
      await pool.query("DELETE FROM work_items WHERE project_id = $1", [testProjectId]).catch(() => {});
      await pool.query("DELETE FROM project_members WHERE project_id = $1", [testProjectId]).catch(() => {});
      await pool.query("DELETE FROM projects WHERE id = $1", [testProjectId]).catch(() => {});
    }
  });

  describe("1. Kiểm tra phân quyền truy cập (Project Access & Role Permissions)", () => {
    it("Từ chối khi chưa đăng nhập (401)", async () => {
      const res = await request(app).get(`/api/projects/${testProjectId}/budgets`);
      expect(res.status).toBe(401);
    });

    it("Từ chối khi người dùng không thuộc dự án (403)", async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", outsiderCookie);
      expect(res.status).toBe(403);
    });

    it("Đội trưởng không có quyền nhập/cập nhật dự toán (403)", async () => {
      const res = await request(app)
        .post(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", doiTruongCookie)
        .send({
          description: "Dự toán từ đội trưởng",
          items: [{ work_item_id: leafWorkItemId1, amount: 50000000 }],
        });
      expect(res.status).toBe(403);
    });

    it("Kế toán có quyền xem dự toán (200)", async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", keToanCookie);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("versions");
      expect(res.body.has_actual_costs).toBe(false);
    });
  });

  describe("2. Chặn nhập trực tiếp ở hạng mục cha (Leaf-only Guard)", () => {
    it("Từ chối 422 khi cố gắng nhập dự toán cho hạng mục cha", async () => {
      const res = await request(app)
        .post(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", bqlCookie)
        .send({
          description: "Cố tình nhập vào cha",
          items: [
            { work_item_id: parentWorkItemId, amount: 200000000 },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/Chỉ được nhập dự toán cho hạng mục lá/);
    });
  });

  describe("3. Tạo phiên bản dự toán ban đầu và tính tổng đệ quy theo cây (Rollup)", () => {
    it("Ban quản lý tạo phiên bản dự toán v1 cho các hạng mục lá thành công (201)", async () => {
      const res = await request(app)
        .post(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", bqlCookie)
        .send({
          description: "Dự toán ban đầu duyệt lần 1",
          items: [
            { work_item_id: leafWorkItemId1, amount: 120000000.00, note: "Dự toán bê tông" },
            { work_item_id: leafWorkItemId2, amount: 80000000.00, note: "Dự toán thép" },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.version.version_number).toBe(1);
      expect(res.body.project_total).toBe("200000000.00");
    });

    it("GET /budgets/tree: Tổng cha bằng tổng các lá con cháu, cha không có amount trực tiếp", async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjectId}/budgets/tree`)
        .set("Cookie", bqlCookie);

      expect(res.status).toBe(200);
      expect(res.body.version.version_number).toBe(1);
      expect(res.body.project_total).toBe("200000000.00");

      const items = res.body.items;
      const parent = items.find((i) => i.id === parentWorkItemId);
      const leaf1 = items.find((i) => i.id === leafWorkItemId1);
      const leaf2 = items.find((i) => i.id === leafWorkItemId2);

      // Node cha: không có amount trực tiếp (null), nhưng total_budget bằng tổng 2 lá
      expect(parent.is_leaf).toBe(false);
      expect(parent.amount).toBeNull();
      expect(parent.total_budget).toBe("200000000.00");

      // Node lá 1 & 2: có amount và total_budget đúng
      expect(leaf1.is_leaf).toBe(true);
      expect(leaf1.amount).toBe("120000000.00");
      expect(leaf1.total_budget).toBe("120000000.00");

      expect(leaf2.is_leaf).toBe(true);
      expect(leaf2.amount).toBe("80000000.00");
      expect(leaf2.total_budget).toBe("80000000.00");
    });
  });

  describe("4. Thay đổi sau khi có thực chi bắt buộc tạo phiên bản mới (Bảo lưu lịch sử)", () => {
    it("Ghi nhận chi phí thực tế vào actual_costs (S-47)", async () => {
      await pool.query(`
        INSERT INTO actual_costs (project_id, work_item_id, amount, description, expense_date, created_by)
        VALUES ($1, $2, 45000000.00, 'Thanh toán tiền mua bê tông đợt 1', '2026-10-15', $3)
      `, [testProjectId, leafWorkItemId1, bqlUserId]);

      // Kiểm tra has_actual_costs giờ là true
      const resVersions = await request(app)
        .get(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", bqlCookie);

      expect(resVersions.body.has_actual_costs).toBe(true);
    });

    it("Khi đã có thực chi, lưu dự toán điều chỉnh BẮT BUỘC tự động tạo phiên bản mới v2", async () => {
      const res = await request(app)
        .post(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", bqlCookie)
        .send({
          description: "Điều chỉnh dự toán sau khi phát sinh chi phí thực tế",
          items: [
            { work_item_id: leafWorkItemId1, amount: 150000000.00, note: "Tăng dự toán bê tông" },
            { work_item_id: leafWorkItemId2, amount: 80000000.00, note: "Giữ nguyên thép" },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.version.version_number).toBe(2);
      expect(res.body.is_new_version).toBe(true);
      expect(res.body.project_total).toBe("230000000.00");
    });

    it("Phiên bản cũ v1 vẫn xem lại được đầy đủ (không bị ghi đè mất lịch sử)", async () => {
      const resV1 = await request(app)
        .get(`/api/projects/${testProjectId}/budgets/tree?version=1`)
        .set("Cookie", bqlCookie);

      expect(resV1.status).toBe(200);
      expect(resV1.body.version.version_number).toBe(1);
      expect(resV1.body.project_total).toBe("200000000.00");

      const itemsV1 = resV1.body.items;
      const leaf1V1 = itemsV1.find((i) => i.id === leafWorkItemId1);
      expect(leaf1V1.amount).toBe("120000000.00");
    });

    it("Phiên bản mới v2 hiển thị đúng số liệu mới cập nhật", async () => {
      const resV2 = await request(app)
        .get(`/api/projects/${testProjectId}/budgets/tree?version=2`)
        .set("Cookie", bqlCookie);

      expect(resV2.status).toBe(200);
      expect(resV2.body.version.version_number).toBe(2);
      expect(resV2.body.project_total).toBe("230000000.00");

      const itemsV2 = resV2.body.items;
      const parentV2 = itemsV2.find((i) => i.id === parentWorkItemId);
      const leaf1V2 = itemsV2.find((i) => i.id === leafWorkItemId1);

      expect(parentV2.total_budget).toBe("230000000.00");
      expect(leaf1V2.amount).toBe("150000000.00");
    });
  });

  describe("5. Giải trình vượt dự toán 1 cấp & Nguyên tắc bắt buộc: Cấm tự duyệt (Separation of Duties)", () => {
    let cdt1Cookie;
    let cdt1UserId;
    let cdt2Cookie;
    let cdt2UserId;
    let soloProjectId;
    let soloLeafItemId;
    let bqlJustificationId;
    let cdt1JustificationId;

    beforeAll(async () => {
      const rolesRes = await pool.query(
        "SELECT id FROM roles WHERE name = 'chu_dau_tu' LIMIT 1"
      );
      const cdtRoleId = rolesRes.rows[0]?.id || 5;
      const passHash = await argon2.hash("Password123!");

      async function createCdtAndLogin(name, email) {
        const uRes = await pool.query(
          `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
           VALUES ($1, $2, $3, $4, false, true)
           ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [name, email, passHash, cdtRoleId]
        );
        const userId = uRes.rows[0].id;
        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({ email, password: "Password123!" });

        return { userId, cookie: loginRes.headers["set-cookie"] };
      }

      const cdt1 = await createCdtAndLogin(
        "Ông Trần Hoàng (Chủ đầu tư 1)",
        `cdt1_t119_${Date.now()}@test.com`
      );
      cdt1UserId = cdt1.userId;
      cdt1Cookie = cdt1.cookie;

      const cdt2 = await createCdtAndLogin(
        "Bà Nguyễn Lan (Chủ đầu tư 2)",
        `cdt2_t119_${Date.now()}@test.com`
      );
      cdt2UserId = cdt2.userId;
      cdt2Cookie = cdt2.cookie;

      // Thêm cả 2 Chủ đầu tư vào dự án chính testProjectId
      await pool.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'chu_dau_tu'), ($1, $3, 'chu_dau_tu')`,
        [testProjectId, cdt1UserId, cdt2UserId]
      );

      // Tạo thêm dự án phụ chỉ có DUY NHẤT 1 Chủ đầu tư (cdt1) để test Quy tắc 6 (không có người duyệt độc lập)
      const soloProjRes = await pool.query(
        `INSERT INTO projects (name, code, start_date)
         VALUES ('Dự án 1 CĐT Duy nhất', $1, '2026-10-01')
         RETURNING id`,
        [`PRJ-SOLO-CDT-${Date.now()}`]
      );
      soloProjectId = soloProjRes.rows[0].id;

      await pool.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'chu_dau_tu')`,
        [soloProjectId, cdt1UserId]
      );

      const soloLeafRes = await pool.query(
        `INSERT INTO work_items (project_id, name, code)
         VALUES ($1, 'Hạng mục lá dự án 1 CĐT', 'HM-SOLO-01')
         RETURNING id`,
        [soloProjectId]
      );
      soloLeafItemId = soloLeafRes.rows[0].id;
    });

    afterAll(async () => {
      if (testProjectId) {
        await pool
          .query(
            "DELETE FROM budget_overrun_justifications WHERE project_id = $1",
            [testProjectId]
          )
          .catch(() => {});
      }
      if (soloProjectId) {
        await pool
          .query(
            "DELETE FROM budget_overrun_justifications WHERE project_id = $1",
            [soloProjectId]
          )
          .catch(() => {});
        await pool
          .query("DELETE FROM work_items WHERE project_id = $1", [
            soloProjectId,
          ])
          .catch(() => {});
        await pool
          .query("DELETE FROM project_members WHERE project_id = $1", [
            soloProjectId,
          ])
          .catch(() => {});
        await pool
          .query("DELETE FROM projects WHERE id = $1", [soloProjectId])
          .catch(() => {});
      }
    });

    it("Quy tắc 1: Người dùng có quyền lập giải trình (Ban quản lý / Chủ đầu tư) tạo và gửi giải trình để duyệt", async () => {
      // Kế toán không có quyền lập giải trình -> 403
      const forbiddenRes = await request(app)
        .post(`/api/projects/${testProjectId}/budgets/justifications`)
        .set("Cookie", keToanCookie)
        .send({
          work_item_id: leafWorkItemId1,
          reason_type: "Trượt giá vật tư / nhân công thực tế",
          explanation: "Kế toán thử tạo giải trình",
        });
      expect(forbiddenRes.status).toBe(403);

      // Ban quản lý tạo giải trình -> 201 PENDING_APPROVAL
      const bqlCreateRes = await request(app)
        .post(`/api/projects/${testProjectId}/budgets/justifications`)
        .set("Cookie", bqlCookie)
        .send({
          work_item_id: leafWorkItemId1,
          reason_type: "Trượt giá vật tư / nhân công thực tế",
          explanation: "Đơn giá bê tông thương phẩm tăng 8% so với thời điểm lập dự toán v2.",
        });

      expect(bqlCreateRes.status).toBe(201);
      expect(bqlCreateRes.body.has_independent_reviewer).toBe(true);
      expect(bqlCreateRes.body.justification.status).toBe("PENDING_APPROVAL");
      expect(bqlCreateRes.body.justification.submitted_by).toBe(bqlUserId);
      expect(bqlCreateRes.body.justification.submitted_by_name).toBe("BQL T119");
      bqlJustificationId = bqlCreateRes.body.justification.id;

      // Chủ đầu tư 1 cũng có thể lập giải trình -> 201 PENDING_APPROVAL (vì có Chủ đầu tư 2 độc lập)
      const cdt1CreateRes = await request(app)
        .post(`/api/projects/${testProjectId}/budgets/justifications`)
        .set("Cookie", cdt1Cookie)
        .send({
          work_item_id: leafWorkItemId2,
          reason_type: "Phát sinh khối lượng ngoài dự kiến",
          explanation: "Tăng cường thép gia cố dầm móng theo biên bản hiện trường.",
        });

      expect(cdt1CreateRes.status).toBe(201);
      expect(cdt1CreateRes.body.justification.status).toBe("PENDING_APPROVAL");
      expect(cdt1CreateRes.body.justification.submitted_by).toBe(cdt1UserId);
      cdt1JustificationId = cdt1CreateRes.body.justification.id;
    });

    it("Quy tắc 2 & 3: Người lập KHÔNG THỂ tự duyệt giải trình của chính mình (kể cả giữ vai trò Chủ đầu tư), API trả 403 và thông báo rõ ràng", async () => {
      // Chủ đầu tư 1 cố tình bấm duyệt giải trình do chính Chủ đầu tư 1 vừa lập
      const selfApproveRes = await request(app)
        .post(
          `/api/projects/${testProjectId}/budgets/justifications/${cdt1JustificationId}/review`
        )
        .set("Cookie", cdt1Cookie)
        .send({
          decision: "APPROVED",
          review_note: "Tự duyệt luôn cho nhanh",
        });

      expect(selfApproveRes.status).toBe(403);
      expect(selfApproveRes.body.message).toMatch(
        /Người lập giải trình không được phép duyệt hoặc từ chối chính giải trình đó, bất kể giữ vai trò gì/
      );

      // Ban quản lý cố tình gọi API duyệt -> bị chặn bởi phân quyền budget.approve_overrun (403)
      const bqlApproveRes = await request(app)
        .post(
          `/api/projects/${testProjectId}/budgets/justifications/${bqlJustificationId}/review`
        )
        .set("Cookie", bqlCookie)
        .send({
          decision: "APPROVED",
        });
      expect(bqlApproveRes.status).toBe(403);
    });

    it("Quy tắc 4 & 5: Người có quyền duyệt (Chủ đầu tư) và KHÔNG PHẢI người lập có thể duyệt hoặc từ chối; hệ thống ghi nhận đầy đủ người lập, người duyệt, thời gian và kết quả", async () => {
      // Chủ đầu tư 1 duyệt giải trình của Ban quản lý -> 200 APPROVED
      const approveRes = await request(app)
        .post(
          `/api/projects/${testProjectId}/budgets/justifications/${bqlJustificationId}/review`
        )
        .set("Cookie", cdt1Cookie)
        .send({
          decision: "APPROVED",
          review_note: "Đồng ý giải trình trượt giá bê tông, cho phép lập phụ lục điều chỉnh v3.",
        });

      expect(approveRes.status).toBe(200);
      const approvedItem = approveRes.body.justification;
      expect(approvedItem.status).toBe("APPROVED");
      expect(approvedItem.submitted_by).toBe(bqlUserId);
      expect(approvedItem.submitted_by_name).toBe("BQL T119");
      expect(approvedItem.reviewed_by).toBe(cdt1UserId);
      expect(approvedItem.reviewed_by_name).toBe("Ông Trần Hoàng (Chủ đầu tư 1)");
      expect(approvedItem.submitted_at).toBeTruthy();
      expect(approvedItem.reviewed_at).toBeTruthy();
      expect(approvedItem.review_note).toBe(
        "Đồng ý giải trình trượt giá bê tông, cho phép lập phụ lục điều chỉnh v3."
      );

      // Chủ đầu tư 2 (độc lập với Chủ đầu tư 1) từ chối giải trình của Chủ đầu tư 1 -> 200 REJECTED
      const rejectRes = await request(app)
        .post(
          `/api/projects/${testProjectId}/budgets/justifications/${cdt1JustificationId}/review`
        )
        .set("Cookie", cdt2Cookie)
        .send({
          decision: "REJECTED",
          review_note: "Cần bổ sung bản vẽ hoàn công xác nhận khối lượng thép gia cố.",
        });

      expect(rejectRes.status).toBe(200);
      const rejectedItem = rejectRes.body.justification;
      expect(rejectedItem.status).toBe("REJECTED");
      expect(rejectedItem.submitted_by).toBe(cdt1UserId);
      expect(rejectedItem.reviewed_by).toBe(cdt2UserId);
      expect(rejectedItem.reviewed_by_name).toBe("Bà Nguyễn Lan (Chủ đầu tư 2)");
      expect(rejectedItem.reviewed_at).toBeTruthy();
      expect(rejectedItem.review_note).toMatch(/Cần bổ sung bản vẽ hoàn công/);
    });

    it("Quy tắc 6: Nếu không có người duyệt độc lập phù hợp, giải trình giữ trạng thái PENDING_ASSIGNMENT (Chờ phân công), tuyệt đối không tự động thông qua", async () => {
      // Dự án soloProjectId chỉ có duy nhất cdt1 là Chủ đầu tư. Khi cdt1 lập giải trình, không có ai khác độc lập để duyệt.
      const soloRes = await request(app)
        .post(`/api/projects/${soloProjectId}/budgets/justifications`)
        .set("Cookie", cdt1Cookie)
        .send({
          work_item_id: soloLeafItemId,
          reason_type: "Điều chỉnh biện pháp thi công",
          explanation: "Thay đổi phương án cừ larsen sang cọc vây xi măng đất.",
        });

      expect(soloRes.status).toBe(201);
      expect(soloRes.body.has_independent_reviewer).toBe(false);
      expect(soloRes.body.justification.status).toBe("PENDING_ASSIGNMENT");
      expect(soloRes.body.justification.status).not.toBe("APPROVED");
      expect(soloRes.body.justification.reviewed_by).toBeNull();
    });

    it("Chuẩn kiểm soát nội bộ 3 tác nhân (A1): Kế toán xác nhận đối chiếu số liệu & Chủ đầu tư chỉ duyệt được khi có đủ Số biên bản pháp lý + Xác nhận Kế toán (enforce_legal_checklist)", async () => {
      // 1. BQL lập giải trình mới nhưng chưa điền số văn bản pháp lý
      const createRes = await request(app)
        .post(`/api/projects/${testProjectId}/budgets/justifications`)
        .set("Cookie", bqlCookie)
        .send({
          work_item_id: leafWorkItemId1,
          reason_type: "Phát sinh khối lượng hiện trường đã có chủ trương",
          explanation: "Gia cố thêm cừ thép tại hố móng trục B-C.",
        });

      expect(createRes.status).toBe(201);
      const justId = createRes.body.justification.id;
      expect(createRes.body.justification.legal_document_ref).toBeNull();
      expect(createRes.body.justification.accountant_verified_by).toBeNull();

      // 2. Chủ đầu tư 1 thử duyệt ngay với enforce_legal_checklist = true -> Bị từ chối 422 vì thiếu Số văn bản pháp lý
      const missingRefApprove = await request(app)
        .post(`/api/projects/${testProjectId}/budgets/justifications/${justId}/review`)
        .set("Cookie", cdt1Cookie)
        .send({
          decision: "APPROVED",
          enforce_legal_checklist: true,
        });
      expect(missingRefApprove.status).toBe(422);
      expect(missingRefApprove.body.message).toMatch(/Số biên bản hiện trường \/ Tờ trình pháp lý/);

      // 3. BQL cập nhật lại giải trình có kèm Số biên bản pháp lý (08/BB-HT-2026)
      const updateWithRefRes = await request(app)
        .post(`/api/projects/${testProjectId}/budgets/justifications`)
        .set("Cookie", bqlCookie)
        .send({
          work_item_id: leafWorkItemId1,
          reason_type: "Phát sinh khối lượng hiện trường đã có chủ trương",
          explanation: "Gia cố thêm cừ thép tại hố móng trục B-C.",
          legal_document_ref: "08/BB-HT-2026",
        });
      expect(updateWithRefRes.status).toBe(201);
      const justWithRefId = updateWithRefRes.body.justification.id;
      expect(updateWithRefRes.body.justification.legal_document_ref).toBe("08/BB-HT-2026");

      // 4. Chủ đầu tư 1 thử duyệt khi có Số VB nhưng CHƯA có Kế toán xác nhận -> Bị từ chối 422
      const missingKtApprove = await request(app)
        .post(`/api/projects/${testProjectId}/budgets/justifications/${justWithRefId}/review`)
        .set("Cookie", cdt1Cookie)
        .send({
          decision: "APPROVED",
          enforce_legal_checklist: true,
        });
      expect(missingKtApprove.status).toBe(422);
      expect(missingKtApprove.body.message).toMatch(/xác nhận đối chiếu số liệu của Kế toán/);

      // 5. Kế toán (keToanCookie) gọi API xác nhận đối chiếu số liệu -> 200 OK
      const ktVerifyRes = await request(app)
        .post(`/api/projects/${testProjectId}/budgets/justifications/${justWithRefId}/verify`)
        .set("Cookie", keToanCookie)
        .send({
          accountant_note: "Đã đối chiếu khớp chứng từ thực chi S-47 và hồ sơ đề nghị TT S-43.",
        });
      expect(ktVerifyRes.status).toBe(200);
      expect(ktVerifyRes.body.justification.accountant_verified_by).toBe(keToanUserId);
      expect(ktVerifyRes.body.justification.accountant_verified_at).toBeTruthy();
      expect(ktVerifyRes.body.justification.accountant_note).toMatch(/Đã đối chiếu khớp chứng từ/);

      // 6. Chủ đầu tư 1 (độc lập với BQL) phê duyệt sau khi đã đủ Hồ sơ pháp lý + Kế toán đối chiếu -> 200 APPROVED
      const finalApproveRes = await request(app)
        .post(`/api/projects/${testProjectId}/budgets/justifications/${justWithRefId}/review`)
        .set("Cookie", cdt1Cookie)
        .send({
          decision: "APPROVED",
          review_note: "Đủ căn cứ pháp lý 08/BB-HT-2026 và xác nhận của Kế toán, đồng ý duyệt.",
          enforce_legal_checklist: true,
        });
      expect(finalApproveRes.status).toBe(200);
      expect(finalApproveRes.body.justification.status).toBe("APPROVED");
      expect(finalApproveRes.body.justification.legal_document_ref).toBe("08/BB-HT-2026");
      expect(finalApproveRes.body.justification.accountant_verified_by).toBe(keToanUserId);
      expect(finalApproveRes.body.justification.reviewed_by).toBe(cdt1UserId);
    });

    it("Nguồn dữ liệu kiểm soát ngân sách: Mặc định lấy phiên bản dự toán ĐÃ DUYỆT (APPROVED/EFFECTIVE) thay vì bản nháp (DRAFT) mới nhất và cộng dồn actual_costs chính thức", async () => {
      // Tạo thêm một phiên bản nháp (DRAFT) v3 có số tiền cao hơn nhưng chưa được duyệt
      const draftRes = await request(app)
        .post(`/api/projects/${testProjectId}/budgets`)
        .set("Cookie", bqlCookie)
        .send({
          description: "Bản nháp v3 đang cân đối nội bộ, chưa duyệt",
          createNewVersion: true,
          status: "DRAFT",
          items: [
            { work_item_id: leafWorkItemId1, amount: "999000000.00" },
            { work_item_id: leafWorkItemId2, amount: "999000000.00" },
          ],
        });

      expect(draftRes.status).toBe(201);
      expect(draftRes.body.version.status).toBe("DRAFT");
      const draftVerNum = draftRes.body.version.version_number;

      // Khi gọi GET /tree không truyền ?version=, hệ thống phải lấy phiên bản đã được duyệt (APPROVED) trước đó, KHÔNG mặc định lấy bản DRAFT mới nhất
      const defaultTreeRes = await request(app)
        .get(`/api/projects/${testProjectId}/budgets/tree`)
        .set("Cookie", keToanCookie);

      expect(defaultTreeRes.status).toBe(200);
      expect(defaultTreeRes.body.version.status).toBe("APPROVED");
      expect(defaultTreeRes.body.version.version_number).toBeLessThan(draftVerNum);

      // Đồng thời trả về actual_cost đã ghi nhận chính thức từ bảng actual_costs cho từng hạng mục và cộng dồn lên cha
      const leaf1 = defaultTreeRes.body.items.find((i) => i.id === leafWorkItemId1);
      const parentNode = defaultTreeRes.body.items.find((i) => i.id === parentWorkItemId);
      expect(Number(leaf1.actual_cost)).toBeGreaterThan(0);
      expect(Number(parentNode.actual_cost)).toBeGreaterThanOrEqual(Number(leaf1.actual_cost));
    });
  });
});
