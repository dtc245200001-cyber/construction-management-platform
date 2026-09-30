// routes/categoryRoutes.js — Quản lý hạng mục công việc (work_items) theo dự án.
//
// Mọi route đều yêu cầu:
//   1. Xác thực session (requireAuth).
//   2. Là thành viên dự án (checkProjectAccess).
//   3. Có vai trò phù hợp (requireProjectRoles).

"use strict";

const express = require("express");
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, allow, createProjectRouter } = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt, normalizeName } = require("../utils/validators");
const { ROLES } = require("../utils/constants");

const router = createProjectRouter();

// ─── GET /:projectId — Lấy danh sách hạng mục theo parentId ─────────────────
router.get(
  "/:projectId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const parentId = req.query.parentId != null
      ? parsePositiveInt(req.query.parentId)
      : undefined;

    // parentId được truyền vào query string nhưng không phải số hợp lệ
    if (req.query.parentId != null && parentId === null) {
      return res.status(400).json({ message: "parentId không hợp lệ" });
    }

    let queryStr = `
      SELECT w.id, w.name, w.parent_id,
             EXISTS(SELECT 1 FROM work_items c WHERE c.parent_id = w.id) AS "hasChildren"
      FROM work_items w
      WHERE w.project_id = $1
    `;
    const queryParams = [projectId];

    if (parentId != null) {
      queryStr += ` AND w.parent_id = $2 ORDER BY w.id ASC`;
      queryParams.push(parentId);
    } else {
      queryStr += ` AND w.parent_id IS NULL ORDER BY w.id ASC`;
    }

    const result = await db.query(queryStr, queryParams);
    return res.json(result.rows);
  })
);

// ─── GET /:projectId/tree/all — Toàn bộ hạng mục dạng phẳng (một query) ─────
//
// Frontend dùng endpoint này để dựng cây trong bộ nhớ, đáp ứng NFR "< 2 giây"
// với 500 hạng mục (payload nhỏ, một query duy nhất, không lazy-load).
router.get(
  "/:projectId/tree/all",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const result = await db.query(
      `SELECT id, name, parent_id, code
       FROM work_items
       WHERE project_id = $1
       ORDER BY id ASC`,
      [projectId]
    );

    return res.json(result.rows);
  })
);

// ─── POST /:projectId — Thêm hạng mục ────────────────────────────────────────
router.post(
  "/:projectId",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const name = normalizeName(req.body.name);
    if (!name) {
      return res.status(400).json({ message: "Tên hạng mục là bắt buộc và không được vượt quá 255 ký tự" });
    }

    const parentIdRaw = req.body.parent_id;
    let parentId = null;

    if (parentIdRaw != null && parentIdRaw !== "") {
      parentId = parsePositiveInt(parentIdRaw);
      if (!parentId) {
        return res.status(400).json({ message: "parent_id không hợp lệ" });
      }
    }

    // Chèn trong transaction để tránh race condition khi cha bị xóa giữa chừng
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Ràng buộc bảo mật: parent_id phải thuộc cùng project_id
      // TODO(T-10): kiểm tra chu trình khi đổi cha
      if (parentId) {
        const parentCheck = await client.query(
          `SELECT id FROM work_items WHERE id = $1 AND project_id = $2`,
          [parentId, projectId]
        );
        if (parentCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Hạng mục cha không thuộc dự án này" });
        }
      }

      const result = await client.query(
        `INSERT INTO work_items (project_id, parent_id, name)
         VALUES ($1, $2, $3)
         RETURNING id, name, parent_id`,
        [projectId, parentId, name]
      );

      await client.query("COMMIT");

      const newItem = result.rows[0];
      newItem.hasChildren = false;
      return res.status(201).json(newItem);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── PUT /:projectId/:id — Sửa hạng mục ──────────────────────────────────────
router.put(
  "/:projectId/:id",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const id = parsePositiveInt(req.params.id);

    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
    if (!id) return res.status(400).json({ message: "id không hợp lệ" });

    const name = normalizeName(req.body.name);
    if (!name) {
      return res.status(400).json({ message: "Tên hạng mục là bắt buộc và không được vượt quá 255 ký tự" });
    }

    const result = await db.query(
      `UPDATE work_items SET name = $1, updated_at = NOW()
       WHERE id = $2 AND project_id = $3
       RETURNING id, name, parent_id`,
      [name, id, projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy hạng mục" });
    }

    return res.json(result.rows[0]);
  })
);

