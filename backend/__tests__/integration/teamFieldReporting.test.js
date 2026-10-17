"use strict";

const request = require("supertest");
const app = require("../../app");
const db = require("../../config/db");
const argon2 = require("argon2");

describe("S-26 Integration: Đội trưởng xem việc được giao và báo khối lượng", () => {
  let projectId;
  let workItemId;
  let task1Id;
  let task2Id; // Critical task
  let teamId;
  let otherTeamId;
  let teamLeaderUserId;
  let siteManagerUserId;
  let otherLeaderUserId;
  let teamLeaderCookie;
  let siteManagerCookie;
  let otherLeaderCookie;

  const testPassword = "Password123!";

  beforeAll(async () => {
    // 1. Tạo users: Đội trưởng, Chỉ huy trưởng, Đội trưởng khác
    const passwordHash = await argon2.hash(testPassword);
    const suffix = Date.now();

    const leaderRes = await db.query(
      `INSERT INTO users (email, password_hash, name, role_id, is_verified)
       VALUES ($1, $2, $3, 1, true) RETURNING id`,
      [`leader_${suffix}@test.com`, passwordHash, "Nguyễn Văn Đội Trưởng"]
    );
    teamLeaderUserId = leaderRes.rows[0].id;

    const managerRes = await db.query(
      `INSERT INTO users (email, password_hash, name, role_id, is_verified)
       VALUES ($1, $2, $3, 1, true) RETURNING id`,
      [`manager_${suffix}@test.com`, passwordHash, "Trần Văn Chỉ Huy"]
    );
    siteManagerUserId = managerRes.rows[0].id;

    const otherLeaderRes = await db.query(
      `INSERT INTO users (email, password_hash, name, role_id, is_verified)
       VALUES ($1, $2, $3, 1, true) RETURNING id`,
      [`other_${suffix}@test.com`, passwordHash, "Lê Văn Đội Khác"]
    );
    otherLeaderUserId = otherLeaderRes.rows[0].id;

    // 2. Tạo dự án
    const projRes = await db.query(
      `INSERT INTO projects (name, code, start_date)
       VALUES ($1, $2, '2026-10-01') RETURNING id`,
      [`Dự án S-26 Test ${suffix}`, `P-S26-${suffix}`]
    );
    projectId = projRes.rows[0].id;

    // 3. Phân quyền dự án
    await db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'doi_truong'), ($1, $3, 'chi_huy_truong'), ($1, $4, 'doi_truong')`,
      [projectId, teamLeaderUserId, siteManagerUserId, otherLeaderUserId]
    );

    // 4. Tạo đội và gán thành viên
    const teamRes = await db.query(
      `INSERT INTO teams (project_id, name)
       VALUES ($1, $2) RETURNING id`,
      [projectId, `Đội Cốt thép ${suffix}`]
    );
    teamId = teamRes.rows[0].id;

    const otherTeamRes = await db.query(
      `INSERT INTO teams (project_id, name)
       VALUES ($1, $2) RETURNING id`,
      [projectId, `Đội Bê tông ${suffix}`]
    );
    otherTeamId = otherTeamRes.rows[0].id;

    await db.query(
      `INSERT INTO team_members (team_id, project_id, user_id)
       VALUES ($1, $2, $3), ($4, $2, $5)`,
      [teamId, projectId, teamLeaderUserId, otherTeamId, otherLeaderUserId]
    );

    // 5. Tạo WBS & Tasks
    const wiRes = await db.query(
      `INSERT INTO work_items (project_id, code, name)
       VALUES ($1, 'WI-01', 'Hạng mục móng') RETURNING id`,
      [projectId]
    );
    workItemId = wiRes.rows[0].id;

    // Task 1: Việc thường, kế hoạch 50 m3, bắt đầu 2026-10-14
    const t1Res = await db.query(
      `INSERT INTO tasks (work_item_id, name, duration_days, planned_quantity, quantity_unit, manual_start_date)
       VALUES ($1, 'Gia công cốt thép móng', 3, 50.00, 'm3', '2026-10-14') RETURNING id`,
      [workItemId]
    );
    task1Id = t1Res.rows[0].id;

    // Task 2: Việc găng (Critical path), kế hoạch 100 m3, bắt đầu 2026-10-12
    const t2Res = await db.query(
      `INSERT INTO tasks (work_item_id, name, duration_days, planned_quantity, quantity_unit, manual_start_date)
       VALUES ($1, 'Lắp đặt cốt thép đài móng', 4, 100.00, 'm3', '2026-10-12') RETURNING id`,
      [workItemId]
    );
    task2Id = t2Res.rows[0].id;

    // Thêm kết quả schedule_results để task2 có is_critical = true, early_start = 2026-10-12
    await db.query(
      `INSERT INTO schedule_results (task_id, early_start, early_finish, is_critical, total_float)
       VALUES ($1, '2026-10-14 08:00:00', '2026-10-17 17:00:00', false, 2),
              ($2, '2026-10-12 08:00:00', '2026-10-16 17:00:00', true, 0)`,
      [task1Id, task2Id]
    );

    // Gán 2 tasks cho teamId
    await db.query(
      `INSERT INTO task_assignments (task_id, team_id, assigned_by)
       VALUES ($1, $2, $3), ($4, $2, $3)`,
      [task1Id, teamId, siteManagerUserId, task2Id]
    );

    // 6. Đăng nhập lấy cookies
    const leaderLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: `leader_${suffix}@test.com`, password: testPassword });
    teamLeaderCookie = leaderLogin.headers["set-cookie"];

    const managerLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: `manager_${suffix}@test.com`, password: testPassword });
    siteManagerCookie = managerLogin.headers["set-cookie"];

    const otherLeaderLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: `other_${suffix}@test.com`, password: testPassword });
    otherLeaderCookie = otherLeaderLogin.headers["set-cookie"];
  });

  afterAll(async () => {
    if (projectId) {
      await db.query(`DELETE FROM projects WHERE id = $1`, [projectId]);
    }
    if (teamLeaderUserId || siteManagerUserId || otherLeaderUserId) {
      await db.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, [
        teamLeaderUserId,
        siteManagerUserId,
        otherLeaderUserId,
      ]);
    }
  });

  test("AC 1: Đội trưởng xem việc của đội trong tuần, sắp theo ngày bắt đầu, việc găng có đánh dấu", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/my-team/tasks`)
      .set("Cookie", teamLeaderCookie)
      .query({
        week_start: "2026-10-12",
        week_end: "2026-10-18",
        report_date: "2026-10-17",
      });

    expect(res.status).toBe(200);
    expect(res.body.team).toBeDefined();
    expect(res.body.team.id).toBe(teamId);
    expect(res.body.tasks).toHaveLength(2);

    // Kiểm tra sắp theo ngày bắt đầu: task 2 bắt đầu 2026-10-12 phải đứng trước task 1 (2026-10-14)
    expect(res.body.tasks[0].task_id).toBe(task2Id);
    expect(res.body.tasks[1].task_id).toBe(task1Id);

    // Kiểm tra việc găng có đánh dấu is_critical = true
    expect(res.body.tasks[0].is_critical).toBe(true);
    expect(res.body.tasks[1].is_critical).toBe(false);

    // Khối lượng kế hoạch đầy đủ
    expect(Number(res.body.tasks[0].planned_quantity)).toBe(100);
    expect(res.body.tasks[0].quantity_unit).toBe("m3");
  });

  test("AC 2: Đội trưởng báo khối lượng đã làm -> Chỉ huy trưởng thấy số này kèm thời điểm và tổng luỹ kế", async () => {
    // 1. Đội trưởng báo 20 m3 cho task 1 vào ngày 2026-10-17
    const reportRes = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task1Id}/quantity-reports`)
      .set("Cookie", teamLeaderCookie)
      .send({
        quantity: "20.50",
        report_date: "2026-10-17",
      });

    expect(reportRes.status).toBe(201);
    expect(reportRes.body.report).toBeDefined();
    expect(Number(reportRes.body.report.quantity)).toBe(20.5);
    expect(reportRes.body.report.created_at).toBeDefined();
    expect(reportRes.body.task.cumulative_reported).toBe("20.50");
    expect(reportRes.body.task.reported_today).toBe("20.50");
    expect(reportRes.body.task.over_planned).toBe(false);

    // 2. Chỉ huy trưởng xem việc của đội này -> thấy số báo hôm nay, lũy kế và thời điểm báo gần nhất
    const managerViewRes = await request(app)
      .get(`/api/projects/${projectId}/my-team/tasks`)
      .set("Cookie", siteManagerCookie)
      .query({
        week_start: "2026-10-12",
        week_end: "2026-10-18",
        report_date: "2026-10-17",
        team_id: teamId,
      });

    expect(managerViewRes.status).toBe(200);
    const task1 = managerViewRes.body.tasks.find((t) => t.task_id === task1Id);
    expect(task1).toBeDefined();
    expect(task1.reported_today).toBe("20.50");
    expect(task1.cumulative_reported).toBe("20.50");
    expect(task1.last_reported_at).toBeDefined();

    // 3. Chỉ huy trưởng xem feed báo cáo toàn dự án (GET /quantity-reports)
    const feedRes = await request(app)
      .get(`/api/projects/${projectId}/quantity-reports`)
      .set("Cookie", siteManagerCookie)
      .query({ report_date: "2026-10-17" });

    expect(feedRes.status).toBe(200);
    expect(feedRes.body.reports.length).toBeGreaterThanOrEqual(1);
    const feedItem = feedRes.body.reports.find((r) => r.task_id === task1Id);
    expect(feedItem).toBeDefined();
    expect(Number(feedItem.quantity)).toBe(20.5);
    expect(feedItem.cumulative_reported).toBe("20.50");
    expect(feedItem.reported_by_name).toBe("Nguyễn Văn Đội Trưởng");
    expect(feedItem.created_at).toBeDefined();
  });

  test("AC 3: Báo khối lượng làm luỹ kế vượt khối lượng của việc -> Cảnh báo nhưng vẫn ghi nhận", async () => {
    // Task 1 có planned_quantity = 50.00
    // Đã báo trước đó: 20.50
    // Bây giờ báo thêm: 35.00 -> Tổng lũy kế = 55.50 > 50.00 (VƯỢT)
    const exceedRes = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task1Id}/quantity-reports`)
      .set("Cookie", teamLeaderCookie)
      .send({
        quantity: "35.00",
        report_date: "2026-10-17",
      });

    // Vẫn trả về 201 Created (không bị chặn)
    expect(exceedRes.status).toBe(201);
    expect(exceedRes.body.report).toBeDefined();
    expect(Number(exceedRes.body.report.quantity)).toBe(35);

    // Có thông điệp cảnh báo rõ ràng
    expect(exceedRes.body.warning).toContain("vượt");
    expect(exceedRes.body.task.over_planned).toBe(true);
    expect(exceedRes.body.task.cumulative_reported).toBe("55.50");
    expect(exceedRes.body.task.reported_today).toBe("55.50");

    // Chỉ huy trưởng mở lại cũng thấy cảnh báo over_planned = true
    const checkRes = await request(app)
      .get(`/api/projects/${projectId}/my-team/tasks`)
      .set("Cookie", siteManagerCookie)
      .query({
        week_start: "2026-10-12",
        week_end: "2026-10-18",
        report_date: "2026-10-17",
        team_id: teamId,
      });

    const task1 = checkRes.body.tasks.find((t) => t.task_id === task1Id);
    expect(task1.over_planned).toBe(true);
    expect(task1.cumulative_reported).toBe("55.50");
  });

  test("Bảo mật: Đội trưởng không thể báo khối lượng cho công việc của đội khác", async () => {
    const forbiddenRes = await request(app)
      .post(`/api/projects/${projectId}/tasks/${task1Id}/quantity-reports`)
      .set("Cookie", otherLeaderCookie)
      .send({
        quantity: "10.00",
        report_date: "2026-10-17",
      });

    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.message).toContain("không được giao cho đội của bạn");
  });

  test("Chỉ huy trưởng có thể xem tất cả các đội bằng team_id=all", async () => {
    const allTeamsRes = await request(app)
      .get(`/api/projects/${projectId}/my-team/tasks`)
      .set("Cookie", siteManagerCookie)
      .query({
        week_start: "2026-10-12",
        week_end: "2026-10-18",
        report_date: "2026-10-17",
        team_id: "all",
      });

    expect(allTeamsRes.status).toBe(200);
    expect(allTeamsRes.body.team.id).toBe("all");
    expect(allTeamsRes.body.tasks.length).toBeGreaterThanOrEqual(2);
  });
});
