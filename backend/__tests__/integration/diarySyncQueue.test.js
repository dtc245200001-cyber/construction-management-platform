"use strict";

// T-73 (S-30): test tích hợp toàn bộ hàng đợi đồng bộ trên Postgres thật.
// 1. Thứ tự tạo. 2. Retry mất response nhiều lần. 3. Đa project không rò rỉ.
// 4. Gửi lại hàng loạt không tăng dòng. 5. 1 mục lỗi không chặn hàng đợi.
// 6. Log lỗi không chứa dữ liệu nhạy cảm.

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");
const logger = require("../../utils/logger");

describe("Diary Sync Queue Integration Tests (T-73 / S-30)", () => {
  let cookieKySu;
  let cookieKeToan;
  let cookieNoProject;
  let projectAId;
  let projectBId;
  let workItemAId;
  let workItemBId;

  beforeAll(async () => {
    await pool.query(
      "TRUNCATE TABLE diary_entries, milestones, schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    for (const r of ["ky_su_giam_sat", "ke_toan", "ban_quan_ly"]) {
      await pool.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }
    const { rows: roles } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => roles.find((r) => r.name === name).id;

    const passwordHash = await argon2.hash("Password123!");
    const userKySu = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Ky Su Q', 'kysu_q@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ky_su_giam_sat")]
    );
    const userKeToan = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Ke Toan Q', 'ketoan_q@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ke_toan")]
    );
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('No Project Q', 'noproject_q@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("ky_su_giam_sat")]
    );

    cookieKySu = (
      await request(app).post("/api/auth/login").send({ email: "kysu_q@test.com", password: "Password123!" })
    ).headers["set-cookie"];
    cookieKeToan = (
      await request(app).post("/api/auth/login").send({ email: "ketoan_q@test.com", password: "Password123!" })
    ).headers["set-cookie"];
    cookieNoProject = (
      await request(app).post("/api/auth/login").send({ email: "noproject_q@test.com", password: "Password123!" })
    ).headers["set-cookie"];

    const pA = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Project Queue A', 'PQA', '2026-01-01') RETURNING id"
    );
    projectAId = pA.rows[0].id;
    await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ky_su_giam_sat')", [
      projectAId,
      userKySu.rows[0].id,
    ]);

    const pB = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Project Queue B', 'PQB', '2026-01-01') RETURNING id"
    );
    projectBId = pB.rows[0].id;
    // Kỹ sư cũng là thành viên B (ke_toan không có quyền site_log.create) để
    // test 3 gửi cùng client_id vào cả 2 project; ke_toan giữ lại cho test GET B.
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ke_toan'), ($1, $3, 'ky_su_giam_sat')",
      [projectBId, userKeToan.rows[0].id, userKySu.rows[0].id]
    );

    const wiA = await pool.query(
      "INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'WI Queue A', 'WQA', 'category') RETURNING id",
      [projectAId]
    );
    workItemAId = wiA.rows[0].id;
    const wiB = await pool.query(
      "INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'WI Queue B', 'WQB', 'category') RETURNING id",
      [projectBId]
    );
    workItemBId = wiB.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  const postEntry = (projectId, cookie, body) =>
    request(app).post(`/api/projects/${projectId}/diary-entries`).set("Cookie", cookie).send(body);

  it("1. server trả danh sách đúng thứ tự (entry_at DESC, id DESC)", async () => {
    const stamps = ["2026-10-01T08:00:00Z", "2026-10-02T08:00:00Z", "2026-10-03T08:00:00Z"];
    // Gửi theo thứ tự NGƯỢC để chứng minh server sắp xếp, không phụ thuộc thứ tự gọi.
    for (const entryAt of [...stamps].reverse()) {
      const res = await postEntry(projectAId, cookieKySu, {
        work_item_id: workItemAId,
        content: `Order ${entryAt}`,
        entry_at: entryAt,
      });
      expect(res.status).toBe(201);
    }
    const list = await request(app).get(`/api/projects/${projectAId}/diary-entries`).set("Cookie", cookieKySu);
    expect(list.status).toBe(200);
    const ordered = list.body.data.filter((e) => e.content.startsWith("Order "));
    // Khớp ORDER BY d.entry_at DESC, d.id DESC của route GET.
    expect(ordered.map((e) => e.content)).toEqual([...stamps].reverse().map((s) => `Order ${s}`));
  });

  it("2. gửi lại cùng client_id 4 lần (mất response liên tục) vẫn chỉ 1 dòng", async () => {
    const clientId = "dddddddd-4444-4444-8444-dddddddddddd";
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await postEntry(projectAId, cookieKySu, {
        work_item_id: workItemAId,
        content: `Retry storm ${i}`,
        client_id: clientId,
      });
      statuses.push(res.status);
    }
    expect(statuses[0]).toBe(201);
    expect(statuses.slice(1)).toEqual([200, 200, 200]);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS c, MIN(content) AS content FROM diary_entries WHERE client_id = $1", [
      clientId,
    ]);
    expect(rows[0].c).toBe(1);
    expect(rows[0].content).toBe("Retry storm 0");
  });

  it("3. nhiều project: cùng client_id ở 2 project là 2 dòng riêng, không rò rỉ", async () => {
    const clientId = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee";
    // Kỹ sư là thành viên cả A và B nên gửi được vào cả hai.
    const resA = await postEntry(projectAId, cookieKySu, {
      work_item_id: workItemAId,
      content: "Queue A entry",
      client_id: clientId,
    });
    expect(resA.status).toBe(201);
    const resB = await postEntry(projectBId, cookieKySu, {
      work_item_id: workItemBId,
      content: "Queue B entry",
      client_id: clientId,
    });
    expect(resB.status).toBe(201);
    expect(resB.body.id).not.toBe(resA.body.id);

    const listB = await request(app).get(`/api/projects/${projectBId}/diary-entries`).set("Cookie", cookieKeToan);
    expect(listB.body.data.find((e) => e.id === resA.body.id)).toBeUndefined();

    // Hạng mục của B gửi vào URL project A → 422, không tạo dòng.
    const cross = await postEntry(projectAId, cookieKySu, {
      work_item_id: workItemBId,
      content: "Cross project",
    });
    expect(cross.status).toBe(422);

    // User ngoài project → 403.
    const forbidden = await postEntry(projectAId, cookieNoProject, {
      work_item_id: workItemAId,
      content: "No access",
    });
    expect(forbidden.status).toBe(403);
  });

  it("4. gửi lại hàng loạt 5 mục đã đồng bộ (đổi content) không tăng dòng", async () => {
    const before = await pool.query("SELECT COUNT(*)::int AS c FROM diary_entries WHERE project_id = $1", [projectAId]);
    const clientIds = Array.from({ length: 5 }, (_, i) => `f${i}ffffff-6666-4666-8666-ffffffffffff`);
    for (const [i, clientId] of clientIds.entries()) {
      const res = await postEntry(projectAId, cookieKySu, {
        work_item_id: workItemAId,
        content: `Bulk original ${i}`,
        client_id: clientId,
      });
      expect(res.status).toBe(201);
    }
    // Mô phỏng bug client gửi lại nhầm toàn bộ hàng đợi với nội dung khác.
    for (const [i, clientId] of clientIds.entries()) {
      const res = await postEntry(projectAId, cookieKySu, {
        work_item_id: workItemAId,
        content: `Bulk resend ${i}`,
        client_id: clientId,
      });
      expect(res.status).toBe(200);
    }
    const after = await pool.query("SELECT COUNT(*)::int AS c FROM diary_entries WHERE project_id = $1", [projectAId]);
    expect(after.rows[0].c).toBe(before.rows[0].c + 5);
    const contents = await pool.query("SELECT content FROM diary_entries WHERE client_id = ANY($1)", [clientIds]);
    for (const row of contents.rows) {
      expect(row.content).toMatch(/^Bulk original /);
    }
  });

  it("5. 1 mục dữ liệu sai không chặn các mục sau (client loop tuần tự)", async () => {
    const results = [];
    // Mô phỏng vòng quét client: gửi tuần tự, mỗi mục try/catch riêng.
    const queue = [
      { work_item_id: workItemAId, content: "Poison valid 1" },
      { work_item_id: -1, content: "Poison invalid" },
      { work_item_id: workItemAId, content: "Poison valid 2" },
    ];
    for (const body of queue) {
      try {
        const res = await postEntry(projectAId, cookieKySu, body);
        results.push(res.status);
      } catch (e) {
        results.push("thrown");
      }
    }
    expect(results).toEqual([201, 400, 201]);
    const { rows } = await pool.query(
      "SELECT content FROM diary_entries WHERE content LIKE 'Poison valid%' ORDER BY id ASC"
    );
    expect(rows.map((r) => r.content)).toEqual(["Poison valid 1", "Poison valid 2"]);
  });

  it("6. log lỗi không chứa nội dung nhật ký nhạy cảm", async () => {
    // Khóa NFR log: gọi trực tiếp errorHandler với fake req chứa body nhạy cảm,
    // hứng object truyền vào logger.error — assert không chứa nguyên văn content.
    const { errorHandler } = require("../../middleware/errorHandler");
    const logged = [];
    const spy = jest.spyOn(logger, "error").mockImplementation((...args) => {
      logged.push(args);
    });
    const secretContent = "Nội dung riêng tư dùng để kiểm thử";
    try {
      const err = new Error("DB connection failed");
      err.code = "ECONNREFUSED";
      const req = {
        method: "POST",
        url: `/api/projects/${projectAId}/diary-entries`,
        body: { work_item_id: workItemAId, content: secretContent, client_id: "aa" },
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      errorHandler(err, req, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(500);
    } finally {
      spy.mockRestore();
    }
    const dumped = JSON.stringify(logged);
    expect(logged.length).toBeGreaterThan(0);
    expect(dumped).not.toContain("mat-ma-khong-duoc-lot-ra-ngoai");
    expect(dumped).not.toContain(secretContent);
  });
});
