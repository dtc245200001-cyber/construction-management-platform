"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  allow,
  createProjectRouter,
} = require("../middleware/projectAccess");

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
          RETURNING id, work_item_id, name, duration_days, scheduling_mode, manual_start_date, actual_start_date, actual_end_date, percent_complete, created_at, updated_at
        `,
        [workItemId, name, durationDays, schedulingMode, manualStartDate]
      );

      // Đánh dấu lịch cần tính toán lại
      await markProjectScheduleDirty(projectId, client);

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Tạo công việc thành công",
        task: formatTaskResponse(insertResult.rows[0]),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

function parseDateOnly(val) {
  if (val === undefined) return undefined;
  if (val === null || val === "") return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return "INVALID";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "INVALID";
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, "0");
    const day = String(val.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "INVALID";
}

function formatToYMD(val) {
  if (!val) return null;
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return val;
  }
  if (val instanceof Date) {
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, "0");
    const day = String(val.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return val;
}

function formatTaskResponse(task) {
  if (!task) return task;
  return {
    ...task,
    actual_start_date: formatToYMD(task.actual_start_date),
    actual_end_date: formatToYMD(task.actual_end_date),
  };
}

// Handler cập nhật công việc & tiến độ thực tế (T-12, T-35)
const handleUpdateTask = async (req, res, next) => {
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

  const hasDuration = req.body.duration_days !== undefined || req.body.durationDays !== undefined;
  const hasName = req.body.name !== undefined;
  const hasSchedulingMode = req.body.scheduling_mode !== undefined || req.body.schedulingMode !== undefined;
  const hasManualStartDate = req.body.manual_start_date !== undefined || req.body.manualStartDate !== undefined;
  const hasActualStartDate = req.body.actual_start_date !== undefined || req.body.actualStartDate !== undefined;
  const hasActualEndDate = req.body.actual_end_date !== undefined || req.body.actualEndDate !== undefined;
  const hasPercentComplete = req.body.percent_complete !== undefined || req.body.percentComplete !== undefined;

  if (
    !hasDuration &&
    !hasName &&
    !hasSchedulingMode &&
    !hasManualStartDate &&
    !hasActualStartDate &&
    !hasActualEndDate &&
    !hasPercentComplete
  ) {
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

  let targetPercentComplete;
  if (hasPercentComplete) {
    const rawP = req.body.percent_complete !== undefined ? req.body.percent_complete : req.body.percentComplete;
    if (rawP === null || rawP === "") {
      targetPercentComplete = 0;
    } else {
      const p = Number(rawP);
      if (!Number.isInteger(p) || p < 0 || p > 100) {
        return res.status(400).json({
          message: "Phần trăm hoàn thành phải là số nguyên trong khoảng 0 đến 100",
        });
      }
      targetPercentComplete = p;
    }
  }

  let targetActualStartDate;
  if (hasActualStartDate) {
    const parsedStart = parseDateOnly(req.body.actual_start_date !== undefined ? req.body.actual_start_date : req.body.actualStartDate);
    if (parsedStart === "INVALID") {
      return res.status(400).json({
        message: "Ngày bắt đầu thực tế không hợp lệ",
      });
    }
    targetActualStartDate = parsedStart;
  }

  let targetActualEndDate;
  if (hasActualEndDate) {
    const parsedEnd = parseDateOnly(req.body.actual_end_date !== undefined ? req.body.actual_end_date : req.body.actualEndDate);
    if (parsedEnd === "INVALID") {
      return res.status(400).json({
        message: "Ngày kết thúc thực tế không hợp lệ",
      });
    }
    targetActualEndDate = parsedEnd;
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
          t.manual_start_date,
          t.actual_start_date,
          t.actual_end_date,
          t.percent_complete
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
    const targetSchedulingMode = hasSchedulingMode
      ? req.body.scheduling_mode === "manual"
        ? "manual"
        : "auto"
      : oldTask.scheduling_mode;
    const targetManualStartDate = hasManualStartDate
      ? req.body.manual_start_date || null
      : oldTask.manual_start_date;

    const finalActualStartDate = hasActualStartDate
      ? targetActualStartDate
      : parseDateOnly(oldTask.actual_start_date);
    const finalActualEndDate = hasActualEndDate
      ? targetActualEndDate
      : parseDateOnly(oldTask.actual_end_date);
    const finalPercentComplete = hasPercentComplete
      ? targetPercentComplete
      : (oldTask.percent_complete ?? 0);

    // Chặn ngày kết thúc thực tế sớm hơn ngày bắt đầu thực tế (T-35)
    if (finalActualStartDate && finalActualEndDate && finalActualEndDate < finalActualStartDate) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Ngày kết thúc thực tế không được sớm hơn ngày bắt đầu thực tế",
      });
    }

    const updateResult = await client.query(
      `
        UPDATE tasks
        SET name = $1,
            duration_days = $2,
            scheduling_mode = $3,
            manual_start_date = $4,
            actual_start_date = $5,
            actual_end_date = $6,
            percent_complete = $7,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING id, work_item_id, name, duration_days, scheduling_mode, manual_start_date, actual_start_date, actual_end_date, percent_complete, updated_at
      `,
      [
        targetName,
        targetDuration,
        targetSchedulingMode,
        targetManualStartDate,
        finalActualStartDate,
        finalActualEndDate,
        finalPercentComplete,
        taskId,
      ]
    );

    const scheduleDirty =
      oldTask.duration_days !== targetDuration ||
      oldTask.scheduling_mode !== targetSchedulingMode ||
      hasManualStartDate ||
      (hasActualStartDate && parseDateOnly(oldTask.actual_start_date) !== targetActualStartDate) ||
      (hasActualEndDate && parseDateOnly(oldTask.actual_end_date) !== targetActualEndDate) ||
      (hasPercentComplete && (oldTask.percent_complete ?? 0) !== targetPercentComplete);

    if (scheduleDirty) {
      await markProjectScheduleDirty(projectId, client);
    }

    await client.query("COMMIT");

    return res.json({
      message: scheduleDirty
        ? "Cập nhật công việc và đánh dấu cần tính lại lịch"
        : "Cập nhật công việc thành công",
      task: formatTaskResponse(updateResult.rows[0]),
      scheduleNeedsRecalculation: scheduleDirty,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    // Bắt lỗi ràng buộc database nếu có
    if (error.code === "23514") {
      if (error.constraint === "tasks_actual_dates_order_check") {
        return res.status(400).json({
          message: "Ngày kết thúc thực tế không được sớm hơn ngày bắt đầu thực tế",
        });
      }
      if (error.constraint === "tasks_percent_complete_range") {
        return res.status(400).json({
          message: "Phần trăm hoàn thành phải nằm trong khoảng 0 đến 100",
        });
      }
    }
    next(error);
  } finally {
    client.release();
  }
};

// PUT /api/projects/:projectId/tasks/:taskId — Chỉnh sửa công việc (T-12, T-35)
router.put(
  "/:projectId/tasks/:taskId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  handleUpdateTask
);

// PATCH /api/projects/:projectId/tasks/:taskId — Cập nhật công việc (T-12, T-35)
router.patch(
  "/:projectId/tasks/:taskId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  handleUpdateTask
);

// PATCH /api/projects/:projectId/tasks/:taskId/progress — Cập nhật tiến độ thực tế (T-35)
router.patch(
  "/:projectId/tasks/:taskId/progress",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  handleUpdateTask
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