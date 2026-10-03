"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  allow,
  createProjectRouter,
} = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt, normalizeName } = require("../utils/validators");
const { ROLES } = require("../utils/constants");

const router = createProjectRouter();

// POST /api/projects/:projectId/tasks
// Tạo công việc trong một hạng mục
router.post(
  "/:projectId/tasks",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const workItemId = parsePositiveInt(req.body.work_item_id);
    const name = normalizeName(req.body.name);
    const durationDays = Number(req.body.duration_days);

    if (!projectId) {
      return res.status(400).json({
        message: "projectId không hợp lệ",
      });
    }

    if (!workItemId) {
      return res.status(400).json({
        message: "Hạng mục không hợp lệ",
      });
    }

    if (!name) {
      return res.status(400).json({
        message: "Tên công việc là bắt buộc và không được vượt quá 255 ký tự",
      });
    }

    // T-12: thời lượng phải là số nguyên dương
    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      return res.status(400).json({
        message: "Thời lượng phải là số nguyên lớn hơn 0",
      });
    }

    // Không cho dùng work_item của project khác
    const workItem = await db.query(
      `SELECT id
       FROM work_items
       WHERE id = $1 AND project_id = $2`,
      [workItemId, projectId]
    );

    if (workItem.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy hạng mục trong dự án",
      });
    }

    const result = await db.query(
      `INSERT INTO tasks (work_item_id, name, duration_days)
       VALUES ($1, $2, $3)
       RETURNING id, work_item_id, name, duration_days, created_at, updated_at`,
      [workItemId, name, durationDays]
    );

    return res.status(201).json(result.rows[0]);
  })
);

// PATCH /api/projects/:projectId/tasks/:taskId
// Sửa công việc
router.patch(
  "/:projectId/tasks/:taskId",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const taskId = parsePositiveInt(req.params.taskId);
    const name = normalizeName(req.body.name);
    const durationDays = Number(req.body.duration_days);

    if (!projectId) {
      return res.status(400).json({
        message: "projectId không hợp lệ",
      });
    }

    if (!taskId) {
      return res.status(400).json({
        message: "taskId không hợp lệ",
      });
    }

    if (!name) {
      return res.status(400).json({
        message: "Tên công việc là bắt buộc và không được vượt quá 255 ký tự",
      });
    }

    // T-12: chặn 0, số âm, số thập phân và dữ liệu không phải số
    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      return res.status(400).json({
        message: "Thời lượng phải là số nguyên lớn hơn 0",
      });
    }

    // JOIN work_items để đảm bảo task thuộc đúng project
    const result = await db.query(
      `UPDATE tasks t
       SET name = $1,
           duration_days = $2,
           updated_at = CURRENT_TIMESTAMP
       FROM work_items w
       WHERE t.id = $3
         AND t.work_item_id = w.id
         AND w.project_id = $4
       RETURNING
         t.id,
         t.work_item_id,
         t.name,
         t.duration_days,
         t.created_at,
         t.updated_at`,
      [name, durationDays, taskId, projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy công việc trong dự án",
      });
    }

    return res.json(result.rows[0]);
  })
);

module.exports = router;