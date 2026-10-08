const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const { calculateAndSaveSchedule } = require("../../services/scheduleCalculation");

describe("T-40 / S-17: Project Calendar and Holidays Schedule Calculation", () => {
  let cookieAdmin;
  
  beforeAll(async () => {
    // Clear data
    await pool.query(
      "TRUNCATE users, roles, projects, project_members, work_items, tasks, dependencies, schedule_results, calendars, holidays RESTART IDENTITY CASCADE"
    );

    // Insert Roles
    await pool.query(
      "INSERT INTO roles (name) VALUES ('chu_dau_tu'), ('ban_quan_ly'), ('doi_truong') ON CONFLICT DO NOTHING"
    );

    // Register & Login Admin
    await request(app).post("/api/auth/register").send({
      name: "Admin User",
      email: "admin_t40@test.com",
      password: "Password123",
      confirmPassword: "Password123",
    });

    await pool.query(
      "UPDATE users SET is_system_admin = true WHERE email = 'admin_t40@test.com'"
    );

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "admin_t40@test.com",
      password: "Password123",
    });
    cookieAdmin = loginRes.headers["set-cookie"];
  });

  afterAll(async () => {
    await pool.end();
  });

  // Helper to create a project
  async function createProject(name, code, startDate = "2026-01-01") {
    const res = await request(app)
      .post("/api/projects")
      .set("Cookie", cookieAdmin)
      .send({
        name,
        code,
        start_date: startDate,
      });
    return res.body.project;
  }

  // Helper to create work_item and task
  async function createTask(projectId, taskName, duration) {
    const wiRes = await pool.query(
      "INSERT INTO work_items (project_id, name, type) VALUES ($1, $2, 'leaf') RETURNING id",
      [projectId, `Hạng mục ${taskName}`]
    );
    const workItemId = wiRes.rows[0].id;

    const taskRes = await pool.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, $2, $3) RETURNING *",
      [workItemId, taskName, duration]
    );
    return taskRes.rows[0];
  }

  // TEST 1: Việc 6 ngày bắt đầu thứ năm kết thúc thứ tư tuần sau (Lịch 6 ngày/tuần, CN nghỉ)
  test("TEST 1: 6 working days starting Thursday finishes on Wednesday next week (6-day calendar, Sunday off)", async () => {
    const project = await createProject("Project T40 Test 1", "T40_P1", "2026-01-01");
    // 2026-01-01 is Thursday. Default calendar: Mon-Sat working, Sun non-working.
    const task = await createTask(project.id, "Công việc móng 6 ngày", 6);

    const calcRes = await request(app)
      .post(`/api/projects/${project.id}/schedule/recalculate`)
      .set("Cookie", cookieAdmin);

    expect(calcRes.status).toBe(200);

    const srRes = await pool.query(
      "SELECT early_start, early_finish FROM schedule_results WHERE task_id = $1",
      [task.id]
    );

    expect(srRes.rows.length).toBe(1);
    const row = srRes.rows[0];

    const earlyStartStr = new Date(row.early_start).toISOString().substring(0, 10);
    const earlyFinishStr = new Date(row.early_finish).toISOString().substring(0, 10);

    // Thursday 2026-01-01 -> Wednesday 2026-01-07
    expect(earlyStartStr).toBe("2026-01-01");
    expect(earlyFinishStr).toBe("2026-01-07");
  });

  // TEST 2: Thêm 1 ngày lễ vào ngày làm việc thì ngày hoàn thành lùi 1 ngày làm việc
  test("TEST 2: Adding 1 holiday on Friday delays early_finish to Thursday next week", async () => {
    const project = await createProject("Project T40 Test 2", "T40_P2", "2026-01-01");
    const task = await createTask(project.id, "Công việc móng 6 ngày có lễ", 6);

    // Thêm ngày lễ vào thứ Sáu (2026-01-02)
    const holRes = await request(app)
      .post(`/api/projects/${project.id}/holidays`)
      .set("Cookie", cookieAdmin)
      .send({
        holiday_date: "2026-01-02",
        name: "Nghỉ Tết Dương Lịch",
      });

    expect(holRes.status).toBe(201);
    expect(holRes.body.holiday.holiday_date).toContain("2026-01-02");

    // Recalculate schedule
    await request(app)
      .post(`/api/projects/${project.id}/schedule/recalculate`)
      .set("Cookie", cookieAdmin);

    const srRes = await pool.query(
      "SELECT early_start, early_finish FROM schedule_results WHERE task_id = $1",
      [task.id]
    );

    const row = srRes.rows[0];
    const earlyStartStr = new Date(row.early_start).toISOString().substring(0, 10);
    const earlyFinishStr = new Date(row.early_finish).toISOString().substring(0, 10);

    // Thursday 2026-01-01 -> Thursday 2026-01-08 (lùi 1 ngày làm việc vì thứ Sáu nghỉ lễ)
    expect(earlyStartStr).toBe("2026-01-01");
    expect(earlyFinishStr).toBe("2026-01-08");
  });

  // TEST 3: Holiday của project A không ảnh hưởng project B
  test("TEST 3: Holiday of project A does not affect project B", async () => {
    const projectA = await createProject("Project A", "PRJ_A", "2026-01-01");
    const projectB = await createProject("Project B", "PRJ_B", "2026-01-01");

    const taskA = await createTask(projectA.id, "Task A 6 days", 6);
    const taskB = await createTask(projectB.id, "Task B 6 days", 6);

    // Add holiday only to Project A
    await request(app)
      .post(`/api/projects/${projectA.id}/holidays`)
      .set("Cookie", cookieAdmin)
      .send({
        holiday_date: "2026-01-02",
        name: "Lễ riêng Project A",
      });

    // Calculate schedule for both projects
    await calculateAndSaveSchedule(projectA.id);
    await calculateAndSaveSchedule(projectB.id);

    const resA = await pool.query(
      "SELECT early_finish FROM schedule_results WHERE task_id = $1",
      [taskA.id]
    );
    const resB = await pool.query(
      "SELECT early_finish FROM schedule_results WHERE task_id = $1",
      [taskB.id]
    );

    const finishA = new Date(resA.rows[0].early_finish).toISOString().substring(0, 10);
    const finishB = new Date(resB.rows[0].early_finish).toISOString().substring(0, 10);

    // Project A ends on Thursday (delayed by holiday)
    expect(finishA).toBe("2026-01-08");
    // Project B ends on Wednesday (not affected)
    expect(finishB).toBe("2026-01-07");
  });

  // TEST 4: Đổi lịch hoặc ngày lễ phải đánh dấu schedule cần tính lại theo cơ chế T-26 (needs_recalculation = true)
  test("TEST 4: Updating calendar or holidays marks needs_recalculation = true (T-26)", async () => {
    const project = await createProject("Project Recalc Test", "PRJ_RECALC", "2026-01-01");
    const task = await createTask(project.id, "Task Recalc", 4);

    // Tính lịch lần 1 -> needs_recalculation = false
    await calculateAndSaveSchedule(project.id);
    let sr = await pool.query(
      "SELECT needs_recalculation FROM schedule_results WHERE task_id = $1",
      [task.id]
    );
    expect(sr.rows[0].needs_recalculation).toBe(false);

    // 1. Đổi calendar (PUT /api/projects/:projectId/calendar) -> phải dirty
    await request(app)
      .put(`/api/projects/${project.id}/calendar`)
      .set("Cookie", cookieAdmin)
      .send({
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false, // tắt thứ Bảy
        sunday: false,
      });

    sr = await pool.query(
      "SELECT needs_recalculation FROM schedule_results WHERE task_id = $1",
      [task.id]
    );
    expect(sr.rows[0].needs_recalculation).toBe(true);

    // Tính lại -> false
    await calculateAndSaveSchedule(project.id);
    sr = await pool.query(
      "SELECT needs_recalculation FROM schedule_results WHERE task_id = $1",
      [task.id]
    );
    expect(sr.rows[0].needs_recalculation).toBe(false);

    // 2. Thêm holiday -> phải dirty
    const addHolRes = await request(app)
      .post(`/api/projects/${project.id}/holidays`)
      .set("Cookie", cookieAdmin)
      .send({
        holiday_date: "2026-01-02",
        name: "Lễ kiểm tra recalculate",
      });
    const holidayId = addHolRes.body.holiday.id;

    sr = await pool.query(
      "SELECT needs_recalculation FROM schedule_results WHERE task_id = $1",
      [task.id]
    );
    expect(sr.rows[0].needs_recalculation).toBe(true);

    // Tính lại -> false
    await calculateAndSaveSchedule(project.id);

    // 3. Xóa holiday -> phải dirty
    await request(app)
      .delete(`/api/projects/${project.id}/holidays/${holidayId}`)
      .set("Cookie", cookieAdmin);

    sr = await pool.query(
      "SELECT needs_recalculation FROM schedule_results WHERE task_id = $1",
      [task.id]
    );
    expect(sr.rows[0].needs_recalculation).toBe(true);
  });

  // TEST 5: Không cho phép duplicate holiday_date trong cùng project
  test("TEST 5: Duplicate holiday_date in same project is rejected with 400", async () => {
    const project = await createProject("Project Unique Hol", "PRJ_UNIQ", "2026-01-01");

    // Thêm lần 1
    const res1 = await request(app)
      .post(`/api/projects/${project.id}/holidays`)
      .set("Cookie", cookieAdmin)
      .send({
        holiday_date: "2026-09-02",
        name: "Quốc khánh",
      });
    expect(res1.status).toBe(201);

    // Thêm lần 2 cùng ngày
    const res2 = await request(app)
      .post(`/api/projects/${project.id}/holidays`)
      .set("Cookie", cookieAdmin)
      .send({
        holiday_date: "2026-09-02",
        name: "Quốc khánh trùng",
      });
    expect(res2.status).toBe(400);
    expect(res2.body.message).toContain("đã tồn tại trong dự án");
  });

  // TEST 6: Hai project khác nhau có thể có cùng holiday_date
  test("TEST 6: Two different projects can have the same holiday_date", async () => {
    const project1 = await createProject("Project Hol 1", "PRJ_H1", "2026-01-01");
    const project2 = await createProject("Project Hol 2", "PRJ_H2", "2026-01-01");

    const res1 = await request(app)
      .post(`/api/projects/${project1.id}/holidays`)
      .set("Cookie", cookieAdmin)
      .send({
        holiday_date: "2026-04-30",
        name: "Giải phóng miền Nam",
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/api/projects/${project2.id}/holidays`)
      .set("Cookie", cookieAdmin)
      .send({
        holiday_date: "2026-04-30",
        name: "Giải phóng miền Nam",
      });
    expect(res2.status).toBe(201);
  });

  // TEST 7: Calendar của từng project được sử dụng đúng khi tính schedule (ví dụ lịch 5 ngày/tuần: T7, CN nghỉ)
  test("TEST 7: Project custom calendar (5 days/week) is correctly used in schedule calculation", async () => {
    const project = await createProject("Project 5 days", "PRJ_5D", "2026-01-01");
    const task = await createTask(project.id, "Task 6 working days (5-day week)", 6);

    // Cập nhật lịch: Thứ 2 -> Thứ 6 làm việc, Thứ 7 & CN nghỉ
    await request(app)
      .put(`/api/projects/${project.id}/calendar`)
      .set("Cookie", cookieAdmin)
      .send({
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: false,
        sunday: false,
      });

    // Recalculate schedule
    await request(app)
      .post(`/api/projects/${project.id}/schedule/recalculate`)
      .set("Cookie", cookieAdmin);

    const srRes = await pool.query(
      "SELECT early_start, early_finish FROM schedule_results WHERE task_id = $1",
      [task.id]
    );

    const row = srRes.rows[0];
    const earlyStartStr = new Date(row.early_start).toISOString().substring(0, 10);
    const earlyFinishStr = new Date(row.early_finish).toISOString().substring(0, 10);

    // Thu 01 = Day 1
    // Fri 02 = Day 2
    // Sat 03 & Sun 04 = OFF
    // Mon 05 = Day 3
    // Tue 06 = Day 4
    // Wed 07 = Day 5
    // Thu 08 = Day 6
    expect(earlyStartStr).toBe("2026-01-01");
    expect(earlyFinishStr).toBe("2026-01-08");
  });
});
