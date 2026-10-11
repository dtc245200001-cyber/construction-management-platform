"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("T-86: API đọc/cập nhật khối lượng, đơn vị, đơn giá hợp đồng có kiểm tra quyền", () => {
  let p1, p2;
  let wiLeaf1, wiLeaf2, wiParent, wiLeafWithTask;
  let p2WorkItem;

  // Cookies theo các vai trò
  let cookieChuDauTu;
  let cookieBanQuanLy;
  let cookieKeToan;
  let cookieKySuGiamSat;
  let cookieChiHuyTruong;
  let cookieDoiTruong;
  let cookieOutsideUser;
  let cookieUserP2;

  beforeAll(async () => {
    // 1. Dọn dẹp dữ liệu bảng liên quan
    await pool.query(
      "TRUNCATE users, roles, projects, project_members, work_items, tasks, audit_logs RESTART IDENTITY CASCADE"
    );

    // 2. Chèn các roles
    const rolesData = [
      "chu_dau_tu",
      "ban_quan_ly",
      "ke_toan",
      "ky_su_giam_sat",
      "chi_huy_truong",
      "doi_truong",
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

    // Helper tạo user
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

    const uCDT = await createUser("Chủ Đầu Tư", "cdt@test.com");
    cookieChuDauTu = uCDT.cookie;

    const uBQL = await createUser("Ban Quản Lý", "bql@test.com");
    cookieBanQuanLy = uBQL.cookie;

    const uKT = await createUser("Kế Toán", "kt@test.com");
    cookieKeToan = uKT.cookie;

    const uKSGS = await createUser("Kỹ Sư Giám Sát", "ksgs@test.com");
    cookieKySuGiamSat = uKSGS.cookie;

    const uCHT = await createUser("Chỉ Huy Trưởng", "cht@test.com");
    cookieChiHuyTruong = uCHT.cookie;

    const uDT = await createUser("Đội Trưởng", "dt@test.com");
    cookieDoiTruong = uDT.cookie;

    const uOut = await createUser("Người Ngoài Dự Án", "out@test.com");
    cookieOutsideUser = uOut.cookie;

    const uP2 = await createUser("Thành Viên Dự Án 2", "p2user@test.com");
    cookieUserP2 = uP2.cookie;

    // 3. Tạo dự án P1 và P2
    const p1Res = await pool.query(
      "INSERT INTO projects (name, code) VALUES ('Dự án T86 P1', 'PRJ-T86-1') RETURNING id"
    );
    p1 = p1Res.rows[0].id;

    const p2Res = await pool.query(
      "INSERT INTO projects (name, code) VALUES ('Dự án T86 P2', 'PRJ-T86-2') RETURNING id"
    );
    p2 = p2Res.rows[0].id;

    // Gán thành viên cho P1
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES
       ($1, $2, 'chu_dau_tu'),
       ($1, $3, 'ban_quan_ly'),
       ($1, $4, 'ke_toan'),
       ($1, $5, 'ky_su_giam_sat'),
       ($1, $6, 'chi_huy_truong'),
       ($1, $7, 'doi_truong')`,
      [
        p1,
        uCDT.userId,
        uBQL.userId,
        uKT.userId,
        uKSGS.userId,
        uCHT.userId,
        uDT.userId,
      ]
    );

    // Gán thành viên cho P2
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ban_quan_ly')`,
      [p2, uP2.userId]
    );

    // 4. Tạo các hạng mục mẫu trong P1
    // wiParent (hạng mục cha có con)
    const pRes = await pool.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Hạng mục cha') RETURNING id",
      [p1]
    );
    wiParent = pRes.rows[0].id;

    // wiLeaf1 (con của wiParent)
    const l1Res = await pool.query(
      "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Hạng mục con 1') RETURNING id",
      [p1, wiParent]
    );
    wiLeaf1 = l1Res.rows[0].id;

    // wiLeaf2 (hạng mục lá độc lập ở gốc)
    const l2Res = await pool.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Hạng mục lá độc lập') RETURNING id",
      [p1]
    );
    wiLeaf2 = l2Res.rows[0].id;

    // wiLeafWithTask (hạng mục lá có task bên trong)
    const lTaskRes = await pool.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Hạng mục lá chứa task') RETURNING id",
      [p1]
    );
    wiLeafWithTask = lTaskRes.rows[0].id;
    await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Công việc 1', 3)",
      [wiLeafWithTask]
    );

    // Hạng mục của P2
    const p2wiRes = await pool.query(
      "INSERT INTO work_items (project_id, name) VALUES ($1, 'Hạng mục thuộc P2') RETURNING id",
      [p2]
    );
    p2WorkItem = p2wiRes.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("1. Phân quyền theo ma trận vai trò x điểm cuối", () => {
    it("CHU_DAU_TU: GET xem đầy đủ giá (200), PUT (200), DELETE (200)", async () => {
      // PUT
      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieChuDauTu)
        .send({ quantity: "10.000", unit: "m3", unit_price: "500000.00" });
      expect(putRes.status).toBe(200);
      expect(putRes.body.contract_value).toBe("5000000.00");

      // GET đầy đủ
      const getRes = await request(app)
        .get(`/api/projects/${p1}/contract-quantities`)
        .set("Cookie", cookieChuDauTu);
      expect(getRes.status).toBe(200);
      expect(getRes.body.can_view_prices).toBe(true);
      expect(getRes.body).toHaveProperty("project_total");
      const found = getRes.body.items.find((i) => i.id === wiLeaf2);
      expect(found).toHaveProperty("unit_price", "500000.00");
      expect(found).toHaveProperty("contract_value", "5000000.00");
      expect(found).toHaveProperty("contract_total", "5000000.00");

      // DELETE
      const delRes = await request(app)
        .delete(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieChuDauTu);
      expect(delRes.status).toBe(200);
      expect(delRes.body.contract_value).toBeNull();
    });

    it("BAN_QUAN_LY: GET xem đầy đủ giá (200), PUT (200), DELETE (200)", async () => {
      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "5.000", unit: "tấn", unit_price: "200000.00" });
      expect(putRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/projects/${p1}/contract-quantities`)
        .set("Cookie", cookieBanQuanLy);
      expect(getRes.status).toBe(200);
      expect(getRes.body.can_view_prices).toBe(true);
      expect(getRes.body).toHaveProperty("project_total");

      const delRes = await request(app)
        .delete(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy);
      expect(delRes.status).toBe(200);
    });

    it("KE_TOAN: GET xem đầy đủ giá (200), PUT (403), DELETE (403)", async () => {
      const getRes = await request(app)
        .get(`/api/projects/${p1}/contract-quantities`)
        .set("Cookie", cookieKeToan);
      expect(getRes.status).toBe(200);
      expect(getRes.body.can_view_prices).toBe(true);
      expect(getRes.body).toHaveProperty("project_total");

      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieKeToan)
        .send({ quantity: "5.000", unit: "tấn", unit_price: "200000.00" });
      expect(putRes.status).toBe(403);

      const delRes = await request(app)
        .delete(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieKeToan);
      expect(delRes.status).toBe(403);
    });

    it("KY_SU_GIAM_SAT và CHI_HUY_TRUONG: GET chỉ khối lượng (BỎ HẲN các khoá giá), PUT (403), DELETE (403)", async () => {
      // Trước tiên BQL set giá trị cho wiLeaf2 để có dữ liệu
      await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "8.500", unit: "m2", unit_price: "150000.00" });

      for (const [_roleName, cookie] of [
        ["KY_SU_GIAM_SAT", cookieKySuGiamSat],
        ["CHI_HUY_TRUONG", cookieChiHuyTruong],
      ]) {
        const getRes = await request(app)
          .get(`/api/projects/${p1}/contract-quantities`)
          .set("Cookie", cookie);
        expect(getRes.status).toBe(200);
        expect(getRes.body.can_view_prices).toBe(false);
        // Bỏ hẳn project_total ở root
        expect(getRes.body).not.toHaveProperty("project_total");

        // Bỏ hẳn các trường giá trong từng item
        for (const item of getRes.body.items) {
          expect(item).not.toHaveProperty("unit_price");
          expect(item).not.toHaveProperty("contract_value");
          expect(item).not.toHaveProperty("contract_total");
          expect(item).toHaveProperty("quantity");
          expect(item).toHaveProperty("unit");
        }

        const putRes = await request(app)
          .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
          .set("Cookie", cookie)
          .send({ quantity: "1.000", unit: "m", unit_price: "100.00" });
        expect(putRes.status).toBe(403);

        const delRes = await request(app)
          .delete(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
          .set("Cookie", cookie);
        expect(delRes.status).toBe(403);
      }
    });

    it("DOI_TRUONG: 403 ở mọi điểm cuối (GET, PUT, DELETE)", async () => {
      const getRes = await request(app)
        .get(`/api/projects/${p1}/contract-quantities`)
        .set("Cookie", cookieDoiTruong);
      expect(getRes.status).toBe(403);

      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieDoiTruong)
        .send({ quantity: "1.000", unit: "m", unit_price: "100.00" });
      expect(putRes.status).toBe(403);

      const delRes = await request(app)
        .delete(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieDoiTruong);
      expect(delRes.status).toBe(403);
    });

    it("Người không thuộc dự án: 403 (do checkProjectAccess)", async () => {
      const getRes = await request(app)
        .get(`/api/projects/${p1}/contract-quantities`)
        .set("Cookie", cookieOutsideUser);
      expect(getRes.status).toBe(403);

      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieOutsideUser)
        .send({ quantity: "1.000", unit: "m", unit_price: "100.00" });
      expect(putRes.status).toBe(403);
    });

    it("Chưa đăng nhập: 401", async () => {
      const getRes = await request(app).get(`/api/projects/${p1}/contract-quantities`);
      expect(getRes.status).toBe(401);

      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .send({ quantity: "1.000", unit: "m", unit_price: "100.00" });
      expect(putRes.status).toBe(401);
    });

    it("Với vai trò bị từ chối, dữ liệu trong database không bị thay đổi", async () => {
      const beforeRow = await pool.query(
        "SELECT quantity, unit, unit_price FROM work_items WHERE id = $1",
        [wiLeaf2]
      );

      // Thử PUT bằng DOI_TRUONG
      await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieDoiTruong)
        .send({ quantity: "999.000", unit: "m", unit_price: "9999.00" });

      const afterRow = await pool.query(
        "SELECT quantity, unit, unit_price FROM work_items WHERE id = $1",
        [wiLeaf2]
      );
      expect(afterRow.rows[0]).toEqual(beforeRow.rows[0]);
    });
  });

  describe("2. Cô lập dự án (Project Isolation)", () => {
    it("Thành viên dự án A gọi với hạng mục của dự án B -> 404 'Không tìm thấy hạng mục'", async () => {
      // User BQL của P1 gọi với work item p2WorkItem (thuộc P2)
      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${p2WorkItem}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "10.000", unit: "m3", unit_price: "1000.00" });

      expect(putRes.status).toBe(404);
      expect(putRes.body.message).toContain("Không tìm thấy hạng mục");

      const delRes = await request(app)
        .delete(`/api/projects/${p1}/work-items/${p2WorkItem}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy);
      expect(delRes.status).toBe(404);
    });

    it("Thành viên thuộc dự án B dùng URL dự án A với hạng mục của B -> 403", async () => {
      const putRes = await request(app)
        .put(`/api/projects/${p1}/work-items/${p2WorkItem}/contract-quantity`)
        .set("Cookie", cookieUserP2)
        .send({ quantity: "10.000", unit: "m3", unit_price: "1000.00" });

      expect(putRes.status).toBe(403);
    });
  });

  describe("3. Tham số URL sai (Validation)", () => {
    it("projectId hoặc workItemId là 'abc', 0, -1, '1.5' -> 400", async () => {
      const badParams = ["abc", "0", "-1", "1.5"];
      for (const bad of badParams) {
        const getRes = await request(app)
          .get(`/api/projects/${bad}/contract-quantities`)
          .set("Cookie", cookieBanQuanLy);
        expect(getRes.status).toBe(400);

        const putRes = await request(app)
          .put(`/api/projects/${p1}/work-items/${bad}/contract-quantity`)
          .set("Cookie", cookieBanQuanLy)
          .send({ quantity: "1.000", unit: "m", unit_price: "100.00" });
        expect(putRes.status).toBe(400);
      }
    });
  });

  describe("4. Kiểm tra số thập phân và gom toàn bộ lỗi đầu vào", () => {
    it("Từ chối khi thiếu cả 3 trường và gom đủ 3 lỗi trong errors", async () => {
      const res = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("errors");
      expect(res.body.errors).toHaveProperty("quantity");
      expect(res.body.errors).toHaveProperty("unit");
      expect(res.body.errors).toHaveProperty("unit_price");
    });

    const invalidNumbers = [
      "-1",
      "-0.001",
      true,
      null,
      [],
      {},
      "",
      "abc",
      "1,5",
      "+5",
      "1e3",
      ".5",
      "5.",
      "1.000.000",
      " 12 3 ",
      "1.0005", // 4 số thập phân khác 0 cho khối lượng
      "100000000000", // 12 chữ số nguyên cho khối lượng
      1234567890123456, // số JSON > 15 chữ số
    ];

    test.each(invalidNumbers)("Từ chối giá trị quantity sai: %p", async (val) => {
      const res = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: val, unit: "m3", unit_price: "1000.00" });

      expect(res.status).toBe(400);
      expect(res.body.errors).toHaveProperty("quantity");
    });

    it("Từ chối đơn giá quá 2 chữ số thập phân khác 0 (ví dụ '0.005') và quá 14 chữ số nguyên", async () => {
      const resScale = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "10.000", unit: "m3", unit_price: "0.005" });
      expect(resScale.status).toBe(400);
      expect(resScale.body.errors).toHaveProperty("unit_price");

      const resInt = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "10.000", unit: "m3", unit_price: "100000000000000" });
      expect(resInt.status).toBe(400);
      expect(resInt.body.errors).toHaveProperty("unit_price");
    });

    it("Chấp nhận các giá trị hợp lệ: '1.2300' (lưu '1.230'), '0', 0, '99999999999.999', '99999999999999.99', số JSON 1234.567 và 89000.5", async () => {
      // 1.2300
      const resTrimZero = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "1.2300", unit: "m3", unit_price: "100.00" });
      expect(resTrimZero.status).toBe(200);
      expect(resTrimZero.body.quantity).toBe("1.230");

      // 0 và '0'
      const resZero = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: 0, unit: "m", unit_price: "0" });
      expect(resZero.status).toBe(200);
      expect(resZero.body.contract_value).toBe("0.00");

      // Biên lớn nhất
      const resMax = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({
          quantity: "99999999999.999",
          unit: "trọn gói",
          unit_price: "99999999999999.99",
        });
      expect(resMax.status).toBe(200);
      expect(resMax.body.contract_value).toBe("9999999999999899000000000.00");

      // Số JSON
      const resJsonNum = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: 1234.567, unit: "m3", unit_price: 89000.5 });
      expect(resJsonNum.status).toBe(200);
      expect(resJsonNum.body.contract_value).toBe("109877080.28");
    });
  });

  describe("5. Đơn vị tính hợp lệ và chuẩn hóa", () => {
    it("Chuẩn hoá 'm2', 'M2', 'm²', 'm³', ' Tấn ' thành dạng chuẩn", async () => {
      const unitsTest = [
        { input: "m2", expected: "m2" },
        { input: "M2", expected: "m2" },
        { input: "m²", expected: "m2" },
        { input: "m³", expected: "m3" },
        { input: " Tấn ", expected: "tấn" },
      ];

      for (const { input, expected } of unitsTest) {
        const res = await request(app)
          .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
          .set("Cookie", cookieBanQuanLy)
          .send({ quantity: "1.000", unit: input, unit_price: "100.00" });
        expect(res.status).toBe(200);
        expect(res.body.unit).toBe(expected);
      }
    });

    it("Từ chối đơn vị sai: 'xyz', '', 5, null, chuỗi 40 ký tự -> 400 kèm danh sách hợp lệ", async () => {
      const badUnits = ["xyz", "", 5, null, "a".repeat(40)];
      for (const bad of badUnits) {
        const res = await request(app)
          .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
          .set("Cookie", cookieBanQuanLy)
          .send({ quantity: "1.000", unit: bad, unit_price: "100.00" });
        expect(res.status).toBe(400);
        expect(res.body.errors.unit).toBeDefined();
      }
    });
  });

  describe("6. Độ chính xác đầu-cuối và tính tổng cây đệ quy", () => {
    it("Cây gồm cha P có 3 con lá -> contract_total của P đúng '1003.69', lan lên project_total, sửa và xoá cập nhật chính xác", async () => {
      // Tạo dự án riêng để kiểm tra cây tổng
      const projRes = await pool.query(
        "INSERT INTO projects (name, code) VALUES ('Dự án Cây Tổng', 'PRJ-TREE') RETURNING id"
      );
      const pid = projRes.rows[0].id;
      await pool.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, (SELECT id FROM users WHERE email = 'bql@test.com'), 'ban_quan_ly')",
        [pid]
      );

      // Cây 3 tầng: Gốc (Root) -> Cha (P) -> 3 Lá (L1, L2, L3)
      const rootRes = await pool.query(
        "INSERT INTO work_items (project_id, name) VALUES ($1, 'Root') RETURNING id",
        [pid]
      );
      const rootId = rootRes.rows[0].id;

      const pRes = await pool.query(
        "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Parent P') RETURNING id",
        [pid, rootId]
      );
      const pId = pRes.rows[0].id;

      const l1Res = await pool.query(
        "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'L1') RETURNING id",
        [pid, pId]
      );
      const l1Id = l1Res.rows[0].id;

      const l2Res = await pool.query(
        "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'L2') RETURNING id",
        [pid, pId]
      );
      const l2Id = l2Res.rows[0].id;

      const l3Res = await pool.query(
        "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'L3') RETURNING id",
        [pid, pId]
      );
      const l3Id = l3Res.rows[0].id;

      // Khai 3 lá:
      // L1: 333.333 * 3.00 = 1000.00
      await request(app)
        .put(`/api/projects/${pid}/work-items/${l1Id}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "333.333", unit: "bộ", unit_price: "3.00" });

      // L2: 2.675 * 1.00 = 2.68
      await request(app)
        .put(`/api/projects/${pid}/work-items/${l2Id}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "2.675", unit: "m2", unit_price: "1.00" });

      // L3: 1.005 * 1.00 = 1.01
      await request(app)
        .put(`/api/projects/${pid}/work-items/${l3Id}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "1.005", unit: "tấn", unit_price: "1.00" });

      // Kiểm tra GET
      const getTree = await request(app)
        .get(`/api/projects/${pid}/contract-quantities`)
        .set("Cookie", cookieBanQuanLy);

      expect(getTree.status).toBe(200);
      const itemsMap = {};
      getTree.body.items.forEach((it) => {
        itemsMap[it.id] = it;
      });

      expect(itemsMap[l1Id].contract_value).toBe("1000.00");
      expect(itemsMap[l2Id].contract_value).toBe("2.68");
      expect(itemsMap[l3Id].contract_value).toBe("1.01");

      // Tổng tại P: 1000.00 + 2.68 + 1.01 = 1003.69
      expect(itemsMap[pId].contract_total).toBe("1003.69");
      // Lan lên Root: 1003.69
      expect(itemsMap[rootId].contract_total).toBe("1003.69");
      // project_total: 1003.69
      expect(getTree.body.project_total).toBe("1003.69");

      // Sửa đơn giá L3 từ 1.00 thành 2.00 -> contract_value = 2.01
      await request(app)
        .put(`/api/projects/${pid}/work-items/${l3Id}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "1.005", unit: "tấn", unit_price: "2.00" });

      const getAfterUpdate = await request(app)
        .get(`/api/projects/${pid}/contract-quantities`)
        .set("Cookie", cookieBanQuanLy);
      expect(getAfterUpdate.body.project_total).toBe("1004.69");

      // DELETE L2 -> giảm 2.68 -> còn 1002.01
      await request(app)
        .delete(`/api/projects/${pid}/work-items/${l2Id}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy);

      const getAfterDelete = await request(app)
        .get(`/api/projects/${pid}/contract-quantities`)
        .set("Cookie", cookieBanQuanLy);
      expect(getAfterDelete.body.project_total).toBe("1002.01");
    });
  });

  describe("7. Hạng mục cha và hạng mục có tasks", () => {
    it("PUT lên hạng mục đã có con -> 422, thông báo tiếng Việt kèm số hạng mục con, DB không đổi", async () => {
      const res = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiParent}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "10.000", unit: "m3", unit_price: "100.00" });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain("Hạng mục cha không khai khối lượng hợp đồng trực tiếp");
      expect(res.body.message).toContain("hạng mục con");

      const dbCheck = await pool.query(
        "SELECT quantity FROM work_items WHERE id = $1",
        [wiParent]
      );
      expect(dbCheck.rows[0].quantity).toBeNull();
    });

    it("PUT lên hạng mục lá có công việc trong bảng tasks -> 200 thành công", async () => {
      const res = await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeafWithTask}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "25.000", unit: "ca", unit_price: "800000.00" });

      expect(res.status).toBe(200);
      expect(res.body.contract_value).toBe("20000000.00");
    });
  });

  describe("8. Tranh chấp đồng thời (Concurrency)", () => {
    it("20 request PUT song song cùng một hạng mục -> mọi request 200, DB nhất quán, không có 500", async () => {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          request(app)
            .put(`/api/projects/${p1}/work-items/${wiLeaf2}/contract-quantity`)
            .set("Cookie", cookieBanQuanLy)
            .send({
              quantity: `${i + 1}.000`,
              unit: "m",
              unit_price: `${(i + 1) * 10}.00`,
            })
        );
      }

      const results = await Promise.all(promises);
      results.forEach((res) => {
        expect(res.status).toBe(200);
      });

      // Kiểm tra trong DB: là một cặp (quantity, unit_price, contract_value) nguyên vẹn
      const dbRow = await pool.query(
        "SELECT quantity::text, unit_price::text, contract_value::text FROM work_items WHERE id = $1",
        [wiLeaf2]
      );
      const row = dbRow.rows[0];
      const q = Number(row.quantity);
      const p = Number(row.unit_price);
      const val = Number(row.contract_value);
      expect(val).toBeCloseTo(q * p, 2);
    });

    it("Lặp 10 lần: song song một PUT lên lá L và một POST /api/categories/:projectId tạo con dưới L -> đúng 1 cái thành công, cái kia 422", async () => {
      for (let run = 0; run < 10; run++) {
        // Tạo một hạng mục lá mới
        const leafRes = await pool.query(
          "INSERT INTO work_items (project_id, name) VALUES ($1, $2) RETURNING id",
          [p1, `Leaf Concurrency ${run}`]
        );
        const leafId = leafRes.rows[0].id;

        const reqPut = request(app)
          .put(`/api/projects/${p1}/work-items/${leafId}/contract-quantity`)
          .set("Cookie", cookieBanQuanLy)
          .send({ quantity: "10.000", unit: "m3", unit_price: "100.00" });

        const reqPostChild = request(app)
          .post(`/api/categories/${p1}`)
          .set("Cookie", cookieBanQuanLy)
          .send({ name: `Child of ${leafId}`, parent_id: leafId });

        const [resPut, resPost] = await Promise.all([reqPut, reqPostChild]);

        const statuses = [resPut.status, resPost.status];
        // Một cái thành công (200 hoặc 201), một cái phải bị từ chối 422
        expect(statuses).toContain(422);

        // Khẳng định trạng thái cuối trong DB: không có hạng mục nào vừa có giá trị vừa có con
        const checkInvariant = await pool.query(
          `SELECT p.id FROM work_items p
           JOIN work_items c ON c.parent_id = p.id
           WHERE p.id = $1 AND (p.quantity IS NOT NULL OR p.unit IS NOT NULL OR p.unit_price IS NOT NULL)`,
          [leafId]
        );
        expect(checkInvariant.rows).toHaveLength(0);
      }
    });
  });

  describe("9. Ánh xạ lỗi database (errorHandler.js)", () => {
    it("POST tạo con dưới hạng mục đã có khối lượng qua API WBS -> trả 422 chứ không phải 500", async () => {
      // Đặt giá trị cho wiLeaf1
      await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf1}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "10.000", unit: "m3", unit_price: "100.00" });

      // Gọi POST category tạo con dưới wiLeaf1
      const res = await request(app)
        .post(`/api/categories/${p1}`)
        .set("Cookie", cookieBanQuanLy)
        .send({ name: "Con cố tình gắn vào lá", parent_id: wiLeaf1 });

      expect(res.status).toBe(422);
      expect(res.body.message).toContain("hạng mục đã có khối lượng hợp đồng");
    });

    it("errorHandler với các constraint khác không đổi hành vi", async () => {
      const errorHandler = require("../../middleware/errorHandler").errorHandler;
      const fakeReq = { method: "POST", url: "/test" };
      let capturedStatus = null;
      let capturedJson = null;
      const fakeRes = {
        status: (code) => {
          capturedStatus = code;
          return {
            json: (payload) => {
              capturedJson = payload;
              return payload;
            },
          };
        },
      };

      // Giả lập lỗi khác
      const otherErr = new Error("Lỗi khác");
      otherErr.code = "23514";
      otherErr.constraint = "chk_no_self_parent";
      errorHandler(otherErr, fakeReq, fakeRes, () => {});

      expect(capturedStatus).toBe(500);
      expect(capturedJson.message).toBe("Lỗi khác");
    });
  });

  describe("10. Nhật ký thao tác (audit_logs trong cùng giao dịch)", () => {
    it("PUT tạo đúng một dòng audit_logs với action CONTRACT_QUANTITY_SET", async () => {
      await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf1}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "15.000", unit: "m3", unit_price: "200.00" });

      const afterLogs = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'CONTRACT_QUANTITY_SET' ORDER BY id DESC LIMIT 1"
      );

      expect(afterLogs.rows.length).toBe(1);
      const log = afterLogs.rows[0];
      expect(log.entity).toBe("work_items");
      expect(log.entity_id).toBe(wiLeaf1);
      expect(log.details.after.quantity).toBe("15.000");
      expect(log.details.after.unit).toBe("m3");
      expect(log.details.after.unit_price).toBe("200.00");
    });

    it("DELETE tạo đúng một dòng audit_logs với action CONTRACT_QUANTITY_CLEAR", async () => {
      await request(app)
        .delete(`/api/projects/${p1}/work-items/${wiLeaf1}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy);

      const afterLogs = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'CONTRACT_QUANTITY_CLEAR' ORDER BY id DESC LIMIT 1"
      );

      expect(afterLogs.rows.length).toBe(1);
      const log = afterLogs.rows[0];
      expect(log.entity).toBe("work_items");
      expect(log.entity_id).toBe(wiLeaf1);
      expect(log.details.after.quantity).toBeNull();
      expect(log.details.after.unit_price).toBeNull();
    });

    it("Thao tác bị từ chối (400, 403, 422) KHÔNG tạo dòng nhật ký", async () => {
      const countBefore = await pool.query("SELECT COUNT(*)::int AS cnt FROM audit_logs");

      // 400
      await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf1}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "-5", unit: "m3", unit_price: "100.00" });

      // 403
      await request(app)
        .put(`/api/projects/${p1}/work-items/${wiLeaf1}/contract-quantity`)
        .set("Cookie", cookieDoiTruong)
        .send({ quantity: "5", unit: "m3", unit_price: "100.00" });

      // 422
      await request(app)
        .put(`/api/projects/${p1}/work-items/${wiParent}/contract-quantity`)
        .set("Cookie", cookieBanQuanLy)
        .send({ quantity: "5", unit: "m3", unit_price: "100.00" });

      const countAfter = await pool.query("SELECT COUNT(*)::int AS cnt FROM audit_logs");
      expect(countAfter.rows[0].cnt).toBe(countBefore.rows[0].cnt);
    });
  });

  describe("11. Hiệu năng truy vấn cây dự án lớn", () => {
    it("Dự án 500 hạng mục (cây 4 tầng) mỗi lá có giá trị -> GET phản hồi dưới 300 ms", async () => {
      const projRes = await pool.query(
        "INSERT INTO projects (name, code) VALUES ('Dự án 500 items', 'PRJ-500') RETURNING id"
      );
      const p500 = projRes.rows[0].id;
      await pool.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, (SELECT id FROM users WHERE email = 'bql@test.com'), 'ban_quan_ly')",
        [p500]
      );

      // Tạo cây 4 tầng: 1 Root -> 5 Tầng 1 -> 25 Tầng 2 -> 475 Lá (Tổng 500)
      const rootRes = await pool.query(
        "INSERT INTO work_items (project_id, name) VALUES ($1, 'R0') RETURNING id",
        [p500]
      );
      const rId = rootRes.rows[0].id;

      // 5 tầng 1
      const t1Ids = [];
      for (let i = 0; i < 5; i++) {
        const res = await pool.query(
          "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id",
          [p500, rId, `T1_${i}`]
        );
        t1Ids.push(res.rows[0].id);
      }

      // 25 tầng 2
      const t2Ids = [];
      for (let i = 0; i < 25; i++) {
        const parentT1 = t1Ids[i % 5];
        const res = await pool.query(
          "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id",
          [p500, parentT1, `T2_${i}`]
        );
        t2Ids.push(res.rows[0].id);
      }

      // 469 lá (Tổng 1 + 5 + 25 + 469 = 500 hạng mục)
      const leafValues = [];
      for (let i = 0; i < 469; i++) {
        const parentT2 = t2Ids[i % 25];
        leafValues.push(
          `(${p500}, ${parentT2}, 'Leaf_${i}', '10.000', 'm3', '100.00')`
        );
      }

      await pool.query(
        `INSERT INTO work_items (project_id, parent_id, name, quantity, unit, unit_price)
         VALUES ${leafValues.join(", ")}`
      );

      // Khởi động (warmup)
      await request(app)
        .get(`/api/projects/${p500}/contract-quantities`)
        .set("Cookie", cookieBanQuanLy);

      // Đo thời gian
      const start = Date.now();
      const res = await request(app)
        .get(`/api/projects/${p500}/contract-quantities`)
        .set("Cookie", cookieBanQuanLy);
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(500);
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe("12. Kiểm tra hồi quy: các endpoint cũ không bị lộ trường hợp đồng", () => {
    it("GET categories, tree/all, PUT category, PATCH move không chứa các trường hợp đồng", async () => {
      // 1. GET /api/categories/:projectId
      const resGetTree = await request(app)
        .get(`/api/categories/${p1}`)
        .set("Cookie", cookieBanQuanLy);
      expect(resGetTree.status).toBe(200);
      resGetTree.body.forEach((item) => {
        expect(item).not.toHaveProperty("quantity");
        expect(item).not.toHaveProperty("unit");
        expect(item).not.toHaveProperty("unit_price");
        expect(item).not.toHaveProperty("contract_value");
      });

      // 2. GET /api/categories/:projectId/tree/all
      const resGetAll = await request(app)
        .get(`/api/categories/${p1}/tree/all`)
        .set("Cookie", cookieBanQuanLy);
      expect(resGetAll.status).toBe(200);
      resGetAll.body.forEach((item) => {
        expect(item).not.toHaveProperty("quantity");
        expect(item).not.toHaveProperty("unit");
        expect(item).not.toHaveProperty("unit_price");
        expect(item).not.toHaveProperty("contract_value");
      });
    });
  });
});
