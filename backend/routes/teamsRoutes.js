"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
checkProjectAccess,
allow,
createProjectRouter,
} = require("../middleware/projectAccess");
const { ROLES } = require("../utils/constants");
const asyncHandler = require("../utils/asyncHandler");

const router = createProjectRouter();

const allRoles = allow(Object.values(ROLES));
const managementRoles = allow([
ROLES.CHU_DAU_TU,
ROLES.BAN_QUAN_LY,
ROLES.CHI_HUY_TRUONG,
ROLES.DOI_TRUONG,
]);

function positiveId(value) {
const id = Number(value);
return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// GET /api/projects/:projectId/teams
router.get(
"/:projectId/teams",
requireAuth,
checkProjectAccess,
allRoles,
asyncHandler(async (req, res) => {
const projectId = positiveId(req.params.projectId);
if (!projectId) {
  return res.status(400).json({ message: "projectId không hợp lệ" });
}

const result = await db.query(
  `SELECT t.id, t.project_id, t.name, t.created_at,
          COUNT(tm.user_id)::int AS member_count
   FROM teams t
   LEFT JOIN team_members tm
     ON tm.team_id = t.id AND tm.project_id = t.project_id
   WHERE t.project_id = $1
   GROUP BY t.id
   ORDER BY t.id`,
  [projectId]
);

return res.json({ teams: result.rows });

})
);

// POST /api/projects/:projectId/teams
router.post(
"/:projectId/teams",
requireAuth,
checkProjectAccess,
managementRoles,
asyncHandler(async (req, res) => {
const projectId = positiveId(req.params.projectId);
const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
if (!projectId) {
  return res.status(400).json({ message: "projectId không hợp lệ" });
}

if (!name || name.length > 100) {
  return res.status(400).json({
    message: "Tên đội bắt buộc và không được vượt quá 100 ký tự",
  });
}

const result = await db.query(
  `INSERT INTO teams (project_id, name)
   VALUES ($1, $2)
   ON CONFLICT (project_id, lower(name)) DO NOTHING
   RETURNING id, project_id, name, created_at`,
  [projectId, name]
);

if (result.rows.length === 0) {
  return res.status(409).json({
    message: "Tên đội đã tồn tại trong dự án",
  });
}

return res.status(201).json({ team: result.rows[0] });

})
);

// GET /api/projects/:projectId/teams/:teamId/members
router.get(
"/:projectId/teams/:teamId/members",
requireAuth,
checkProjectAccess,
allRoles,
asyncHandler(async (req, res) => {
const projectId = positiveId(req.params.projectId);
const teamId = positiveId(req.params.teamId);
if (!projectId || !teamId) {
  return res.status(400).json({ message: "ID dự án hoặc đội không hợp lệ" });
}

const team = await db.query(
  "SELECT id FROM teams WHERE id = $1 AND project_id = $2",
  [teamId, projectId]
);

if (team.rows.length === 0) {
  return res.status(404).json({ message: "Không tìm thấy đội trong dự án" });
}

const result = await db.query(
  `SELECT tm.user_id, u.name, u.email, tm.created_at
   FROM team_members tm
   JOIN users u ON u.id = tm.user_id
   WHERE tm.team_id = $1 AND tm.project_id = $2
   ORDER BY tm.user_id`,
  [teamId, projectId]
);

return res.json({ members: result.rows });

})
);

// POST /api/projects/:projectId/teams/:teamId/members
router.post(
"/:projectId/teams/:teamId/members",
requireAuth,
checkProjectAccess,
managementRoles,
asyncHandler(async (req, res) => {
const projectId = positiveId(req.params.projectId);
const teamId = positiveId(req.params.teamId);
const userId = positiveId(req.body.user_id);
if (!projectId || !teamId || !userId) {
  return res.status(400).json({
    message: "projectId, teamId và user_id phải là số nguyên dương",
  });
}

const team = await db.query(
  "SELECT id FROM teams WHERE id = $1 AND project_id = $2",
  [teamId, projectId]
);

if (team.rows.length === 0) {
  return res.status(404).json({ message: "Không tìm thấy đội trong dự án" });
}

const membership = await db.query(
  `SELECT 1 FROM project_members
   WHERE project_id = $1 AND user_id = $2`,
  [projectId, userId]
);

if (membership.rows.length === 0) {
  return res.status(400).json({
    message: "Người dùng chưa là thành viên của dự án",
  });
}

const result = await db.query(
  `INSERT INTO team_members (team_id, project_id, user_id)
   VALUES ($1, $2, $3)
   ON CONFLICT (team_id, user_id) DO NOTHING
   RETURNING team_id, project_id, user_id, created_at`,
  [teamId, projectId, userId]
);

if (result.rows.length === 0) {
  return res.status(409).json({ message: "Người dùng đã thuộc đội này" });
}

return res.status(201).json({ member: result.rows[0] });

})
);

// POST /api/projects/:projectId/tasks/:taskId/assignment
router.post(
"/:projectId/tasks/:taskId/assignment",
requireAuth,
checkProjectAccess,
managementRoles,
asyncHandler(async (req, res) => {
const projectId = positiveId(req.params.projectId);
const taskId = positiveId(req.params.taskId);
const teamId = positiveId(req.body.team_id);
if (!projectId || !taskId || !teamId) {
  return res.status(400).json({
    message: "projectId, taskId và team_id phải là số nguyên dương",
  });
}

const task = await db.query(
  `SELECT t.id
   FROM tasks t
   JOIN work_items wi ON wi.id = t.work_item_id
   WHERE t.id = $1 AND wi.project_id = $2`,
  [taskId, projectId]
);

if (task.rows.length === 0) {
  return res.status(404).json({ message: "Không tìm thấy task trong dự án" });
}

const team = await db.query(
  "SELECT id FROM teams WHERE id = $1 AND project_id = $2",
  [teamId, projectId]
);

if (team.rows.length === 0) {
  return res.status(404).json({ message: "Không tìm thấy đội trong dự án" });
}

const result = await db.query(
  `INSERT INTO task_assignments (task_id, team_id, assigned_by)
   VALUES ($1, $2, $3)
   ON CONFLICT (task_id)
   DO UPDATE SET team_id = EXCLUDED.team_id,
                 assigned_by = EXCLUDED.assigned_by,
                 assigned_at = CURRENT_TIMESTAMP
   RETURNING task_id, team_id, assigned_by, assigned_at`,
  [taskId, teamId, req.user.id]
);

return res.json({ assignment: result.rows[0] });

})
);

// GET /api/projects/:projectId/teams/:teamId/tasks
router.get(
"/:projectId/teams/:teamId/tasks",
requireAuth,
checkProjectAccess,
allRoles,
asyncHandler(async (req, res) => {
const projectId = positiveId(req.params.projectId);
const teamId = positiveId(req.params.teamId);
if (!projectId || !teamId) {
  return res.status(400).json({ message: "ID dự án hoặc đội không hợp lệ" });
}

const team = await db.query(
  "SELECT id FROM teams WHERE id = $1 AND project_id = $2",
  [teamId, projectId]
);

if (team.rows.length === 0) {
  return res.status(404).json({ message: "Không tìm thấy đội trong dự án" });
}

const result = await db.query(
  `SELECT t.id AS task_id, t.name, t.duration_days,
          t.percent_complete, ta.assigned_at, ta.assigned_by,
          wi.id AS work_item_id, wi.name AS work_item_name
   FROM task_assignments ta
   JOIN tasks t ON t.id = ta.task_id
   JOIN work_items wi ON wi.id = t.work_item_id
   WHERE ta.team_id = $1 AND wi.project_id = $2
   ORDER BY t.id`,
  [teamId, projectId]
);

return res.json({ tasks: result.rows });

})
);

module.exports = router;
// ============================================================
// S-26 / T-59
// Đội trưởng xem việc của đội và báo khối lượng trong ngày
// ============================================================

async function findUserTeam(projectId, userId) {
  const result = await db.query(
    `
      SELECT
        t.id,
        t.name
      FROM teams t
      JOIN team_members tm
        ON tm.team_id = t.id
       AND tm.project_id = t.project_id
      WHERE t.project_id = $1
        AND tm.user_id = $2
      ORDER BY t.id
      LIMIT 1
    `,
    [projectId, userId]
  );

  return result.rows[0] || null;
}


// GET /api/projects/:projectId/my-team/tasks
router.get(
  "/:projectId/my-team/tasks",
  requireAuth,
  checkProjectAccess,
  allow([
    ROLES.DOI_TRUONG,
    ROLES.CHI_HUY_TRUONG,
    ROLES.BAN_QUAN_LY,
    ROLES.CHU_DAU_TU,
  ]),
  asyncHandler(async (req, res) => {
    const projectId = positiveId(req.params.projectId);

    if (!projectId) {
      return res.status(400).json({
        message: "projectId không hợp lệ",
      });
    }

    let teamId = positiveId(req.query.team_id);

    // Đội trưởng chỉ được xem đội của chính mình
    if (req.projectRole === ROLES.DOI_TRUONG) {
      const ownTeam = await findUserTeam(
        projectId,
        req.user.id
      );

      if (!ownTeam) {
        return res.status(403).json({
          message:
            "Tài khoản đội trưởng chưa được xếp vào đội thi công",
        });
      }

      teamId = ownTeam.id;
    }

    // Ban quản lý / chỉ huy trưởng có thể truyền team_id.
    // Nếu không truyền thì lấy đội đầu tiên.
    if (!teamId) {
      const firstTeam = await db.query(
        `
          SELECT id
          FROM teams
          WHERE project_id = $1
          ORDER BY id
          LIMIT 1
        `,
        [projectId]
      );

      if (firstTeam.rows.length === 0) {
        return res.json({
          team: null,
          tasks: [],
        });
      }

      teamId = firstTeam.rows[0].id;
    }

    const teamResult = await db.query(
      `
        SELECT id, name
        FROM teams
        WHERE id = $1
          AND project_id = $2
      `,
      [teamId, projectId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy đội trong dự án",
      });
    }

    const result = await db.query(
      `
        SELECT
          t.id AS task_id,
          t.name,
          t.duration_days,
          t.percent_complete,

          t.planned_quantity,
          t.quantity_unit,

          wi.id AS work_item_id,
          wi.name AS work_item_name,

          ta.team_id,
          tm.name AS team_name,

          sr.early_start,
          sr.early_finish,
          sr.is_critical,

          COALESCE(today.total_today, 0)::float
            AS reported_today,

          COALESCE(all_report.total_reported, 0)::float
            AS cumulative_reported,

          last_report.last_reported_at

        FROM task_assignments ta

        JOIN tasks t
          ON t.id = ta.task_id

        JOIN work_items wi
          ON wi.id = t.work_item_id

        JOIN teams tm
          ON tm.id = ta.team_id
         AND tm.project_id = wi.project_id

        LEFT JOIN schedule_results sr
          ON sr.task_id = t.id

        LEFT JOIN LATERAL (
          SELECT
            SUM(qr.quantity) AS total_today
          FROM task_quantity_reports qr
          WHERE qr.task_id = t.id
            AND qr.team_id = ta.team_id
            AND qr.report_date = CURRENT_DATE
        ) today ON TRUE

        LEFT JOIN LATERAL (
          SELECT
            SUM(qr.quantity) AS total_reported
          FROM task_quantity_reports qr
          WHERE qr.task_id = t.id
            AND qr.team_id = ta.team_id
        ) all_report ON TRUE

        LEFT JOIN LATERAL (
          SELECT
            MAX(qr.created_at) AS last_reported_at
          FROM task_quantity_reports qr
          WHERE qr.task_id = t.id
            AND qr.team_id = ta.team_id
        ) last_report ON TRUE

        WHERE wi.project_id = $1
          AND ta.team_id = $2

        ORDER BY
          sr.early_start NULLS LAST,
          t.id
      `,
      [projectId, teamId]
    );

    return res.json({
      team: teamResult.rows[0],
      tasks: result.rows.map((task) => ({
        ...task,
        over_planned:
          task.planned_quantity !== null &&
          Number(task.cumulative_reported) >
            Number(task.planned_quantity),
      })),
    });
  })
);


