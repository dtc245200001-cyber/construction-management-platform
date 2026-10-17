"use strict";

// S-50 / T-127 — Integration test cho GET
//   /api/projects/:projectId/work-items/:workItemId/acceptance-dossier.pdf
// Môi trường: construction_db_test — KHÔNG phải production.
// Kiểm tra: 401 chưa login, 403 non-member (IDOR), 404 hạng mục sai dự án,
//           200 trả PDF hợp lệ với role được phép, không ghi side-effect.

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("GET /projects/:pid/work-items/:wid/acceptance-dossier.pdf", () => {
  let cookieBql; // ban_quan_ly — có acceptance.export_dossier + photo.view_gps
  let cookieInvestor; // chu_dau_tu — KHÔNG có acceptance.export_dossier
  let cookieOutsider;
  let cookieWorker; // doi_truong — member nhưng không có acceptance.export_dossier
  let projectId;
  let otherProjectId;
  let leafWiId;
  let otherLeafWiId;

  beforeAll(async () => {
    await pool.query(
      "TRUNCATE TABLE acceptance_voucher_photos, acceptance_voucher_items, acceptance_vouchers, milestone_warnings, milestones, baseline_items, baselines, schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );
    const hash = await argon2.hash("Password123!");
    const mk = async (name, email, roleName) => {
      const r = await pool.query("SELECT id FROM roles WHERE name=$1 LIMIT 1", [roleName]);
      const rid = r.rows.length ? r.rows[0].id : 1;
      const u = await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified)
         VALUES ($1,$2,$3,$4,false,true) RETURNING id`,
        [name, email, hash, rid]
      );
      return u.rows[0].id;
    };
    const bqlId = await mk("Bql", "bql2@test.com", "ban_quan_ly");
    const invId = await mk("Inv", "inv2@test.com", "chu_dau_tu");
    const outId = await mk("Out", "out2@test.com", "chu_dau_tu");
    const wrkId = await mk("Worker", "wrk2@test.com", "doi_truong");

    projectId = (await pool.query("INSERT INTO projects (name,code,start_date) VALUES ('P1','P1','2026-01-01') RETURNING id")).rows[0].id;
    otherProjectId = (await pool.query("INSERT INTO projects (name,code,start_date) VALUES ('P2','P2','2026-01-01') RETURNING id")).rows[0].id;

    await pool.query("INSERT INTO project_members (project_id,user_id,role) VALUES ($1,$2,'ban_quan_ly')", [projectId, bqlId]);
    await pool.query("INSERT INTO project_members (project_id,user_id,role) VALUES ($1,$2,'chu_dau_tu')", [projectId, invId]);
    await pool.query("INSERT INTO project_members (project_id,user_id,role) VALUES ($1,$2,'chu_dau_tu')", [otherProjectId, outId]);
    await pool.query("INSERT INTO project_members (project_id,user_id,role) VALUES ($1,$2,'doi_truong')", [projectId, wrkId]);

    // leaf work item in projectId + một phiếu approved
    leafWiId = (await pool.query(
      `INSERT INTO work_items (project_id,code,name,type,quantity,unit,unit_price)
       VALUES ($1,'L1','Hang muc','work_item',10,'m3',100) RETURNING id`, [projectId])).rows[0].id;
    const v = await pool.query(
      `INSERT INTO acceptance_vouchers (project_id,batch_name,status,created_by)
       VALUES ($1,'D1','draft',$2) RETURNING id`, [projectId, bqlId]);
    const vId = v.rows[0].id;
    await pool.query(
      `INSERT INTO acceptance_voucher_items (voucher_id,work_item_id,cumulative_quantity,prev_approved_cumulative,delta_quantity,unit)
       VALUES ($1,$2,'5.000','0.000','5.000','m3')`, [vId, leafWiId]);
    await pool.query(
      `UPDATE acceptance_vouchers SET status='approved', reviewed_by=$2, reviewed_at=now() WHERE id=$1`,
      [vId, bqlId]);

    // leaf in other project (for cross-project 404 test)
    otherLeafWiId = (await pool.query(
      `INSERT INTO work_items (project_id,code,name,type,quantity,unit,unit_price)
       VALUES ($1,'LX','Hang muc khac','work_item',10,'m3',100) RETURNING id`, [otherProjectId])).rows[0].id;

    cookieBql = (await request(app).post("/api/auth/login").send({ email: "bql2@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieInvestor = (await request(app).post("/api/auth/login").send({ email: "inv2@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieOutsider = (await request(app).post("/api/auth/login").send({ email: "out2@test.com", password: "Password123!" })).headers["set-cookie"];
    cookieWorker = (await request(app).post("/api/auth/login").send({ email: "wrk2@test.com", password: "Password123!" })).headers["set-cookie"];
  });

  afterAll(async () => { await pool.end(); });

  it("401 khi chưa đăng nhập", async () => {
    const res = await request(app).get(`/api/projects/${projectId}/work-items/${leafWiId}/acceptance-dossier.pdf`);
    expect(res.status).toBe(401);
  });

  it("403 khi không thuộc dự án (IDOR)", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/work-items/${leafWiId}/acceptance-dossier.pdf`)
      .set("Cookie", cookieOutsider);
    expect(res.status).toBe(403);
  });

  it("403 khi member không có acceptance.export_dossier (doi_truong)", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/work-items/${leafWiId}/acceptance-dossier.pdf`)
      .set("Cookie", cookieWorker);
    expect(res.status).toBe(403);
  });

  it("403 khi member là chu_dau_tu (chỉ Ban quản lý có quyền xuất hồ sơ)", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/work-items/${leafWiId}/acceptance-dossier.pdf`)
      .set("Cookie", cookieInvestor);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/acceptance\.export_dossier/);
  });

  it("404 khi hạng mục không thuộc dự án (cross-project)", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/work-items/${otherLeafWiId}/acceptance-dossier.pdf`)
      .set("Cookie", cookieBql);
    expect(res.status).toBe(404);
  });

  it("200 + PDF hợp lệ cho Ban quản lý (có quyền acceptance.export_dossier)", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/work-items/${leafWiId}/acceptance-dossier.pdf`)
      .set("Cookie", cookieBql)
      .buffer(true)
      .parse((res2, cb) => {
        const chunks = [];
        res2.on("data", (c) => chunks.push(c));
        res2.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    const buf = res.body;
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
  });

  it("không ghi thay đổi nghiệp vụ khi chỉ xuất PDF (idempotent)", async () => {
    const before = await pool.query("SELECT count(*)::int AS c FROM acceptance_vouchers WHERE project_id=$1", [projectId]);
    await request(app)
      .get(`/api/projects/${projectId}/work-items/${leafWiId}/acceptance-dossier.pdf`)
      .set("Cookie", cookieBql)
      .buffer(true).parse((r, cb) => { const a=[]; r.on("data",x=>a.push(x)); r.on("end",()=>cb(null,Buffer.concat(a))); });
    const after = await pool.query("SELECT count(*)::int AS c FROM acceptance_vouchers WHERE project_id=$1", [projectId]);
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });
});
