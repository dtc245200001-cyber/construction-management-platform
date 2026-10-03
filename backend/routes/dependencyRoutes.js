"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");

const {
  checkProjectAccess,
  allow,
  createProjectRouter,
} = require("../middleware/projectAccess");

const {
  findCycleCreatedByEdge,
  buildCycleDescription,
} = require("../utils/dependencyCycle");

const {
  parsePositiveInt,
} = require("../utils/validators");

const {
  ROLES,
} = require("../utils/constants");

const asyncHandler = require("../utils/asyncHandler");

const router = createProjectRouter();

const VALID_TYPES = [
  "FS",
  "SS",
  "FF",
  "SF",
];

router.post(
  "/:projectId/dependencies",

  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),

  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(
      req.params.projectId
    );

    const predecessorId = parsePositiveInt(
      req.body.predecessor_id
    );

    const successorId = parsePositiveInt(
      req.body.successor_id
    );

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
        message:
          "lead_lag_days phải là số nguyên",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Khóa theo project để tránh 2 request đồng thời
      // cùng tạo ra vòng.
      await client.query(
        "SELECT pg_advisory_xact_lock($1)",
        [projectId]
      );

      // Lấy tất cả công việc của project.
      const itemsResult = await client.query(
        `SELECT id, name
         FROM work_items
         WHERE project_id = $1
         ORDER BY id`,
        [projectId]
      );

      const itemNames = new Map();

      for (const row of itemsResult.rows) {
        itemNames.set(
          Number(row.id),
          row.name
        );
      }

      if (
        !itemNames.has(predecessorId) ||
        !itemNames.has(successorId)
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "Công việc không thuộc dự án này",
        });
      }

      // Chặn quan hệ trùng.
      const duplicate = await client.query(
        `SELECT 1
         FROM dependencies
         WHERE predecessor_id = $1
           AND successor_id = $2
         LIMIT 1`,
        [
          predecessorId,
          successorId,
        ]
      );

      if (duplicate.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Quan hệ công việc đã tồn tại",
        });
      }

      // Lấy các quan hệ hiện có trong đúng project.
      const depsResult = await client.query(
        `SELECT
           d.predecessor_id,
           d.successor_id
         FROM dependencies d

         JOIN work_items pre
           ON pre.id = d.predecessor_id

         JOIN work_items suc
           ON suc.id = d.successor_id

         WHERE pre.project_id = $1
           AND suc.project_id = $1`,
        [projectId]
      );

      const cycleIds =
        findCycleCreatedByEdge(
          itemsResult.rows.map(
            (item) => item.id
          ),
          depsResult.rows,
          predecessorId,
          successorId
        );

      // Nếu quan hệ mới tạo vòng:
      // rollback ngay, tuyệt đối không INSERT.
      if (cycleIds) {
        const cycle =
          buildCycleDescription(
            cycleIds,
            itemNames
          );

        await client.query("ROLLBACK");

        return res.status(422).json({
          code: "DEPENDENCY_CYCLE",

          message:
            `Không thể tạo quan hệ vì sẽ tạo vòng phụ thuộc: ${cycle.cyclePath}`,

          cycleIds:
            cycle.cycleIds,

          cycleNames:
            cycle.cycleNames,

          cyclePath:
            cycle.cyclePath,
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

      await client.query("COMMIT");

      return res.status(201).json({
        message:
          "Tạo quan hệ công việc thành công",

        dependency:
          result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })
);

module.exports = router;