// POST /api/projects/:projectId/tasks/:taskId/quantity-reports
router.post(
  "/:projectId/tasks/:taskId/quantity-reports",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.DOI_TRUONG]),
  asyncHandler(async (req, res) => {
    const projectId = positiveId(req.params.projectId);
    const taskId = positiveId(req.params.taskId);

    const quantity = Number(req.body.quantity);

    if (!projectId || !taskId) {
      return res.status(400).json({
        message: "projectId hoặc taskId không hợp lệ",
      });
    }

    // AC: khối lượng không được âm
    if (
      !Number.isFinite(quantity) ||
      quantity < 0
    ) {
      return res.status(400).json({
        message:
          "Khối lượng báo cáo phải là số không âm",
      });
    }

    const ownTeam = await findUserTeam(
      projectId,
      req.user.id
    );

    if (!ownTeam) {
      return res.status(403).json({
        message:
          "Đội trưởng chưa thuộc đội thi công nào",
      });
    }

    // Đảm bảo task thật sự được giao cho đội trưởng này
    const taskResult = await db.query(
      `
        SELECT
          t.id,
          t.name,
          t.planned_quantity,
          t.quantity_unit
        FROM tasks t

        JOIN work_items wi
          ON wi.id = t.work_item_id

        JOIN task_assignments ta
          ON ta.task_id = t.id

        WHERE t.id = $1
          AND wi.project_id = $2
          AND ta.team_id = $3
      `,
      [taskId, projectId, ownTeam.id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(403).json({
        message:
          "Công việc này không được giao cho đội của bạn",
      });
    }

    const task = taskResult.rows[0];

    const insertResult = await db.query(
      `
        INSERT INTO task_quantity_reports (
          project_id,
          task_id,
          team_id,
          reported_by,
          quantity
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          project_id,
          task_id,
          team_id,
          reported_by,
          quantity,
          report_date,
          created_at
      `,
      [
        projectId,
        taskId,
        ownTeam.id,
        req.user.id,
        quantity,
      ]
    );

    const totalResult = await db.query(
      `
        SELECT
          COALESCE(
            SUM(quantity),
            0
          )::float AS cumulative_reported,

          COALESCE(
            SUM(quantity)
              FILTER (
                WHERE report_date = CURRENT_DATE
              ),
            0
          )::float AS reported_today

        FROM task_quantity_reports

        WHERE project_id = $1
          AND task_id = $2
          AND team_id = $3
      `,
      [projectId, taskId, ownTeam.id]
    );

    const cumulativeReported =
      Number(
        totalResult.rows[0].cumulative_reported
      );

    const plannedQuantity =
      task.planned_quantity === null
        ? null
        : Number(task.planned_quantity);

    // AC: vượt khối lượng chỉ cảnh báo, KHÔNG rollback
    const exceeded =
      plannedQuantity !== null &&
      cumulativeReported > plannedQuantity;

    return res.status(201).json({
      message: exceeded
        ? "Đã lưu báo cáo. Cảnh báo: khối lượng lũy kế đã vượt khối lượng công việc."
        : "Đã lưu báo cáo khối lượng.",

      warning: exceeded
        ? "Khối lượng lũy kế vượt khối lượng kế hoạch nhưng báo cáo vẫn được ghi nhận."
        : null,

      report: insertResult.rows[0],

      task: {
        task_id: task.id,
        name: task.name,
        planned_quantity: plannedQuantity,
        quantity_unit: task.quantity_unit,
        reported_today:
          Number(
            totalResult.rows[0].reported_today
          ),
        cumulative_reported:
          cumulativeReported,
        over_planned: exceeded,
      },
    });
  })
);


// GET /api/projects/:projectId/tasks/:taskId/quantity-reports
router.get(
  "/:projectId/tasks/:taskId/quantity-reports",
  requireAuth,
  checkProjectAccess,
  allow([
    ROLES.DOI_TRUONG,
    ROLES.CHI_HUY_TRUONG,
    ROLES.BAN_QUAN_LY,
    ROLES.CHU_DAU_TU,
  ]),
  asyncHandler(async (req, res) => {
    const projectId = positiveId(req.params.projectId);
    const taskId = positiveId(req.params.taskId);

    if (!projectId || !taskId) {
      return res.status(400).json({
        message: "ID không hợp lệ",
      });
    }

    const result = await db.query(
      `
        SELECT
          qr.id,
          qr.quantity,
          qr.report_date,
          qr.created_at,
          qr.reported_by,
          u.name AS reported_by_name,
          tm.name AS team_name

        FROM task_quantity_reports qr

        JOIN users u
          ON u.id = qr.reported_by

        JOIN teams tm
          ON tm.id = qr.team_id

        WHERE qr.project_id = $1
          AND qr.task_id = $2

        ORDER BY qr.created_at DESC
      `,
      [projectId, taskId]
    );

    return res.json({
      reports: result.rows,
    });
  })
);