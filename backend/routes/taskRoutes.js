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
const {
  markProjectScheduleDirty,
} = require("../services/scheduleRecalculation");

const router = createProjectRouter();

// ======================================================
// POST /api/projects/:projectId/tasks
// Tạo công việc trong một hạng mục
// ======================================================
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
        message:
          "Tên công việc là bắt buộc và không được vượt quá 255 ký tự",
      });
    }

    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      return res.status(400).json({
        message: "Thời lượng phải là số nguyên lớn hơn 0",
      });
    }

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
       RETURNING
         id,
         work_item_id,
         name,
         duration_days,
         created_at,
         updated_at`,
      [workItemId, name, durationDays]
    );

    return res.status(201).json(result.rows[0]);
  })
);

// ======================================================
// PATCH /api/projects/:projectId/tasks/:taskId
// Sửa tên và thời lượng công việc
// ======================================================
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
        message:
          "Tên công việc là bắt buộc và không được vượt quá 255 ký tự",
      });
    }

    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      return res.status(400).json({
        message: "Thời lượng phải là số nguyên lớn hơn 0",
      });
    }

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

// ======================================================
// PUT /api/projects/:projectId/tasks/:taskId
// Cập nhật duration và đánh dấu lịch cần tính lại
// Code từ main
// ======================================================
router.put(
  "/:projectId/tasks/:taskId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const taskId = Number(req.params.taskId);
    const durationDays = Number(req.body.duration_days);

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({
        message: "projectId không hợp lệ",
      });
    }

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({
        message: "taskId không hợp lệ",
      });
    }

    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      return res.status(400).json({
        message: "duration_days phải là số nguyên dương",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const taskResult = await client.query(
        `
          SELECT
            t.id,
            t.work_item_id,
            t.name,
            t.duration_days
          FROM tasks t
          JOIN work_items wi
            ON wi.id = t.work_item_id
          WHERE t.id = $1
            AND wi.project_id = $2
          FOR UPDATE
        `,
        [taskId, projectId]
      );

      if (taskResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Không tìm thấy task trong project",
        });
      }

      const oldDuration = taskResult.rows[0].duration_days;

      const updateResult = await client.query(
        `
          UPDATE tasks
          SET duration_days = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING
            id,
            work_item_id,
            name,
            duration_days,
            updated_at
        `,
        [durationDays, taskId]
      );

      if (oldDuration !== durationDays) {
        await markProjectScheduleDirty(projectId, client);
      }

      await client.query("COMMIT");

      return res.json({
        message:
          oldDuration !== durationDays
            ? "Cập nhật thời lượng và đánh dấu cần tính lại lịch"
            : "Thời lượng không thay đổi",
        task: updateResult.rows[0],
        scheduleNeedsRecalculation: oldDuration !== durationDays,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

module.exports = router;