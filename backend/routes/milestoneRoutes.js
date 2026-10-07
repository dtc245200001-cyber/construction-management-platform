"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, allow, createProjectRouter } = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { ROLES } = require("../utils/constants");

const router = createProjectRouter();

// GET /api/projects/:projectId/milestones
// Lấy danh sách các mốc bàn giao của dự án (đang hiệu lực)
router.get(
  "/:projectId/milestones",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const result = await db.query(
      `
        SELECT m.id, m.work_item_id, m.required_date, m.created_by, m.created_at
        FROM milestones m
        JOIN work_items w ON w.id = m.work_item_id
        WHERE w.project_id = $1 AND m.is_active = true
      `,
      [projectId]
    );

    return res.json(result.rows);
  })
);

// POST /api/projects/:projectId/work-items/:workItemId/milestones
// Đặt hoặc cập nhật mốc bàn giao bắt buộc cho hạng mục
router.post(
  "/:projectId/work-items/:workItemId/milestones",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const workItemId = parsePositiveInt(req.params.workItemId);

    if (!projectId || !workItemId) {
      return res.status(400).json({ message: "Tham số không hợp lệ" });
    }

    const { required_date } = req.body;
    if (!required_date || isNaN(new Date(required_date).getTime())) {
      return res.status(400).json({ message: "Ngày bắt buộc không hợp lệ" });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Kiểm tra hạng mục thuộc dự án
      const wiCheck = await client.query(
        "SELECT id, type FROM work_items WHERE id = $1 AND project_id = $2",
        [workItemId, projectId]
      );
      if (wiCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy hạng mục" });
      }

      // Vô hiệu hóa mốc cũ nếu có
      await client.query(
        "UPDATE milestones SET is_active = false, updated_at = NOW() WHERE work_item_id = $1 AND is_active = true",
        [workItemId]
      );

      // Thêm mốc mới
      const insertRes = await client.query(
        `
          INSERT INTO milestones (work_item_id, required_date, created_by, is_active)
          VALUES ($1, $2, $3, true)
          RETURNING id, work_item_id, required_date, created_by, created_at
        `,
        [workItemId, required_date, req.user.id]
      );

      await client.query("COMMIT");
      return res.status(201).json(insertRes.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

// DELETE /api/projects/:projectId/work-items/:workItemId/milestones
// Xóa mốc đang hiệu lực
router.delete(
  "/:projectId/work-items/:workItemId/milestones",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const workItemId = parsePositiveInt(req.params.workItemId);

    if (!projectId || !workItemId) {
      return res.status(400).json({ message: "Tham số không hợp lệ" });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const wiCheck = await client.query(
        "SELECT id FROM work_items WHERE id = $1 AND project_id = $2",
        [workItemId, projectId]
      );
      if (wiCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy hạng mục" });
      }

      await client.query(
        "UPDATE milestones SET is_active = false, updated_at = NOW() WHERE work_item_id = $1 AND is_active = true",
        [workItemId]
      );

      await client.query("COMMIT");
      return res.json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

// GET /api/projects/:projectId/warnings
router.get(
  "/:projectId/warnings",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);

    const warningsRes = await db.query(`
      SELECT 
        mw.id, mw.milestone_id, mw.work_item_id, mw.overdue_days, mw.status, mw.created_at, mw.closed_at,
        wi.name as work_item_name, m.required_date
      FROM milestone_warnings mw
      JOIN work_items wi ON wi.id = mw.work_item_id
      JOIN milestones m ON m.id = mw.milestone_id
      WHERE mw.project_id = $1
      ORDER BY mw.created_at DESC
    `, [projectId]);

    const open = warningsRes.rows.filter(w => w.status === 'open');
    const closed = warningsRes.rows.filter(w => w.status === 'closed');

    return res.json({ open, closed });
  })
);

// GET /api/projects/:projectId/warnings/:warningId/critical-path
router.get(
  "/:projectId/warnings/:warningId/critical-path",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const warningId = parsePositiveInt(req.params.warningId);

    const warningRes = await db.query(`SELECT work_item_id FROM milestone_warnings WHERE id = $1`, [warningId]);
    if (warningRes.rows.length === 0) return res.status(404).json({ message: "Warning not found" });

    const workItemId = warningRes.rows[0].work_item_id;

    const descendantsRes = await db.query(`
      WITH RECURSIVE work_item_tree AS (
        SELECT id FROM work_items WHERE id = $1
        UNION ALL
        SELECT w.id FROM work_items w
        INNER JOIN work_item_tree wt ON w.parent_id = wt.id
      )
      SELECT id FROM work_item_tree
    `, [workItemId]);
    const workItemIds = descendantsRes.rows.map(r => r.id);

    const maxTaskRes = await db.query(`
      SELECT t.id as task_id
      FROM tasks t
      JOIN schedule_results sr ON sr.task_id = t.id
      WHERE t.work_item_id = ANY($1::int[])
      ORDER BY sr.early_finish DESC
      LIMIT 1
    `, [workItemIds]);

    if (maxTaskRes.rows.length === 0) {
      return res.json([]);
    }
    const endTaskId = maxTaskRes.rows[0].task_id;

    const pathRes = await db.query(`
      WITH RECURSIVE path AS (
        SELECT t.id as task_id, t.name as task_name, sr.early_start, sr.early_finish, 1 as step
        FROM tasks t
        JOIN schedule_results sr ON sr.task_id = t.id
        WHERE t.id = $1
        
        UNION
        
        SELECT t.id, t.name, sr.early_start, sr.early_finish, p.step + 1
        FROM dependencies d
        JOIN tasks t ON t.id = d.predecessor_id
        JOIN schedule_results sr ON sr.task_id = t.id
        JOIN path p ON p.task_id = d.successor_id
        WHERE sr.is_critical = true
      )
      SELECT DISTINCT task_id, task_name, early_start, early_finish, step
      FROM path
      ORDER BY step DESC
    `, [endTaskId]);

    // Sort correctly from start to finish
    const sortedPath = pathRes.rows.sort((a, b) => b.step - a.step);

    return res.json(sortedPath);
  })
);

module.exports = router;
