
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, allow, createProjectRouter } = require('../middleware/projectAccess');
const { ROLES } = require('../utils/constants');

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

// POST /api/projects - Tạo dự án mới
router.post(
  "/",
  requireAuth,
  async (req, res, next) => {
    // Chỉ ban_quan_ly mới được tạo dự án
    if (req.session.user.role !== ROLES.BAN_QUAN_LY) {
      return res.status(403).json({ message: "Chỉ Ban quản lý mới được quyền tạo dự án" });
    }

    const { name, code, location, start_date, sprint_length_weeks } = req.body;
    
    if (!name || name.length > 255) {
      return res.status(400).json({ message: "Tên dự án là bắt buộc và không quá 255 ký tự" });
    }
    if (!code) {
      return res.status(400).json({ message: "Mã dự án là bắt buộc" });
    }

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
        `INSERT INTO projects (name, code, location, start_date, sprint_length_weeks, status, actual_progress, planned_progress) 
         VALUES ($1, $2, $3, $4, $5, 'Chuẩn bị', 0, 0) RETURNING *`,
        [name, code, location || null, start_date || null, sprint_length_weeks || 1]
      );
      const newProject = projectResult.rows[0];

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

// Fallback default deny replaced by createProjectRouter

module.exports = router;