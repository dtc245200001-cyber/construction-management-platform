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
const { markProjectScheduleDirty } = require("../services/scheduleRecalculation");

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
        message: "projectId khÃ´ng há»£p lá»‡",
      });
    }

    if (!predecessorId || !successorId) {
      return res.status(400).json({
        message:
          "predecessor_id vÃ  successor_id pháº£i há»£p lá»‡",
      });
    }

    if (!VALID_TYPES.includes(dependencyType)) {
      return res.status(400).json({
        message:
          "dependency_type chá»‰ Ä‘Æ°á»£c lÃ  FS, SS, FF hoáº·c SF",
      });
    }

    if (!Number.isInteger(leadLagDays)) {
      return res.status(400).json({
        message:
          "lead_lag_days pháº£i lÃ  sá»‘ nguyÃªn",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // KhÃ³a theo project Ä‘á»ƒ trÃ¡nh 2 request Ä‘á»“ng thá»i
      // cÃ¹ng táº¡o ra vÃ²ng.
      await client.query(
        "SELECT pg_advisory_xact_lock($1)",
        [projectId]
      );

      // Láº¥y táº¥t cáº£ cÃ´ng viá»‡c cá»§a project.
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
            "CÃ´ng viá»‡c khÃ´ng thuá»™c dá»± Ã¡n nÃ y",
        });
      }

      // Cháº·n quan há»‡ trÃ¹ng.
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
            "Quan há»‡ cÃ´ng viá»‡c Ä‘Ã£ tá»“n táº¡i",
        });
      }

      // Láº¥y cÃ¡c quan há»‡ hiá»‡n cÃ³ trong Ä‘Ãºng project.
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

      const cycleIds =
        findCycleCreatedByEdge(
          itemsResult.rows.map(
            (item) => item.id
          ),
          depsResult.rows,
          predecessorId,
          successorId
        );

      // Náº¿u quan há»‡ má»›i táº¡o vÃ²ng:
      // rollback ngay, tuyá»‡t Ä‘á»‘i khÃ´ng INSERT.
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
            `KhÃ´ng thá»ƒ táº¡o quan há»‡ vÃ¬ sáº½ táº¡o vÃ²ng phá»¥ thuá»™c: ${cycle.cyclePath}`,

          cycleIds:
            cycle.cycleIds,

          cycleNames:
            cycle.cycleNames,

          cyclePath:
            cycle.cyclePath,
        });
      }

      // KhÃ´ng cÃ³ vÃ²ng -> má»›i Ä‘Æ°á»£c INSERT.
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

      await markProjectScheduleDirty(projectId, client);

      await client.query("COMMIT");

      return res.status(201).json({
        message:
          "Táº¡o quan há»‡ cÃ´ng viá»‡c thÃ nh cÃ´ng",

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
