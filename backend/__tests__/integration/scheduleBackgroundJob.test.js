"use strict";

const request = require("supertest");
const app = require("../../app");
const pool = require("../../config/db");
const argon2 = require("argon2");
const { waitForIdle } = require("../../services/scheduleCalculation");

describe("T-36: Background Job and Progress Integration", () => {
  let projectId;
  let workItemId;
  let authCookie;
  let taskIds = [];

  beforeAll(async () => {
    await pool.query(
      "TRUNCATE TABLE schedule_jobs, schedule_results, dependencies, tasks, work_items, project_members, projects, users RESTART IDENTITY CASCADE"
    );

    const passwordHash = await argon2.hash("Password123!");
    const roleRes = await pool.query("SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1");
    const roleId = roleRes.rows.length > 0 ? roleRes.rows[0].id : 1;

    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_id, is_system_admin, is_verified) VALUES ('Admin', 'admin@test.com', $1, $2, true, true) RETURNING id`,
      [passwordHash, roleId]
    );
    const userId = userRes.rows[0].id;

    const loginRes = await request(app).post("/api/auth/login").send({ email: "admin@test.com", password: "Password123!" });
    authCookie = loginRes.headers["set-cookie"];

    const projRes = await pool.query(
      `INSERT INTO projects (name, code, start_date) VALUES ('Dự án nền T-36', 'PRJ-BG', '2026-10-01') RETURNING id`
    );
    projectId = projRes.rows[0].id;

    await pool.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'ban_quan_ly')`,
      [projectId, userId]
    );

    const wiRes = await pool.query(
      `INSERT INTO work_items (project_id, code, name, type) VALUES ($1, 'WI-BG', 'Hạng mục nền', 'category') RETURNING id`,
      [projectId]
    );
    workItemId = wiRes.rows[0].id;
  });

  afterAll(async () => {
    await waitForIdle();
    await pool.end();
  });

  describe("PATCH Progress updates dirty flag and calculate background job", () => {
    it("Tạo mạng 205 công việc (vượt ngưỡng 200)", async () => {
      let values = [];
      for (let i = 0; i < 205; i++) {
        values.push(`(${workItemId}, 'Task ${i}', 2)`);
      }
      
      const insertRes = await pool.query(`INSERT INTO tasks (work_item_id, name, duration_days) VALUES ${values.join(',')} RETURNING id`);
      taskIds = insertRes.rows.map(r => r.id);
      expect(taskIds.length).toBe(205);
    });

    it("PATCH progress sets needs_recalculation (dirty) -> 200", async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskIds[0]}/progress`)
        .set("Cookie", authCookie)
        .send({
          actual_start_date: "2026-10-02",
          percent_complete: 25,
        });
      expect(res.status).toBe(200);

      // We inserted 205 tasks, but they don't have schedule_results yet. Let's calculate them first.
      await request(app).post(`/api/projects/${projectId}/schedule/recalculate`).set("Cookie", authCookie);
      
      // Wait for it to finish because it returns 202
      let isDone = false;
      while(!isDone) {
        await new Promise(r => setTimeout(r, 500));
        const check = await pool.query(`SELECT status FROM schedule_jobs WHERE project_id = $1 ORDER BY id DESC LIMIT 1`, [projectId]);
        if(check.rows[0] && check.rows[0].status === 'done') isDone = true;
      }

      // Now PATCH again to mark dirty
      const res2 = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskIds[1]}/progress`)
        .set("Cookie", authCookie)
        .send({
          actual_start_date: "2026-10-03",
          percent_complete: 30,
        });
      
      expect(res2.status).toBe(200);

      const dirtyCheck = await pool.query(`SELECT needs_recalculation FROM schedule_results WHERE task_id = $1`, [taskIds[1]]);
      expect(dirtyCheck.rows[0].needs_recalculation).toBe(true);
    });

    it("Calculate triggers background job (202) for >200 tasks", async () => {
      const start = Date.now();
      const res = await request(app).post(`/api/projects/${projectId}/schedule/recalculate`).set("Cookie", authCookie);
      const end = Date.now();
      expect(end - start).toBeLessThan(300); // Response should be fast

      expect(res.status).toBe(202);
      expect(res.body.jobId).toBeDefined();

      const jobId = res.body.jobId;

      let status = 'queued';
      let loopCount = 0;
      while ((status === 'queued' || status === 'running') && loopCount < 10) {
        await new Promise(r => setTimeout(r, 500));
        const jobRes = await request(app).get(`/api/projects/${projectId}/schedule-jobs/${jobId}`).set("Cookie", authCookie);
        expect(jobRes.status).toBe(200);
        status = jobRes.body.job.status;
        loopCount++;
      }
      expect(status).toBe('done');
      expect(loopCount * 500).toBeLessThan(5000);
    });

    it("Hai request calculate đồng thời chỉ tạo một job", async () => {
      // mark dirty
      await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskIds[2]}/progress`)
        .set("Cookie", authCookie)
        .send({ percent_complete: 10 });
      
      const [res1, res2] = await Promise.all([
        request(app).post(`/api/projects/${projectId}/schedule/recalculate`).set("Cookie", authCookie),
        request(app).post(`/api/projects/${projectId}/schedule/recalculate`).set("Cookie", authCookie)
      ]);

      expect(res1.status).toBe(202);
      expect(res2.status).toBe(202);
      expect(res1.body.jobId).toEqual(res2.body.jobId);
    });
    it("Job should keep dirty flag if project is modified during calculation", async () => {
      // Mark dirty first
      await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskIds[3]}/progress`)
        .set("Cookie", authCookie)
        .send({ percent_complete: 10 });
      
      const vCheck = await pool.query("SELECT schedule_version FROM projects WHERE id = $1", [projectId]);
      const expectedVersion = vCheck.rows[0].schedule_version;

      // Modify again to bump the version in DB
      await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskIds[4]}/progress`)
        .set("Cookie", authCookie)
        .send({ percent_complete: 20 });
      
      // Now finish job with old version
      const { runScheduleJobAsync } = require("../../services/scheduleCalculation");
      const insertJobRes = await pool.query(
        `INSERT INTO schedule_jobs (project_id, status) VALUES ($1, 'queued') RETURNING id`,
        [projectId]
      );
      await runScheduleJobAsync(insertJobRes.rows[0].id, projectId, null, expectedVersion);

      // Should still be dirty
      const dirtyCheck = await pool.query(`SELECT needs_recalculation FROM schedule_results WHERE task_id = $1`, [taskIds[4]]);
      expect(dirtyCheck.rows[0].needs_recalculation).toBe(true);
    });
  });
});
