"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");

const {
  checkProjectAccess,
  allow,
  createProjectRouter,
} = require("../middleware/projectAccess");

const { detectCycle } = require("../algorithms/cpm");
const {
  buildTempGraph,
  rotateCycleToStartWith,
  cycleContainsEdge,
  findCycleThroughEdge,
} = require("../utils/buildTempGraph");

const { parsePositiveInt } = require("../utils/validators");
const { ROLES } = require("../utils/constants");
const asyncHandler = require("../utils/asyncHandler");
const {
  markProjectScheduleDirty,
} = require("../services/scheduleRecalculation");

const router = createProjectRouter();

const VALID_TYPES = ["FS", "SS", "FF", "SF"];

/**
 * @swagger
 * /api/projects/{projectId}/dependencies:
 *   post:
 *     summary: API POST /:projectId/dependencies
 *     tags: [Dependency]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.post(
  "/:projectId/dependencies",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),

  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const predecessorId = parsePositiveInt(req.body.predecessor_id);
    const successorId = parsePositiveInt(req.body.successor_id);

    const dependencyType = String(
      req.body.dependency_type || "FS"
    ).toUpperCase();

    const leadLagDays =
      req.body.lead_lag_days == null
        ? 0
        : Number(req.body.lead_lag_days);

    if (!projectId) {
      return res.status(400).json({
        message: "projectId không hợp lệ",
      });
    }

    if (!predecessorId || !successorId) {
      return res.status(400).json({
        message:
          "predecessor_id và successor_id phải hợp lệ",
      });
    }

    if (!VALID_TYPES.includes(dependencyType)) {
      return res.status(400).json({
        message:
          "dependency_type chỉ được là FS, SS, FF hoặc SF",
      });
    }

    if (!Number.isInteger(leadLagDays)) {
      return res.status(400).json({
        message: "lead_lag_days phải là số nguyên",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Khóa theo project để tránh 2 request đồng thời
      // cùng tạo ra vòng phụ thuộc.
      await client.query(
        "SELECT pg_advisory_xact_lock($1)",
        [projectId]
      );

      // Lấy toàn bộ task thuộc project.
      const itemsResult = await client.query(
        `SELECT
           t.id,
           t.name
         FROM tasks t
         JOIN work_items wi
           ON wi.id = t.work_item_id
         WHERE wi.project_id = $1
         ORDER BY t.id`,
        [projectId]
      );

      const itemNames = new Map();

      for (const row of itemsResult.rows) {
        itemNames.set(Number(row.id), row.name);
      }

      if (
        !itemNames.has(predecessorId) ||
        !itemNames.has(successorId)
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "Công việc không thuộc dự án này",
        });
      }

      // Chặn quan hệ trùng.
      const duplicate = await client.query(
        `SELECT 1
         FROM dependencies
         WHERE predecessor_id = $1
           AND successor_id = $2
         LIMIT 1`,
        [predecessorId, successorId]
      );

      if (duplicate.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message: "Quan hệ công việc đã tồn tại",
        });
      }

      // Lấy các quan hệ hiện có trong project.
      const depsResult = await client.query(
        `SELECT
           d.predecessor_id,
           d.successor_id
         FROM dependencies d
         JOIN tasks pre_task
           ON pre_task.id = d.predecessor_id
         JOIN work_items pre
           ON pre.id = pre_task.work_item_id
         JOIN tasks suc_task
           ON suc_task.id = d.successor_id
         JOIN work_items suc
           ON suc.id = suc_task.work_item_id
         WHERE pre.project_id = $1
           AND suc.project_id = $1`,
        [projectId]
      );

      // Tự trỏ -> bắt sớm và trả 422.
        if (predecessorId === successorId) {
          await client.query("ROLLBACK");

          const taskName = itemNames.get(predecessorId);

          return res.status(422).json({
            code: "DEPENDENCY_CYCLE",
            message:
              `Không thể tạo quan hệ: ${taskName} không thể chờ chính nó.`,
            cycleIds: [predecessorId, predecessorId],
            cycleNames: [taskName, taskName],
            cyclePath: `${taskName} → ${taskName}`,
          });
        }

      // Dựng graph với dependency mới để kiểm tra cycle.
      const graph = buildTempGraph(
        itemsResult.rows,
        depsResult.rows,
        {
          predecessor_id: predecessorId,
          successor_id: successorId,
          dependency_type: dependencyType,
          lead_lag_days: leadLagDays,
        }
      );

      let cycleIds = detectCycle(graph);
      let isRealCycle = false;

      // Xử lý để phân biệt vòng cũ và vòng mới do chính quan hệ này gây ra
      if (cycleIds && cycleIds.length > 0) {
        if (cycleContainsEdge(cycleIds, predecessorId, successorId)) {
          // Vòng detectCycle tìm được chính là vòng chứa quan hệ mới
          cycleIds = rotateCycleToStartWith(cycleIds, successorId);
          isRealCycle = true;
        } else {
          // detectCycle tìm thấy một vòng cũ không liên quan, ta cần tự tìm xem có vòng qua cạnh mới không
          const newCycle = findCycleThroughEdge(graph, predecessorId, successorId);
          if (newCycle.length > 0) {
            cycleIds = newCycle; // Không cần xoay vì findCycleThroughEdge đã trả ra mảng bắt đầu từ successorId
            isRealCycle = true;
          } else {
            // Không có vòng nào đi qua quan hệ mới -> hợp lệ
            isRealCycle = false;
          }
        }
      }

      if (isRealCycle) {

        const names = cycleIds.map(
          (id) =>
            itemNames.get(Number(id)) || `#${id}`
        );

        // Đóng vòng để thể hiện đầy đủ chu trình.
        names.push(names[0]);

        const pathStr = names.join(" → ");

        const waitPairs = [];

        for (let i = 0; i < names.length - 1; i++) {
          waitPairs.push(
            `${names[i]} chờ ${names[i + 1]}`
          );
        }

        const message =
          `Không thể tạo quan hệ vì sẽ tạo vòng phụ thuộc: ` +
          `${waitPairs.join(", ")}.`;

        await client.query("ROLLBACK");

        return res.status(422).json({
          code: "DEPENDENCY_CYCLE",
          message,
          cycleIds,
          cycleNames: names,
          cyclePath: pathStr,
        });
      }

      // Không có vòng -> mới được INSERT.
      const result = await client.query(
        `INSERT INTO dependencies (
           predecessor_id,
           successor_id,
           dependency_type,
           lead_lag_days
         )
         VALUES ($1, $2, $3, $4)
         RETURNING
           predecessor_id,
           successor_id,
           dependency_type,
           lead_lag_days`,
        [
          predecessorId,
          successorId,
          dependencyType,
          leadLagDays,
        ]
      );

      // T-26: dependency thay đổi -> schedule cần tính lại.
      await markProjectScheduleDirty(
        projectId,
        client
      );

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Tạo quan hệ công việc thành công",
        dependency: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

/**
 * @swagger
 * /api/projects/{projectId}/tasks/{taskId}/dependencies:
 *   get:
 *     summary: API GET /:projectId/tasks/:taskId/dependencies
 *     tags: [Dependency]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.get(
  "/:projectId/tasks/:taskId/dependencies",
  requireAuth,
  checkProjectAccess,
  asyncHandler(async (req, res) => {
    const taskId = parsePositiveInt(req.params.taskId);
    if (!taskId) return res.status(400).json({ message: "taskId không hợp lệ" });

    const { rows } = await db.query(
      `SELECT d.id, d.predecessor_id, d.successor_id,
              d.dependency_type, d.lead_lag_days,
              t.name AS predecessor_name
         FROM dependencies d
         JOIN tasks t ON t.id = d.predecessor_id
        WHERE d.successor_id = $1
        ORDER BY d.id`,
      [taskId]
    );
    return res.json({ dependencies: rows });
  })

);
/**
 * @swagger
 * /api/projects/{projectId}/tasks/{taskId}/dependencies:
 *   get:
 *     summary: API GET /:projectId/tasks/:taskId/dependencies
 *     tags: [Dependency]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.get(
  "/:projectId/tasks/:taskId/dependencies",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),

  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const taskId = parsePositiveInt(req.params.taskId);

    if (!projectId || !taskId) {
      return res.status(400).json({
        message: "projectId hoặc taskId không hợp lệ",
      });
    }

    // Công việc phải thuộc dự án này.
    const taskCheck = await db.query(
      `SELECT 1
         FROM tasks t
         JOIN work_items wi ON wi.id = t.work_item_id
        WHERE t.id = $1
          AND wi.project_id = $2`,
      [taskId, projectId]
    );

    if (taskCheck.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy công việc trong dự án này",
      });
    }

    // Các quan hệ mà công việc này là "việc sau".
    const { rows } = await db.query(
      `SELECT d.id,
              d.predecessor_id,
              d.successor_id,
              d.dependency_type,
              d.lead_lag_days,
              t.name AS predecessor_name
         FROM dependencies d
         JOIN tasks t ON t.id = d.predecessor_id
        WHERE d.successor_id = $1
        ORDER BY d.id`,
      [taskId]
    );

    return res.json({ dependencies: rows });
  })
);
module.exports = router;
