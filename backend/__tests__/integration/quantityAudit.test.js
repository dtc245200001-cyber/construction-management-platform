"use strict";

// S-39 / T-102 + T-103 + T-104 (integration, Postgres thật):
//   - T-102: audit_logs là bảng chỉ-ghi-thêm (trigger chặn UPDATE/DELETE).
//   - T-103: POST báo khối lượng tự ghi audit CREATE_QUANTITY_REPORT.
//   - T-104: GET history trả timeline "ai đã lập, khi nào";
//            API audit không có đường sửa/xóa.

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("S-39: Audit log chỉ ghi thêm cho báo khối lượng (T-102/T-103/T-104)", () => {
  let cookieDoiTruong;
  let cookieChuDauTu;
  let projectId;
  let taskId;
  let doiTruongId;

  beforeAll(async () => {
    await pool.query(
      "TRUNCATE TABLE audit_logs, task_quantity_reports, task_assignments, team_members, teams, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    await pool.query(
      "INSERT INTO roles (name) VALUES ('doi_truong'), ('chu_dau_tu') ON CONFLICT (name) DO NOTHING"
    );
    const { rows: roles } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => roles.find((r) => r.name === name).id;

    const passwordHash = await argon2.hash("Password123!");

    const doiTruong = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Doi Truong', 'doitruong-s39@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("doi_truong")]
    );
    doiTruongId = doiTruong.rows[0].id;

    const chuDauTu = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Chu Dau Tu', 'chudautu-s39@test.com', $1, $2, false, true) RETURNING id",
      [passwordHash, getRole("chu_dau_tu")]
    );

    cookieDoiTruong = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: "doitruong-s39@test.com", password: "Password123!" })
    ).headers["set-cookie"];
    cookieChuDauTu = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: "chudautu-s39@test.com", password: "Password123!" })
    ).headers["set-cookie"];

    const proj = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Du an S-39', 'PRJ-S39', '2026-01-01') RETURNING id"
    );
    projectId = proj.rows[0].id;

    await pool.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'doi_truong'), ($1, $3, 'chu_dau_tu')",
      [projectId, doiTruongId, chuDauTu.rows[0].id]
    );

    const team = await pool.query(
      "INSERT INTO teams (project_id, name) VALUES ($1, 'Doi 1') RETURNING id",
      [projectId]
    );
    await pool.query(
      "INSERT INTO team_members (team_id, project_id, user_id) VALUES ($1, $2, $3)",
      [team.rows[0].id, projectId, doiTruongId]
    );

    const wi = await pool.query(
      "INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'Hang muc A', 'HM-A', 'category') RETURNING id",
      [projectId]
    );
    const task = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days, planned_quantity, quantity_unit) VALUES ($1, 'Dao dat', 5, 100, 'm3') RETURNING id",
      [wi.rows[0].id]
    );
    taskId = task.rows[0].id;

    await pool.query(
      "INSERT INTO task_assignments (task_id, team_id) VALUES ($1, $2)",
      [taskId, team.rows[0].id]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("T-103: POST báo khối lượng thành công và tự ghi 1 dòng audit", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks/${taskId}/quantity-reports`)
      .set("Cookie", cookieDoiTruong)
      .send({ quantity: "10.5", report_date: "2026-10-05" });

    expect(res.status).toBe(201);
    const reportId = res.body.report.id;

    const audit = await pool.query(
      "SELECT * FROM audit_logs WHERE entity = 'task_quantity_reports' AND entity_id = $1",
      [reportId]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].action).toBe("CREATE_QUANTITY_REPORT");
    expect(Number(audit.rows[0].user_id)).toBe(doiTruongId);
    expect(Number(audit.rows[0].project_id)).toBe(projectId);
    expect(audit.rows[0].details.quantity).toBe("10.5");
    expect(audit.rows[0].details.report_date).toBe("2026-10-05");
  });

  it("T-104: GET history trả timeline có tên người lập", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/tasks/${taskId}/quantity-reports/history`)
      .set("Cookie", cookieChuDauTu);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThanOrEqual(1);

    const row = res.body.history[0];
    expect(row.audit_action).toBe("CREATE_QUANTITY_REPORT");
    expect(row.audit_user_name).toBe("Doi Truong");
    expect(row.reported_by_name).toBe("Doi Truong");
  });

  it("T-102: UPDATE audit_logs bị trigger chặn", async () => {
    const before = await pool.query(
      "SELECT action FROM audit_logs WHERE action = 'CREATE_QUANTITY_REPORT' LIMIT 1"
    );
    expect(before.rows.length).toBeGreaterThanOrEqual(1);
    const id = (
      await pool.query(
        "SELECT id FROM audit_logs WHERE action = 'CREATE_QUANTITY_REPORT' LIMIT 1"
      )
    ).rows[0].id;

    await expect(
      pool.query("UPDATE audit_logs SET action = 'FORGED' WHERE id = $1", [id])
    ).rejects.toThrow(/append-only/i);

    const after = await pool.query("SELECT action FROM audit_logs WHERE id = $1", [id]);
    expect(after.rows[0].action).toBe("CREATE_QUANTITY_REPORT");
  });

  it("T-102: DELETE audit_logs bị trigger chặn", async () => {
    const { rows } = await pool.query(
      "SELECT id FROM audit_logs WHERE action = 'CREATE_QUANTITY_REPORT' LIMIT 1"
    );
    await expect(
      pool.query("DELETE FROM audit_logs WHERE id = $1", [rows[0].id])
    ).rejects.toThrow(/append-only/i);

    const still = await pool.query("SELECT id FROM audit_logs WHERE id = $1", [
      rows[0].id,
    ]);
    expect(still.rows).toHaveLength(1);
  });

  it("T-104: đội trưởng không được xem lịch sử việc của đội khác", async () => {
    // Tạo đội 2 + việc 2 không giao cho đội 1, đội trưởng đội 1 gọi history -> 403
    const team2 = await pool.query(
      "INSERT INTO teams (project_id, name) VALUES ($1, 'Doi 2') RETURNING id",
      [projectId]
    );
    const wi2 = await pool.query(
      "INSERT INTO work_items (project_id, name, code, type) VALUES ($1, 'Hang muc B', 'HM-B', 'category') RETURNING id",
      [projectId]
    );
    const task2 = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Xay tuong', 3) RETURNING id",
      [wi2.rows[0].id]
    );
    await pool.query("INSERT INTO task_assignments (task_id, team_id) VALUES ($1, $2)", [
      task2.rows[0].id,
      team2.rows[0].id,
    ]);

    const res = await request(app)
      .get(`/api/projects/${projectId}/tasks/${task2.rows[0].id}/quantity-reports/history`)
      .set("Cookie", cookieDoiTruong);

    expect(res.status).toBe(403);
  });
});
