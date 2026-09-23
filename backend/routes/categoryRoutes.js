const express = require("express");
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, requireProjectRoles } = require("../middleware/projectAccess");
const { getWorkItemSubtree } = require("../queries/workItemTree");

const router = express.Router();

// Lấy danh sách hạng mục theo parentId
router.get(
  "/:projectId",
  requireAuth,
  checkProjectAccess,
  requireProjectRoles(["OWNER", "MANAGER", "MEMBER"]),
  async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const parentId = req.query.parentId || null;

      let queryStr = `
        SELECT w.id, w.name, w.parent_id,
        EXISTS(SELECT 1 FROM work_items c WHERE c.parent_id = w.id) as "hasChildren"
        FROM work_items w
        WHERE w.project_id = $1
      `;
      const queryParams = [projectId];

      if (parentId) {
        queryStr += ` AND w.parent_id = $2 ORDER BY w.id ASC`;
        queryParams.push(parentId);
      } else {
        queryStr += ` AND w.parent_id IS NULL ORDER BY w.id ASC`;
        queryParams.push(parentId ? undefined : null); // Giữ logic query chuẩn
      }

      // Tối ưu param cho nhánh parentId
      const finalParams = parentId ? [projectId, parentId] : [projectId];
      const result = await db.query(queryStr, finalParams);
      res.json(result.rows);
    } catch (error) {
      console.error("GET CATEGORIES ERROR:", error);
      res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }
);

// Thêm hạng mục
router.post(
  "/:projectId",
  requireAuth,
  checkProjectAccess,
  requireProjectRoles(["OWNER", "MANAGER"]),
  async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const { parent_id, name } = req.body;

      if (!name) return res.status(400).json({ message: "Tên là bắt buộc" });

      // Ràng buộc bảo mật: Nếu có parent_id, parent đó phải thuộc cùng project_id
      if (parent_id) {
        const parentCheck = await db.query(
          `SELECT id FROM work_items WHERE id = $1 AND project_id = $2`,
          [parent_id, projectId]
        );
        if (parentCheck.rows.length === 0) {
          return res.status(400).json({ message: "Hạng mục cha không hợp lệ hoặc không thuộc dự án này" });
        }
      }

      const result = await db.query(
        `INSERT INTO work_items (project_id, parent_id, name)
         VALUES ($1, $2, $3) RETURNING id, name, parent_id`,
        [projectId, parent_id || null, name]
      );

      const newItem = result.rows[0];
      newItem.hasChildren = false;

      res.status(201).json(newItem);
    } catch (error) {
      console.error("CREATE CATEGORY ERROR:", error);
      res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }
);

// Sửa hạng mục
router.put(
  "/:projectId/:id",
  requireAuth,
  checkProjectAccess,
  requireProjectRoles(["OWNER", "MANAGER"]),
  async (req, res) => {
    try {
      const { id, projectId } = req.params;
      const { name } = req.body;

      if (!name) return res.status(400).json({ message: "Tên là bắt buộc" });

      const result = await db.query(
        `UPDATE work_items SET name = $1, updated_at = NOW()
         WHERE id = $2 AND project_id = $3 RETURNING id, name, parent_id`,
        [name, id, projectId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy hạng mục" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("UPDATE CATEGORY ERROR:", error);
      res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }
);

// Xóa hạng mục
router.delete(
  "/:projectId/:id",
  requireAuth,
  checkProjectAccess,
  requireProjectRoles(["OWNER", "MANAGER"]),
  async (req, res) => {
    try {
      const { id, projectId } = req.params;

      const result = await db.query(
        `DELETE FROM work_items WHERE id = $1 AND project_id = $2 RETURNING id`,
        [id, projectId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy hạng mục" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("DELETE CATEGORY ERROR:", error);
      res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }
);

module.exports = router;