// ─── PATCH /:projectId/:id/move — Đổi hạng mục cha ───────────────────────────
router.patch(
  "/:projectId/:id/move",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const id = parsePositiveInt(req.params.id);

    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
    if (!id) return res.status(400).json({ message: "id không hợp lệ" });

    const parentIdRaw = req.body.parent_id;
    let parentId = null;

    if (parentIdRaw != null && parentIdRaw !== "") {
      parentId = parsePositiveInt(parentIdRaw);
      if (!parentId) {
        return res.status(400).json({ message: "parent_id không hợp lệ" });
      }
    }

    const { getDescendantIds } = require("../queries/workItemTree");
    const client = await db.connect();
    
    try {
      await client.query("BEGIN");
      
      // Lock toàn bộ thao tác di chuyển của project để chống deadlock/vòng lặp (T-10)
      await client.query("SELECT pg_advisory_xact_lock($1)", [projectId]);

      const currentItem = await client.query(
        `SELECT id, name FROM work_items WHERE id = $1 AND project_id = $2 FOR UPDATE`,
        [id, projectId]
      );
      if (currentItem.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy hạng mục" });
      }

      if (parentId === id) {
        await client.query("ROLLBACK");
        return res.status(422).json({ message: `Không thể chọn hạng mục "${currentItem.rows[0].name}" làm cha của chính nó` });
      }

      if (parentId) {
        const parentCheck = await client.query(
          `SELECT id, name FROM work_items WHERE id = $1 AND project_id = $2 FOR UPDATE`,
          [parentId, projectId]
        );
        if (parentCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Hạng mục cha không thuộc dự án này" });
        }

        const descendants = await getDescendantIds(client, id, projectId);
        if (descendants.includes(parentId)) {
          await client.query("ROLLBACK");
          const parentName = parentCheck.rows[0].name;
          return res.status(422).json({ 
            message: `Không thể chuyển vào hạng mục "${parentName}" vì nó là hậu duệ của hạng mục hiện tại` 
          });
        }
      }

      const result = await client.query(
        `UPDATE work_items SET parent_id = $1, updated_at = NOW() WHERE id = $2 AND project_id = $3 RETURNING id, name, parent_id`,
        [parentId, id, projectId]
      );

      await client.query("COMMIT");
      return res.json(result.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── DELETE /:projectId/:id — Xóa hạng mục ───────────────────────────────────
router.delete(
  "/:projectId/:id",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const id = parsePositiveInt(req.params.id);

    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
    if (!id) return res.status(400).json({ message: "id không hợp lệ" });

    const { countTasksInSubtree } = require("../queries/workItemTree");
    const taskCount = await countTasksInSubtree(db, id, projectId);
    
    if (taskCount > 0) {
      // fix(S-03): lọc theo project_id để không rò rỉ tên hạng mục của dự án khác
      const item = await db.query(
        `SELECT name FROM work_items WHERE id = $1 AND project_id = $2`,
        [id, projectId]
      );
      const itemName = item.rows[0] ? item.rows[0].name : "Hạng mục";
      return res.status(409).json({ message: `Không thể xóa hạng mục "${itemName}" vì đang có ${taskCount} công việc bên trong.` });
    }

    try {
      const result = await db.query(
        `DELETE FROM work_items WHERE id = $1 AND project_id = $2 RETURNING id`,
        [id, projectId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy hạng mục" });
      }

      return res.json({ success: true });
    } catch (err) {
      if (err.code === "23503") {
        const item = await db.query(`SELECT name FROM work_items WHERE id = $1`, [id]);
        const itemName = item.rows[0] ? item.rows[0].name : "Hạng mục";
        return res.status(409).json({ message: `Không thể xóa hạng mục "${itemName}" vì đang chứa các hạng mục con.` });
      }
      throw err;
    }
  })
);

// Fallback default deny replaced by createProjectRouter

module.exports = router;