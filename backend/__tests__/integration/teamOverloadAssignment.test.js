"use strict";

// T-57 / S-25: Integration Tests cho
// Màn hình phân công và cảnh báo quá tải đội thi công (> 3 việc chồng lịch).

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");

describe("Team Overload & Assignment Integration Tests (T-57 / S-25)", () => {
  let cookieCHT; // Chỉ huy trưởng: được phép giao việc
  let cookieDoiTruong; // Đội trưởng: không có quyền giao việc
  let projectId;
  let team1Id;
  let team2Id;
  let task1Id;
  let task2Id;
  let task3Id;
  let task4Id;

  beforeAll(async () => {
    // Dọn dẹp dữ liệu kiểm thử
    await pool.query(`
      TRUNCATE TABLE audit_logs, task_quantity_reports, task_assignments,
        schedule_results, tasks, work_items, team_members, teams,
        project_members, projects, users
      RESTART IDENTITY CASCADE
    `);

    // Tạo roles nếu chưa có
    const requiredRoles = ["chi_huy_truong", "ban_quan_ly", "doi_truong", "chu_dau_tu"];
    for (const r of requiredRoles) {
      await pool.query(
        "INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [r]
      );
    }
    const { rows: rolesRows } = await pool.query("SELECT id, name FROM roles");
    const getRole = (name) => rolesRows.find((r) => r.name === name).id;

    const passwordHash = await argon2.hash("Password123!");

    // Tạo user Chỉ huy trưởng
    const uCHT = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_verified) VALUES ('CHT_T57', 'cht_t57@test.com', $1, $2, true) RETURNING id",
      [passwordHash, getRole("chi_huy_truong")]
    );

    // Tạo user Đội trưởng
    const uDT = await pool.query(
      "INSERT INTO users (name, email, password_hash, role_id, is_verified) VALUES ('DT_T57', 'dt_t57@test.com', $1, $2, true) RETURNING id",
      [passwordHash, getRole("doi_truong")]
    );

    // Đăng nhập lấy cookie phiên
    cookieCHT = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: "cht_t57@test.com", password: "Password123!" })
    ).headers["set-cookie"];

    cookieDoiTruong = (
      await request(app)
        .post("/api/auth/login")
        .send({ email: "dt_t57@test.com", password: "Password123!" })
    ).headers["set-cookie"];

    // Tạo dự án
    const projRes = await pool.query(
      "INSERT INTO projects (name, code, start_date) VALUES ('Dự án T-57 Quá Tải', 'PRJ-T57', '2026-10-01') RETURNING id"
    );
    projectId = projRes.rows[0].id;

    // Gán thành viên dự án
    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES
        ($1, $2, 'chi_huy_truong'),
        ($1, $3, 'doi_truong')`,
      [projectId, uCHT.rows[0].id, uDT.rows[0].id]
    );

    // Tạo 2 đội thi công
    const t1 = await pool.query(
      "INSERT INTO teams (project_id, name) VALUES ($1, 'Đội Thi Công 1') RETURNING id",
      [projectId]
    );
    team1Id = t1.rows[0].id;

    const t2 = await pool.query(
      "INSERT INTO teams (project_id, name) VALUES ($1, 'Đội Thi Công 2') RETURNING id",
      [projectId]
    );
    team2Id = t2.rows[0].id;

    // Tạo hạng mục
    const wi = await pool.query(
      "INSERT INTO work_items (project_id, name, code) VALUES ($1, 'Phần Ngầm', 'WBS-M') RETURNING id",
      [projectId]
    );
    const workItemId = wi.rows[0].id;

    // Tạo 4 công việc có lịch trình CPM trùng nhau từ 2026-10-15 đến 2026-10-18:
    // Task 1: 2026-10-10 -> 2026-10-20
    const tk1 = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Đào móng', 11) RETURNING id",
      [workItemId]
    );
    task1Id = tk1.rows[0].id;
    await pool.query(
      "INSERT INTO schedule_results (task_id, early_start, early_finish, is_critical) VALUES ($1, '2026-10-10', '2026-10-20', true)",
      [task1Id]
    );

    // Task 2: 2026-10-12 -> 2026-10-22
    const tk2 = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Cốt thép móng', 11) RETURNING id",
      [workItemId]
    );
    task2Id = tk2.rows[0].id;
    await pool.query(
      "INSERT INTO schedule_results (task_id, early_start, early_finish, is_critical) VALUES ($1, '2026-10-12', '2026-10-22', false)",
      [task2Id]
    );

    // Task 3: 2026-10-14 -> 2026-10-25
    const tk3 = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Cốp pha móng', 12) RETURNING id",
      [workItemId]
    );
    task3Id = tk3.rows[0].id;
    await pool.query(
      "INSERT INTO schedule_results (task_id, early_start, early_finish, is_critical) VALUES ($1, '2026-10-14', '2026-10-25', false)",
      [task3Id]
    );

    // Task 4: 2026-10-15 -> 2026-10-18 (sẽ gây quá tải khi gán cùng 3 việc trên)
    const tk4 = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Đổ bê tông lót', 4) RETURNING id",
      [workItemId]
    );
    task4Id = tk4.rows[0].id;
    await pool.query(
      "INSERT INTO schedule_results (task_id, early_start, early_finish, is_critical) VALUES ($1, '2026-10-15', '2026-10-18', true)",
      [task4Id]
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  test("1. Phân công 3 việc đầu tiên cho Đội 1 thành công và không bị quá tải (<= 3 việc)", async () => {
    // Gán task 1
    const res1 = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task1Id}/assignment`)
      .set("Cookie", cookieCHT)
      .send({ team_id: team1Id });

    expect(res1.status).toBe(200);
    expect(res1.body.assignment.team_id).toBe(team1Id);
    expect(res1.body.warning).toBeNull();

    // Gán task 2
    const res2 = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task2Id}/assignment`)
      .set("Cookie", cookieCHT)
      .send({ team_id: team1Id });

    expect(res2.status).toBe(200);
    expect(res2.body.warning).toBeNull();

    // Gán task 3
    const res3 = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task3Id}/assignment`)
      .set("Cookie", cookieCHT)
      .send({ team_id: team1Id });

    expect(res3.status).toBe(200);
    expect(res3.body.warning).toBeNull();

    // Kiểm tra API workload của Đội 1: không quá tải
    const wlRes = await request(app)
      .get(`/api/projects/${projectId}/teams/${team1Id}/workload`)
      .set("Cookie", cookieCHT);

    expect(wlRes.status).toBe(200);
    expect(wlRes.body.workload.is_overloaded).toBe(false);
    expect(wlRes.body.workload.max_concurrent).toBe(3);
  });

  test("2. Preview check-assignment phát hiện quá tải trước khi gán việc thứ 4", async () => {
    const previewRes = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task4Id}/check-assignment`)
      .set("Cookie", cookieCHT)
      .send({ team_id: team1Id });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.can_assign).toBe(true);
    expect(previewRes.body.warning).not.toBeNull();
    expect(previewRes.body.warning.is_overloaded).toBe(true);
    expect(previewRes.body.warning.max_concurrent).toBe(4);

    const intervals = previewRes.body.warning.overloaded_intervals;
    expect(intervals).toHaveLength(1);
    expect(intervals[0].start_date).toBe("2026-10-15");
    expect(intervals[0].end_date).toBe("2026-10-18");
    expect(intervals[0].duration_days).toBe(4);
    expect(intervals[0].concurrent_count).toBe(4);
    expect(intervals[0].tasks).toHaveLength(4);
  });

  test("3. Gán việc thứ 4 gây chồng lịch: hiện cảnh báo rõ khoảng ngày, VẪN LƯU theo quy tắc (AC-2, AC-3)", async () => {
    const res4 = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task4Id}/assignment`)
      .set("Cookie", cookieCHT)
      .send({ team_id: team1Id });

    // AC-3: Vẫn thành công HTTP 200, lưu vào DB
    expect(res4.status).toBe(200);
    expect(res4.body.assignment.task_id).toBe(task4Id);
    expect(res4.body.assignment.team_id).toBe(team1Id);

    // AC-2: Cảnh báo rõ khoảng thời gian bị chồng
    expect(res4.body.warning).not.toBeNull();
    expect(res4.body.warning.is_overloaded).toBe(true);
    expect(res4.body.warning.max_concurrent).toBe(4);

    const interval = res4.body.warning.overloaded_intervals[0];
    expect(interval.start_date).toBe("2026-10-15");
    expect(interval.end_date).toBe("2026-10-18");
    expect(interval.duration_days).toBe(4);
    expect(interval.concurrent_count).toBe(4);

    // Xác nhận trong cơ sở dữ liệu thật: Task 4 đã được lưu vào task_assignments
    const dbCheck = await pool.query(
      "SELECT task_id, team_id FROM task_assignments WHERE task_id = $1",
      [task4Id]
    );
    expect(dbCheck.rows).toHaveLength(1);
    expect(dbCheck.rows[0].team_id).toBe(team1Id);
  });

  test("4. Đổi việc sang đội khác: đội cũ không còn thấy, ghi audit log và hết quá tải (AC-4)", async () => {
    // Chuyển Task 4 sang Đội 2
    const reassignRes = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task4Id}/assignment`)
      .set("Cookie", cookieCHT)
      .send({ team_id: team2Id });

    expect(reassignRes.status).toBe(200);
    expect(reassignRes.body.reassigned).toBe(true);
    expect(reassignRes.body.old_team_id).toBe(team1Id);
    expect(reassignRes.body.assignment.team_id).toBe(team2Id);

    // Kiểm tra danh sách việc của Đội 1: không còn Task 4
    const team1TasksRes = await request(app)
      .get(`/api/projects/${projectId}/teams/${team1Id}/tasks`)
      .set("Cookie", cookieCHT);

    expect(team1TasksRes.status).toBe(200);
    const team1TaskIds = team1TasksRes.body.tasks.map((t) => t.task_id);
    expect(team1TaskIds).not.toContain(task4Id);

    // Đội 1 kiểm tra workload: đã trở về trạng thái bình thường (không còn quá tải)
    const wlTeam1 = await request(app)
      .get(`/api/projects/${projectId}/teams/${team1Id}/workload`)
      .set("Cookie", cookieCHT);

    expect(wlTeam1.body.workload.is_overloaded).toBe(false);

    // Kiểm tra audit_logs đã ghi nhận hành động REASSIGN_TASK
    const auditRes = await pool.query(
      "SELECT action, entity, entity_id, details FROM audit_logs WHERE action = 'REASSIGN_TASK' AND entity_id = $1",
      [task4Id]
    );
    expect(auditRes.rows.length).toBeGreaterThan(0);
    expect(auditRes.rows[0].details.oldTeamId).toBe(team1Id);
    expect(auditRes.rows[0].details.newTeamId).toBe(team2Id);
  });

  test("5. Kiểm soát quyền: Đội trưởng gọi API gán việc bị từ chối 403 Forbidden (NFR S-25)", async () => {
    const resForbidden = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task1Id}/assignment`)
      .set("Cookie", cookieDoiTruong)
      .send({ team_id: team2Id });

    expect(resForbidden.status).toBe(403);
  });
});
