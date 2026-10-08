
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const logger = require('../utils/logger');
const { checkProjectAccess, allow, createProjectRouter } = require('../middleware/projectAccess');
const { ROLES } = require('../utils/constants');
const { createEmailLog, processEmailLogs } = require('../lib/emailSender');
const emailTemplates = require('../lib/emailTemplates');
const { calculateAndSaveSchedule, runScheduleJobAsync } = require("../services/scheduleCalculation");
const { markProjectScheduleDirty } = require("../services/scheduleRecalculation");

const router = createProjectRouter();

// GET /api/projects - Danh sách dự án mà user tham gia
router.get(
  "/",
  requireAuth,
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT p.id, p.name, p.code, p.location, p.status, p.start_date, p.sprint_length_weeks, p.actual_progress, p.planned_progress, p.created_at, p.updated_at, pm.role, pm.last_opened_at,
         (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id) as member_count
         FROM projects p 
         JOIN project_members pm ON p.id = pm.project_id 
         WHERE pm.user_id = $1 
         ORDER BY pm.last_opened_at DESC NULLS LAST, p.created_at DESC`,
        [req.session.user.id]
      );
      return res.json({
        projects: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);
const requireSystemAdmin = require("../middleware/systemAdmin");
const { createAuditMiddleware } = require("../utils/auditLogger");

// Hàm hỗ trợ loại bỏ dấu tiếng Việt (có thể tách ra utils sau)
function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// POST /api/projects - Tạo dự án mới
router.post(
  "/",
  requireSystemAdmin,
  createAuditMiddleware('CREATE_PROJECT', 'projects'),
  async (req, res, next) => {
    const { 
      name, code, location, start_date, sprint_length_weeks,
      province, project_type, stage, description, cover_image_url, expected_completion_date, is_public
    } = req.body;
    
    if (!name || name.length > 255) {
      return res.status(400).json({ message: "Tên dự án là bắt buộc và không quá 255 ký tự" });
    }
    if (!code) {
      return res.status(400).json({ message: "Mã dự án là bắt buộc" });
    }

    const normalized_search_text = removeAccents(`${name} ${province || ''} ${project_type || ''}`).toLowerCase();

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Check unique code
      const exist = await client.query("SELECT id FROM projects WHERE code = $1", [code]);
      if (exist.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Mã dự án đã tồn tại" });
      }
      
      const projectResult = await client.query(
        `INSERT INTO projects (
          name, code, location, start_date, sprint_length_weeks, status, actual_progress, planned_progress,
          province, project_type, stage, description, cover_image_url, expected_completion_date, is_public, normalized_search_text
        ) 
         VALUES ($1, $2, $3, $4, $5, 'Chuẩn bị', 0, 0, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          name, code, location || null, start_date || null, sprint_length_weeks || 1,
          province || null, project_type || null, stage || null, description || null, cover_image_url || null, expected_completion_date || null, is_public || false, normalized_search_text
        ]
      );
      const newProject = projectResult.rows[0];
      await client.query(
        `INSERT INTO calendars (
          project_id,
          monday,
          tuesday,
          wednesday,
          thursday,
          friday,
          saturday,
          sunday
        )
         VALUES ($1, true, true, true, true, true, true, false)`,
        [newProject.id]
      );

      await client.query(
        `INSERT INTO project_members (project_id, user_id, role) 
         VALUES ($1, $2, $3)`,
        [newProject.id, req.session.user.id, ROLES.BAN_QUAN_LY]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Tạo dự án thành công",
        project: newProject
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

// DELETE /api/projects/:projectId - Xóa dự án
router.delete(
  "/:projectId",
  requireSystemAdmin,
  createAuditMiddleware('DELETE_PROJECT', 'projects'),
  async (req, res, next) => {
    const { projectId } = req.params;
    
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      
      const project = await client.query("SELECT id FROM projects WHERE id = $1", [projectId]);
      if (project.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Dự án không tồn tại" });
      }

      await client.query("DELETE FROM projects WHERE id = $1", [projectId]);
      
      await client.query("COMMIT");
      return res.json({ message: "Đã xoá dự án thành công" });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

// PUT /api/projects/:projectId - Cập nhật dự án
router.put(
  "/:projectId",
  requireSystemAdmin,
  createAuditMiddleware('UPDATE_PROJECT', 'projects'),
  async (req, res, next) => {
    const { 
      name, code, location, start_date, sprint_length_weeks, status,
      province, project_type, stage, description, cover_image_url, expected_completion_date, is_public
    } = req.body;
    
    if (!name || name.length > 255) {
      return res.status(400).json({ message: "Tên dự án là bắt buộc và không quá 255 ký tự" });
    }
    if (!code) {
      return res.status(400).json({ message: "Mã dự án là bắt buộc" });
    }

    const normalized_search_text = removeAccents(`${name} ${province || ''} ${project_type || ''}`).toLowerCase();

    try {
      // Check unique code (excluding current project)
      const exist = await db.query("SELECT id FROM projects WHERE code = $1 AND id != $2", [code, req.params.projectId]);
      if (exist.rows.length > 0) {
        return res.status(400).json({ message: "Mã dự án đã tồn tại" });
      }

      const result = await db.query(
        `UPDATE projects SET 
          name = $1, code = $2, location = $3, start_date = $4, sprint_length_weeks = $5, status = $6,
          province = $7, project_type = $8, stage = $9, description = $10, cover_image_url = $11, expected_completion_date = $12, is_public = $13, normalized_search_text = $14,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $15 RETURNING *`,
        [
          name, code, location || null, start_date || null, sprint_length_weeks || 1, status || 'Chuẩn bị',
          province || null, project_type || null, stage || null, description || null, cover_image_url || null, expected_completion_date || null, is_public || false, normalized_search_text,
          req.params.projectId
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy dự án" });
      }

      return res.json({
        message: "Cập nhật dự án thành công",
        project: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);


const { getScheduleResults, getPlannedFinish } = require("../services/scheduleQuery");
const { workingDayDiff, formatDate } = require("../algorithms/workingDays");

/**
 * @swagger
 * /api/projects/{projectId}/schedule-results:
 *   get:
 *     summary: Lấy kết quả tính toán tiến độ dự án
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: critical
 *         schema:
 *           type: boolean
 *         description: Lọc theo cờ găng (true/false)
 *     responses:
 *       200:
 *         description: Thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projectId:
 *                   type: integer
 *                 count:
 *                   type: integer
 *                 summary:
 *                   type: object
 *                   properties:
 *                     currentFinish:
 *                       type: string
 *                     plannedFinish:
 *                       type: string
 *                     delayWorkingDays:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       enum: [on_track, late, early]
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       newly_critical:
 *                         type: boolean
 *                       planned_early_finish:
 *                         type: string
 */
// GET /api/projects/:projectId/schedule-results
router.get(
  "/:projectId/schedule-results",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);

      if (!Number.isInteger(projectId) || projectId <= 0) {
        return res.status(400).json({
          message: "projectId không hợp lệ",
        });
      }

      let criticalOnly = null;

      if (req.query.critical !== undefined) {
        if (
          req.query.critical !== "true" &&
          req.query.critical !== "false"
        ) {
          return res.status(400).json({
            message: "critical phải là true hoặc false",
          });
        }

        criticalOnly = req.query.critical === "true";
      }

      const results = await getScheduleResults(
        projectId,
        criticalOnly
      );

      const plannedFinishRaw = await getPlannedFinish(projectId);
      const currentFinishRes = await db.query(`
        SELECT MAX(sr.early_finish) as max_finish 
        FROM schedule_results sr 
        JOIN tasks t ON t.id = sr.task_id 
        JOIN work_items wi ON wi.id = t.work_item_id 
        WHERE wi.project_id = $1
      `, [projectId]);
      const currentFinishRaw = currentFinishRes.rows[0]?.max_finish;

      let delayWorkingDays = 0;
      let status = "on_track";

      if (plannedFinishRaw && currentFinishRaw) {
        const calRes = await db.query("SELECT * FROM calendars WHERE project_id = $1", [projectId]);
        const holRes = await db.query("SELECT holiday_date FROM holidays WHERE project_id = $1", [projectId]);
        const calendar = calRes.rows[0];
        const holidays = holRes.rows.map(r => r.holiday_date);
        
        delayWorkingDays = workingDayDiff(plannedFinishRaw, currentFinishRaw, calendar, holidays);
        if (delayWorkingDays > 0) status = "late";
        else if (delayWorkingDays < 0) status = "early";
      }

      return res.json({
        projectId,
        count: results.length,
        data: results,
        summary: {
          currentFinish: currentFinishRaw ? formatDate(currentFinishRaw) : null,
          plannedFinish: plannedFinishRaw ? formatDate(plannedFinishRaw) : null,
          delayWorkingDays,
          status
        }
      });
    } catch (error) {
      next(error);
    }
  }
);


// GET /api/projects/:projectId
router.get(
  "/:projectId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT id, name, location, start_date, created_at, updated_at
         FROM projects
         WHERE id = $1`,
        [req.params.projectId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Không tìm thấy dự án",
        });
      }

      return res.json({
        project: result.rows[0],
        membership: req.projectRole,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/open
router.post(
  "/:projectId/open",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      await db.query(
        `UPDATE project_members 
         SET last_opened_at = CURRENT_TIMESTAMP 
         WHERE project_id = $1 AND user_id = $2`,
        [req.params.projectId, req.session.user.id]
      );

      return res.json({
        message: "Opened successfully",
        role: req.projectRole,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:projectId/members
router.get(
  "/:projectId/members",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT u.id, u.name, u.email, pm.role,
                u.failed_login_attempts,
                u.locked_until
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
         WHERE pm.project_id = $1
         ORDER BY pm.created_at ASC`,
        [req.params.projectId]
      );

      const invResult = await db.query(
        `SELECT i.id, i.email, i.project_role as role, i.created_at, e.status as email_status,
                (i.expires_at <= CURRENT_TIMESTAMP) as is_expired
         FROM invitations i
         LEFT JOIN (
           SELECT invitation_id, status, ROW_NUMBER() OVER(PARTITION BY invitation_id ORDER BY id DESC) as rn
           FROM email_logs
         ) e ON i.id = e.invitation_id AND e.rn = 1
         WHERE i.project_id = $1 AND i.used_at IS NULL
         ORDER BY i.created_at DESC`,
        [req.params.projectId]
      );

      return res.json({
        members: result.rows,
        invitations: invResult.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/members
router.post(
  "/:projectId/members",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU]),
  createAuditMiddleware('ADD_PROJECT_MEMBER', 'project_members'),
  async (req, res, next) => {
    const { email, role } = req.body;
    
    if (!email || !role) {
      return res.status(400).json({ message: "Vui lòng cung cấp email và vai trò" });
    }
    
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ message: "Vai trò không hợp lệ" });
    }

    try {
      // 1. Tìm user theo email
      const userResult = await db.query("SELECT id, name FROM users WHERE email = $1", [email]);
      
      if (userResult.rows.length === 0) {
        // User does not exist in the system. Create an invitation instead.
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        const client = await db.connect();
        try {
          await client.query("BEGIN");
          const invRes = await client.query(
            `INSERT INTO invitations (email, token_hash, invited_by, expires_at, project_id, project_role) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [email, tokenHash, req.session.user.id, expiresAt, req.params.projectId, role]
          );
          
          await createEmailLog(client, invRes.rows[0].id, email);
          await client.query("COMMIT");

          // Bất đồng bộ gửi email
          const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
          const emailData = emailTemplates.renderProjectInvite({ inviterName: req.session.user.name || 'Người quản lý', projectName: 'Dự án', role, token, isNewUser: true, baseUrl });
          processEmailLogs({
            id: invRes.rows[0].id,
            email,
            ...emailData
          }).catch(e => console.error(e));

        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }
        
        return res.status(201).json({ message: "Người dùng chưa có tài khoản. Đã gửi thư mời tham gia hệ thống và dự án." });
      }
      
      const userId = userResult.rows[0].id;

      // 2. Kiểm tra xem user đã trong dự án chưa
      const exist = await db.query(
        "SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2",
        [req.params.projectId, userId]
      );

      if (exist.rows.length > 0) {
        // Cập nhật role
        await db.query(
          "UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3",
          [role, req.params.projectId, userId]
        );
        return res.json({ message: "Đã cập nhật vai trò của thành viên" });
      }

      // 3. Thêm vào dự án
      await db.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)",
        [req.params.projectId, userId, role]
      );

      return res.status(201).json({ message: "Đã thêm thành viên vào dự án" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/members/:userId/unlock - Mở khóa tài khoản thành viên
router.post(
  "/:projectId/members/:userId/unlock",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU]),
  async (req, res, next) => {
    try {
      // Kiểm tra user có trong dự án này không
      const member = await db.query(
        "SELECT u.id, u.email, u.failed_login_attempts, u.locked_until FROM users u JOIN project_members pm ON u.id = pm.user_id WHERE pm.project_id = $1 AND u.id = $2",
        [req.params.projectId, req.params.userId]
      );

      if (member.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy thành viên này trong dự án" });
      }

      await db.query(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1",
        [req.params.userId]
      );

      return res.json({ message: "Đã mở khóa và reset số lần đăng nhập sai về 0" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/invitations/:invId/resend
router.post(
  "/:projectId/invitations/:invId/resend",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.CHI_HUY_TRUONG, ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY]),
  async (req, res, next) => {
    try {
      const { projectId, invId } = req.params;
      
      const invCheck = await db.query(
        'SELECT email, project_role as role FROM invitations WHERE id = $1 AND project_id = $2 AND used_at IS NULL',
        [invId, projectId]
      );

      if (invCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Không tìm thấy thư mời hoặc thư mời đã được sử dụng' });
      }

      const { email, role } = invCheck.rows[0];
      const crypto = require("crypto");
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const client = await db.connect();
      try {
        await client.query("BEGIN");
        
        await client.query(
          "UPDATE invitations SET token_hash = $1, expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days' WHERE id = $2",
          [tokenHash, invId]
        );
        
        await createEmailLog(client, invId, email);
        await client.query("COMMIT");

        const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
        const emailData = emailTemplates.renderProjectInvite({ inviterName: req.session.user.name || 'Người quản lý', projectName: 'Dự án', role, token, isNewUser: true, baseUrl });
        processEmailLogs({
          id: invId,
          email,
          ...emailData
        }).catch(err => logger.error({ err }, 'Error in async email resend'));

        return res.json({ message: 'Đã gửi lại thư mời thành công' });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  }
);



// POST /api/projects/:projectId/schedule/recalculate
router.post(
  "/:projectId/schedule/recalculate",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);

      if (!Number.isInteger(projectId) || projectId <= 0) {
        return res.status(400).json({
          message: "projectId không hợp lệ",
        });
      }

      // Check running jobs
      const runningJobRes = await db.query(
        `SELECT id FROM schedule_jobs WHERE project_id = $1 AND status IN ('queued', 'running') LIMIT 1`,
        [projectId]
      );
      if (runningJobRes.rows.length > 0) {
        return res.status(202).json({
          message: "Đã có tác vụ tính toán đang chạy",
          jobId: runningJobRes.rows[0].id
        });
      }

      const taskCountRes = await db.query(
        `SELECT COUNT(*) FROM tasks t JOIN work_items wi ON wi.id = t.work_item_id WHERE wi.project_id = $1`,
        [projectId]
      );
      const taskCount = Number(taskCountRes.rows[0].count);

      if (taskCount > 200) {
        // Lấy version dự định
        const versionRes = await db.query(`SELECT schedule_version FROM projects WHERE id = $1`, [projectId]);
        const expectedVersion = versionRes.rows[0]?.schedule_version;

        const insertJobRes = await db.query(
          `INSERT INTO schedule_jobs (project_id, status) VALUES ($1, 'queued') RETURNING id`,
          [projectId]
        );
        const jobId = insertJobRes.rows[0].id;
        
        // Chạy nền
        runScheduleJobAsync(jobId, projectId, null, expectedVersion).catch(e => console.error("Background job error:", e));

        return res.status(202).json({
          message: "Tác vụ tính toán tiến độ đang chạy ngầm",
          jobId
        });
      }

      const result = await calculateAndSaveSchedule(projectId);

      return res.json({
        message: "Đã tính và lưu kết quả lịch",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:projectId/schedule-jobs/:jobId
router.get(
  "/:projectId/schedule-jobs/:jobId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);
      const { jobId } = req.params;

      const jobRes = await db.query(
        `SELECT id, status, error_details FROM schedule_jobs WHERE id = $1 AND project_id = $2`,
        [jobId, projectId]
      );

      if (jobRes.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy job" });
      }

      return res.json({
        job: jobRes.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:projectId/calendar
router.get(
  "/:projectId/calendar",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);
      let result = await db.query(
        `SELECT id, project_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, created_at, updated_at
         FROM calendars
         WHERE project_id = $1`,
        [projectId]
      );

      if (result.rows.length === 0) {
        // Create default calendar if missing
        const insertRes = await db.query(
          `INSERT INTO calendars (project_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
           VALUES ($1, true, true, true, true, true, true, false)
           ON CONFLICT (project_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
           RETURNING id, project_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, created_at, updated_at`,
          [projectId]
        );
        return res.json({ calendar: insertRes.rows[0] });
      }

      return res.json({ calendar: result.rows[0] });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/projects/:projectId/calendar
router.put(
  "/:projectId/calendar",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU, ROLES.CHI_HUY_TRUONG]),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const { monday, tuesday, wednesday, thursday, friday, saturday, sunday } = req.body;

    const days = {
      monday: monday === undefined ? true : Boolean(monday),
      tuesday: tuesday === undefined ? true : Boolean(tuesday),
      wednesday: wednesday === undefined ? true : Boolean(wednesday),
      thursday: thursday === undefined ? true : Boolean(thursday),
      friday: friday === undefined ? true : Boolean(friday),
      saturday: saturday === undefined ? true : Boolean(saturday),
      sunday: sunday === undefined ? false : Boolean(sunday),
    };

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO calendars (project_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
         ON CONFLICT (project_id) DO UPDATE SET
           monday = EXCLUDED.monday,
           tuesday = EXCLUDED.tuesday,
           wednesday = EXCLUDED.wednesday,
           thursday = EXCLUDED.thursday,
           friday = EXCLUDED.friday,
           saturday = EXCLUDED.saturday,
           sunday = EXCLUDED.sunday,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          projectId,
          days.monday,
          days.tuesday,
          days.wednesday,
          days.thursday,
          days.friday,
          days.saturday,
          days.sunday,
        ]
      );

      // Đổi lịch thì đánh dấu cần tính lại như T-26
      await markProjectScheduleDirty(projectId, client);

      await client.query("COMMIT");

      return res.json({
        message: "Cập nhật lịch làm việc thành công",
        calendar: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

// GET /api/projects/:projectId/holidays
router.get(
  "/:projectId/holidays",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);
      const result = await db.query(
        `SELECT id, project_id, holiday_date, name, created_at, updated_at
         FROM holidays
         WHERE project_id = $1
         ORDER BY holiday_date ASC, id ASC`,
        [projectId]
      );

      return res.json({
        holidays: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/holidays
router.post(
  "/:projectId/holidays",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU, ROLES.CHI_HUY_TRUONG]),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const { holiday_date, name } = req.body;

    if (!holiday_date || typeof holiday_date !== "string" || !holiday_date.trim()) {
      return res.status(400).json({ message: "Ngày nghỉ (holiday_date) là bắt buộc" });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Tên ngày nghỉ là bắt buộc" });
    }

    const dateMatch = holiday_date.trim().match(/^\d{4}-\d{2}-\d{2}$/);
    if (!dateMatch) {
      return res.status(400).json({ message: "Ngày nghỉ không đúng định dạng YYYY-MM-DD" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Check unique (project_id, holiday_date)
      const exist = await client.query(
        `SELECT id FROM holidays WHERE project_id = $1 AND holiday_date = $2`,
        [projectId, holiday_date.trim()]
      );

      if (exist.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Ngày nghỉ này đã tồn tại trong dự án" });
      }

      const result = await client.query(
        `INSERT INTO holidays (project_id, holiday_date, name)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [projectId, holiday_date.trim(), name.trim()]
      );

      // Đánh dấu cần tính lại như T-26
      await markProjectScheduleDirty(projectId, client);

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Thêm ngày nghỉ thành công",
        holiday: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        return res.status(400).json({ message: "Ngày nghỉ này đã tồn tại trong dự án" });
      }
      next(error);
    } finally {
      client.release();
    }
  }
);

// DELETE /api/projects/:projectId/holidays/:holidayId
router.delete(
  "/:projectId/holidays/:holidayId",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU, ROLES.CHI_HUY_TRUONG]),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const holidayId = Number(req.params.holidayId);

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const exist = await client.query(
        `SELECT id FROM holidays WHERE id = $1 AND project_id = $2`,
        [holidayId, projectId]
      );

      if (exist.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy ngày nghỉ" });
      }

      await client.query(
        `DELETE FROM holidays WHERE id = $1 AND project_id = $2`,
        [holidayId, projectId]
      );

      // Đánh dấu cần tính lại như T-26
      await markProjectScheduleDirty(projectId, client);

      await client.query("COMMIT");

      return res.json({ message: "Đã xoá ngày nghỉ thành công" });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

// PUT /api/projects/:projectId/holidays/:holidayId
router.put(
  "/:projectId/holidays/:holidayId",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU, ROLES.CHI_HUY_TRUONG]),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const holidayId = Number(req.params.holidayId);
    const { holiday_date, name } = req.body;

    if (!holiday_date || !name) {
      return res.status(400).json({ message: "Ngày nghỉ và tên ngày nghỉ là bắt buộc" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const exist = await client.query(
        `SELECT id FROM holidays WHERE id = $1 AND project_id = $2`,
        [holidayId, projectId]
      );

      if (exist.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy ngày nghỉ" });
      }

      const dup = await client.query(
        `SELECT id FROM holidays WHERE project_id = $1 AND holiday_date = $2 AND id != $3`,
        [projectId, holiday_date.trim(), holidayId]
      );

      if (dup.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Ngày nghỉ này đã tồn tại trong dự án" });
      }

      const result = await client.query(
        `UPDATE holidays
         SET holiday_date = $1, name = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND project_id = $4
         RETURNING *`,
        [holiday_date.trim(), name.trim(), holidayId, projectId]
      );

      await markProjectScheduleDirty(projectId, client);

      await client.query("COMMIT");

      return res.json({
        message: "Cập nhật ngày nghỉ thành công",
        holiday: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        return res.status(400).json({ message: "Ngày nghỉ này đã tồn tại trong dự án" });
      }
      next(error);
    } finally {
      client.release();
    }
  }
);

module.exports = router;