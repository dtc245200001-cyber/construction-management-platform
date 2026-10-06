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
    const schedulingMode = req.body.scheduling_mode === 'manual' ? 'manual' : 'auto';
    const manualStartDate = req.body.manual_start_date || null;

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
          INSERT INTO tasks (work_item_id, name, duration_days, scheduling_mode, manual_start_date)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, work_item_id, name, duration_days, scheduling_mode, manual_start_date, created_at, updated_at
        `,
        [workItemId, name, durationDays, schedulingMode, manualStartDate]
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
    const hasSchedulingMode = req.body.scheduling_mode !== undefined;
    const hasManualStartDate = req.body.manual_start_date !== undefined;

    if (!hasDuration && !hasName && !hasSchedulingMode && !hasManualStartDate) {
      return res.status(400).json({
        message: "Cần cung cấp ít nhất 1 trường để cập nhật",
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
            t.duration_days,
            t.scheduling_mode,
            t.manual_start_date
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
      const targetSchedulingMode = hasSchedulingMode ? (req.body.scheduling_mode === 'manual' ? 'manual' : 'auto') : oldTask.scheduling_mode;
      // Handle Date comparison by converting to ISO string (format YYYY-MM-DD or full) for string comparison, but PostgreSQL returns Date objects.
      // Easiest is to just pass whatever is given. If it's a date object, we might want to compare timestamps.
      // But let's just let postgres update it and mark schedule dirty if it changes.
      const targetManualStartDate = hasManualStartDate ? (req.body.manual_start_date || null) : oldTask.manual_start_date;

      const updateResult = await client.query(
        `
          UPDATE tasks
          SET name = $1,
              duration_days = $2,
              scheduling_mode = $3,
              manual_start_date = $4,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
          RETURNING id, work_item_id, name, duration_days, scheduling_mode, manual_start_date, updated_at
        `,
        [targetName, targetDuration, targetSchedulingMode, targetManualStartDate, taskId]
      );

      // A simple equality check might fail for Date objects, but it's safe to mark it dirty anyway if they send the field.
      const durationChanged = oldTask.duration_days !== targetDuration || oldTask.scheduling_mode !== targetSchedulingMode || hasManualStartDate;
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