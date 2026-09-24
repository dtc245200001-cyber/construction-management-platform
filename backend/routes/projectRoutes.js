const express = require("express");
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess } = require('../middleware/projectAccess');

const router = express.Router();

// GET /api/projects - Danh sách dự án mà user tham gia
router.get(
  "/",
  requireAuth,
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT p.id, p.name, p.location, p.start_date, p.created_at, p.updated_at, pm.role 
         FROM projects p 
         JOIN project_members pm ON p.id = pm.project_id 
         WHERE pm.user_id = $1 
         ORDER BY p.created_at DESC`,
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
    if (req.session.user.role !== 'ban_quan_ly') {
      return res.status(403).json({ message: "Chỉ Ban quản lý mới được quyền tạo dự án" });
    }

    const { name, location, start_date } = req.body;
    
    if (!name || name.length > 255) {
      return res.status(400).json({ message: "Tên dự án là bắt buộc và không quá 255 ký tự" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      
      const projectResult = await client.query(
        `INSERT INTO projects (name, location, start_date) 
         VALUES ($1, $2, $3) RETURNING id, name, location, start_date, created_at, updated_at`,
        [name, location || null, start_date || null]
      );
      const newProject = projectResult.rows[0];

      await client.query(
        `INSERT INTO project_members (project_id, user_id, role) 
         VALUES ($1, $2, 'OWNER')`,
        [newProject.id, req.session.user.id]
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

module.exports = router;