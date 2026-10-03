const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  allow,
  createProjectRouter,
} = require("../middleware/projectAccess");
const { ROLES } = require("../utils/constants");
const { markProjectScheduleDirty } = require("../services/scheduleRecalculation");

const router = createProjectRouter();

// PUT /api/projects/:projectId/tasks/:taskId
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
        message: "projectId không h?p l?",
      });
    }

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({
        message: "taskId không h?p l?",
      });
    }

    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      return res.status(400).json({
        message: "duration_days ph?i là s? nguyên duong",
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
          message: "Không tìm th?y task trong project",
        });
      }

      const oldDuration = taskResult.rows[0].duration_days;

      const updateResult = await client.query(
        `
          UPDATE tasks
          SET duration_days = $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING id, work_item_id, name, duration_days, updated_at
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
            ? "C?p nh?t th?i lu?ng và dánh d?u c?n tính l?i l?ch"
            : "Th?i lu?ng không thay d?i",
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
