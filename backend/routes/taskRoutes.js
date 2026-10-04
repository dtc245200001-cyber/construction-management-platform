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

// POST /api/projects/:projectId/tasks — Tạo công việc mới (Task T-12)
router.post(
  "/:projectId/tasks",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const workItemId = Number(req.body.work_item_id);
    const durationDays = Number(req.body.duration_days);
    const rawName = req.body.name;

    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({
        message: "projectId không hợp lệ",
      });
    }

    if (!Number.isInteger(workItemId) || workItemId <= 0) {
      return res.status(400).json({
        message: "work_item_id không hợp lệ",
      });
    }

    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name || name.length > 255) {
      return res.status(400).json({
        message: "Tên công việc là bắt buộc và không được vượt quá 255 ký tự",
      });
    }

    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      return res.status(400).json({
        message: "duration_days phải là số nguyên dương (> 0)",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Kiểm tra work_item thuộc project và xác định có hạng mục con hay không (chỉ 1 câu query, không N+1)
      const wiResult = await client.query(
        `
          SELECT
            wi.id,
            wi.name,
            EXISTS(
              SELECT 1 FROM work_items child WHERE child.parent_id = wi.id
            ) AS has_children
          FROM work_items wi
          WHERE wi.id = $1 AND wi.project_id = $2
          FOR UPDATE
        `,
        [workItemId, projectId]
      );

      if (wiResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: "Hạng mục không tồn tại trong dự án",
        });
      }

      const workItem = wiResult.rows[0];

      // NFR T-12: Không cho tạo task nếu work_item đang có work_item con. Trả 422 kèm tên hạng mục, không kèm mã khóa chính
      if (workItem.has_children) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          message: `Hạng mục "${workItem.name}" đã có hạng mục con, không thể tạo công việc trực tiếp.`,
        });
      }

      // Thêm task mới
      const insertResult = await client.query(
        `
          INSERT INTO tasks (work_item_id, name, duration_days)
          VALUES ($1, $2, $3)
          RETURNING id, work_item_id, name, duration_days, created_at, updated_at
        `,
        [workItemId, name, durationDays]
      );

      // Đánh dấu lịch cần tính toán lại
      await markProjectScheduleDirty(projectId, client);

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Tạo công việc thành công",
        task: insertResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

// PUT /api/projects/:projectId/tasks/:taskId — Chỉnh sửa công việc (tên / số ngày)
router.put(
  "/:projectId/tasks/:taskId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const taskId = Number(req.params.taskId);

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

    const hasDuration = req.body.duration_days !== undefined;
    const hasName = req.body.name !== undefined;

    if (!hasDuration && !hasName) {
      return res.status(400).json({
        message: "Cần cung cấp ít nhất name hoặc duration_days để cập nhật",
      });
    }

    let durationDays;
    if (hasDuration) {
      durationDays = Number(req.body.duration_days);
      if (!Number.isInteger(durationDays) || durationDays <= 0) {
        return res.status(400).json({
          message: "duration_days phải là số nguyên dương (> 0)",
        });
      }
    }

    let name;
    if (hasName) {
      name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name || name.length > 255) {
        return res.status(400).json({
          message: "Tên công việc là bắt buộc và không được vượt quá 255 ký tự",
        });
      }
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

      const oldTask = taskResult.rows[0];
      const targetName = hasName ? name : oldTask.name;
      const targetDuration = hasDuration ? durationDays : oldTask.duration_days;

      const updateResult = await client.query(
        `
          UPDATE tasks
          SET name = $1,
              duration_days = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING id, work_item_id, name, duration_days, updated_at
        `,
        [targetName, targetDuration, taskId]
      );

      const durationChanged = oldTask.duration_days !== targetDuration;
      if (durationChanged) {
        await markProjectScheduleDirty(projectId, client);
      }

      await client.query("COMMIT");

      return res.json({
        message: durationChanged
          ? "Cập nhật công việc và đánh dấu cần tính lại lịch"
          : "Cập nhật công việc thành công",
        task: updateResult.rows[0],
        scheduleNeedsRecalculation: durationChanged,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

// DELETE /api/projects/:projectId/tasks/:taskId — Xóa công việc
router.delete(
  "/:projectId/tasks/:taskId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    const taskId = Number(req.params.taskId);

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

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const taskResult = await client.query(
        `
          SELECT
            t.id,
            t.name
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

      // Xóa task
      await client.query("DELETE FROM tasks WHERE id = $1", [taskId]);

      // Khi xóa task, gọi markProjectScheduleDirty để lịch tiến độ tự biết cần tính lại
      await markProjectScheduleDirty(projectId, client);

      await client.query("COMMIT");

      return res.json({
        message: "Xóa công việc thành công",
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