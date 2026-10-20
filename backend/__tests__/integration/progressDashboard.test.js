"use strict";

// S-49 / T-124 — Integration test cho GET /api/projects/:projectId/progress-dashboard.
// Môi trường: construction_db_test (localhost:5433) — KHÔNG phải production.
// Kiểm tra: auth 401, non-member 403 (IDOR), member 200 + cấu trúc đúng + không NaN.

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("GET /projects/:projectId/progress-dashboard", () => {
  let cookieInvestor;
  let cookieOutsider;
  let projectId;
  let otherProjectId;

  beforeAll(async () => {
    await pool.query(
      "TRUNCATE TABLE acceptance_voucher_photos, acceptance_voucher_items, acceptance_vouchers, milestone_warnings, milestones, baseline_items, baselines, schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    const roleRes = await pool.query("SELECT id FROM roles WHERE name='chu_dau_tu' LIMIT 1");
    const roleIdInvestor = roleRes.rows.length ? roleRes.rows[0].id : 1;
    const hash = await argon2.hash("Password123!");

    const u1 = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Investor', 'inv@test.com', $1, $2, false, true) RETURNING id`,
      [hash, roleIdInvestor]
    );
    const u2 = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
       VALUES ('Outsider', 'out@test.com', $1, $2, false, true) RETURNING id`,
      [hash, roleIdInvestor]
    );
    const invId = u1.rows[0].id;
    const outId = u2.rows[0].id;

    const p1 = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('P A','PA','2026-01-01') RETURNING id"
    );
    projectId = p1.rows[0].id;
    const p2 = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('P B','PB','2026-01-01') RETURNING id"
    );
    otherProjectId = p2.rows[0].id;

    // Investor là member của projectId; outsider không thuộc project nào.
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,'chu_dau_tu')",
      [projectId, invId]
    );
    // outsider chỉ member của otherProject
    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,'chu_dau_tu')",
      [otherProjectId, outId]
    );

    const l1 = await request(app).post("/api/auth/login").send({ email: "inv@test.com", password: "Password123!" });
    cookieInvestor = l1.headers["set-cookie"];
    const l2 = await request(app).post("/api/auth/login").send({ email: "out@test.com", password: "Password123!" });
    cookieOutsider = l2.headers["set-cookie"];
  });

  afterAll(async () => {
    await pool.end();
  });

  it("401 khi chưa đăng nhập", async () => {
    const res = await request(app).get(`/api/projects/${projectId}/progress-dashboard`);
    expect(res.status).toBe(401);
  });

  it("403 khi user không phải member (IDOR — đổi projectId không lộ dữ liệu)", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/progress-dashboard`)
      .set("Cookie", cookieOutsider);
    expect(res.status).toBe(403);
  });

  it("200 cho member + trả cấu trúc dashboard đầy đủ", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/progress-dashboard`)
      .set("Cookie", cookieInvestor);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("progress");
    expect(res.body).toHaveProperty("schedule");
    expect(res.body).toHaveProperty("overdue_milestones");
    expect(res.body).toHaveProperty("critical_delayed_tasks");
    expect(res.body).toHaveProperty("data_status");
    // không có dữ liệu hợp đồng -> value_percent null (không phải 0/NaN)
    expect(res.body.progress.value_percent).toBeNull();
    expect(Number.isNaN(res.body.progress.value_percent)).toBe(false);
  });

  it("tiến độ theo giá trị = 50% khi đã duyệt nửa khối lượng hợp đồng", async () => {
    // Tạo hạng mục lá có hợp đồng + 1 phiếu approved với lũy kế = 1/2 contract.
    const wi = await pool.query(
      `INSERT INTO work_items (project_id, code, name, type, quantity, unit, unit_price)
       VALUES ($1,'WI-V','Hang muc gia tri','work_item', 100, 'm3', 1000000) RETURNING id`,
      [projectId]
    );
    const wiId = wi.rows[0].id;
    const creator = await pool.query("SELECT id FROM users WHERE email='inv@test.com'");
    // Tạo phiếu ở trạng thái draft, chèn item, rồi mới duyệt (khớp lifecycle thật:
    // trigger chặn thêm item vào phiếu đã approved).
    const voucher = await pool.query(
      `INSERT INTO acceptance_vouchers (project_id, batch_name, status, created_by)
       VALUES ($1,'Dot1','draft',$2) RETURNING id`,
      [projectId, creator.rows[0].id]
    );
    const voucherId = voucher.rows[0].id;
    await pool.query(
      `INSERT INTO acceptance_voucher_items (voucher_id, work_item_id, cumulative_quantity, prev_approved_cumulative, delta_quantity, unit)
       VALUES ($1,$2,'50.000','0.000','50.000','m3')`,
      [voucherId, wiId]
    );
    await pool.query(
      `UPDATE acceptance_vouchers SET status='approved', reviewed_by=$2, reviewed_at=now() WHERE id=$1`,
      [voucherId, creator.rows[0].id]
    );

    const res = await request(app)
      .get(`/api/projects/${projectId}/progress-dashboard`)
      .set("Cookie", cookieInvestor);
    expect(res.status).toBe(200);
    // contract_value = 100 * 1,000,000 = 100,000,000 ; done = 50 * 1,000,000 = 50,000,000 -> 50%
    expect(res.body.progress.value_percent).toBeCloseTo(50, 0);
    expect(res.body.progress.total_contract_value).toBe("100000000.00");
  });
});
