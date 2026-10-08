"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, allow, createProjectRouter } = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { ROLES } = require("../utils/constants");
const { closeMilestoneWarnings } = require("../services/milestoneWarnings");
const { getOffsetDays, DEFAULT_CALENDAR } = require("../algorithms/workingDays");

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

      // Vô hiệu hóa mốc cũ nếu có, and close its warnings
      const oldMilestones = await client.query(
        "UPDATE milestones SET is_active = false, updated_at = NOW() WHERE work_item_id = $1 AND is_active = true RETURNING id",
        [workItemId]
      );
      for (const old of oldMilestones.rows) {
        await closeMilestoneWarnings(old.id, client);
      }

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

      const deletedMilestones = await client.query(
        "UPDATE milestones SET is_active = false, updated_at = NOW() WHERE work_item_id = $1 AND is_active = true RETURNING id",
        [workItemId]
      );
      for (const ms of deletedMilestones.rows) {
        await closeMilestoneWarnings(ms.id, client);
      }

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
    const projectId = parsePositiveInt(req.params.projectId);
    const warningId = parsePositiveInt(req.params.warningId);

    // T-45 Security: verify warningId belongs to this project
    const warningRes = await db.query(
      `SELECT work_item_id FROM milestone_warnings WHERE id = $1 AND project_id = $2`,
      [warningId, projectId]
    );
    if (warningRes.rows.length === 0) return res.status(404).json({ message: "Warning not found" });

    const workItemId = warningRes.rows[0].work_item_id;

    // Get all descendant work_items
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

    // Find the task with the largest early_finish in the subtree (the "end" of the driving path)
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

    // Batch-load all tasks, schedule results, and dependencies in the project
    // to avoid N+1 queries during backward tracing
    const allDataRes = await db.query(`
      SELECT
        t.id as task_id,
        t.name as task_name,
        t.duration_days as duration,
        sr.early_start,
        sr.early_finish,
        sr.late_start,
        sr.late_finish,
        sr.is_critical
      FROM tasks t
      JOIN work_items wi ON wi.id = t.work_item_id
      JOIN schedule_results sr ON sr.task_id = t.id
      WHERE wi.project_id = $1
    `, [projectId]);

    const allDepsRes = await db.query(`
      SELECT
        d.predecessor_id,
        d.successor_id,
        d.dependency_type,
        d.lead_lag_days
      FROM dependencies d
      JOIN tasks t_pre ON t_pre.id = d.predecessor_id
      JOIN work_items wi_pre ON wi_pre.id = t_pre.work_item_id
      JOIN tasks t_suc ON t_suc.id = d.successor_id
      JOIN work_items wi_suc ON wi_suc.id = t_suc.work_item_id
      WHERE wi_pre.project_id = $1 AND wi_suc.project_id = $1
    `, [projectId]);

    const calRes = await db.query(`SELECT * FROM calendars WHERE project_id = $1`, [projectId]);
    const holRes = await db.query(`SELECT holiday_date FROM holidays WHERE project_id = $1`, [projectId]);
    const projectRes = await db.query(`SELECT start_date FROM projects WHERE id = $1`, [projectId]);
    
    const calendar = calRes.rows[0] || DEFAULT_CALENDAR;
    const holidays = holRes.rows.map(r => r.holiday_date);
    const projectStart = new Date(projectRes.rows[0].start_date).toISOString().split('T')[0];

    // Build lookup maps
    const taskMap = {};
    for (const row of allDataRes.rows) {
      taskMap[row.task_id] = row;
    }

    // predecessors of each task: { [successorId]: [{ predecessorId, type, lag }] }
    const predMap = {};
    for (const dep of allDepsRes.rows) {
      if (!predMap[dep.successor_id]) predMap[dep.successor_id] = [];
      predMap[dep.successor_id].push({
        predecessorId: dep.predecessor_id,
        type: dep.dependency_type,
        lag: Number(dep.lead_lag_days) || 0,
      });
    }

    // Trace driving path backwards from endTaskId
    // At each step, pick the predecessor that drives the successor's ES
    // (i.e. produces the largest constraint value)
    const path = [];
    const visited = new Set();
    let currentId = endTaskId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const task = taskMap[currentId];
      if (!task) break;

      path.push({
        task_id: currentId,
        task_name: task.task_name,
        early_start: task.early_start,
        early_finish: task.early_finish,
      });

      // Find the driving predecessor
      const preds = predMap[currentId] || [];
      if (preds.length === 0) break;

      let drivingPredId = null;
      let maxConstraint = -Infinity;

      // Calculate successor offsetES
      const taskESDateStr = new Date(task.early_start).toISOString().split('T')[0];
      const taskOffsetES = getOffsetDays(projectStart, taskESDateStr, calendar, holidays);

      for (const pred of preds) {
        const predTask = taskMap[pred.predecessorId];
        if (!predTask) continue;

        // Calculate predecessor offsetES and offsetEF
        const predESDateStr = new Date(predTask.early_start).toISOString().split('T')[0];
        const predEFDateStr = new Date(predTask.early_finish).toISOString().split('T')[0];
        
        const predOffsetES = getOffsetDays(projectStart, predESDateStr, calendar, holidays);
        let predOffsetEF = getOffsetDays(projectStart, predEFDateStr, calendar, holidays);
        
        // Convert INCLUSIVE DB finish to EXCLUSIVE offset, unless it's a 0-duration milestone
        if (Number(predTask.duration) > 0) {
          predOffsetEF += 1;
        }

        const lag = Number(pred.lag) || 0;
        
        // Calculate true effective successor duration
        const sucESDateStr = new Date(task.early_start).toISOString().split('T')[0];
        const sucEFDateStr = new Date(task.early_finish).toISOString().split('T')[0];
        const sucOffsetES = getOffsetDays(projectStart, sucESDateStr, calendar, holidays);
        let sucOffsetEF = getOffsetDays(projectStart, sucEFDateStr, calendar, holidays);
        if (Number(task.duration) > 0) {
          sucOffsetEF += 1;
        }
        const sucDuration = sucOffsetEF - sucOffsetES;

        let constraintOffset;
        switch (pred.type) {
          case 'FS':
            constraintOffset = predOffsetEF + lag;
            break;
          case 'SS':
            constraintOffset = predOffsetES + lag;
            break;
          case 'FF':
            constraintOffset = predOffsetEF + lag - sucDuration;
            break;
          case 'SF':
            constraintOffset = predOffsetES + lag - sucDuration;
            break;
          default:
            constraintOffset = predOffsetEF + lag;
        }

        if (constraintOffset > maxConstraint) {
          maxConstraint = constraintOffset;
          drivingPredId = pred.predecessorId;
        }
      }

      if (drivingPredId && maxConstraint === taskOffsetES) {
        currentId = drivingPredId;
      } else {
        // Successor is constrained by actual/manual date or project start, not by predecessors
        break;
      }
    }

    // Reverse so path goes start → end
    path.reverse();

    // Add step numbers
    const result = path.map((p, idx) => ({ ...p, step: idx + 1 }));

    return res.json(result);
  })
);

module.exports = router;
