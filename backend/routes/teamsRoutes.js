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

const teamManagementRoles = allow([
  ROLES.CHU_DAU_TU,
  ROLES.BAN_QUAN_LY,
  ROLES.CHI_HUY_TRUONG,
]);

// S-25 NFR:
// chỉ Chỉ huy trưởng được giao việc / đặt khối lượng kế hoạch.
const assignmentRoles = allow([
  ROLES.CHI_HUY_TRUONG,
]);

const fieldViewRoles = allow([
  ROLES.DOI_TRUONG,
  ROLES.CHI_HUY_TRUONG,
  ROLES.BAN_QUAN_LY,
  ROLES.CHU_DAU_TU,
]);

const MAX_QUANTITY = 9999999999.99;

function positiveId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) &&
    id > 0
    ? id
    : null;
}

function isValidDateOnly(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match =
    value.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() ===
      month - 1 &&
    date.getUTCDate() === day
  );
}

function parseQuantity(raw) {
  if (
    raw === null ||
    raw === undefined
  ) {
    return null;
  }

  const value =
    String(raw).trim();

  if (!value) {
    return null;
  }

  // numeric(12,2):
  // tối đa 10 chữ số phần nguyên,
  // tối đa 2 chữ số thập phân.
  if (
    !/^\d{1,10}(?:\.\d{1,2})?$/.test(
      value
    )
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0 ||
    number > MAX_QUANTITY
  ) {
    return null;
  }

  // Trả string để PostgreSQL xử lý
  // trực tiếp dưới dạng numeric.
  return value;
}

async function findUserTeam(
  projectId,
  userId,
  client = db
) {
  const result =
    await client.query(
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

// ============================================================
// TEAMS
// ============================================================

// GET /api/projects/:projectId/teams
router.get(
  "/:projectId/teams",
  requireAuth,
  checkProjectAccess,
  allRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    if (!projectId) {
      return res.status(400).json({
        message:
          "projectId không hợp lệ",
      });
    }

    const result =
      await db.query(
        `
          SELECT
            t.id,
            t.project_id,
            t.name,
            t.created_at,
            COUNT(tm.user_id)::int
              AS member_count

          FROM teams t

          LEFT JOIN team_members tm
            ON tm.team_id = t.id
           AND tm.project_id =
               t.project_id

          WHERE t.project_id = $1

          GROUP BY t.id

          ORDER BY t.id
        `,
        [projectId]
      );

    return res.json({
      teams: result.rows,
    });
  })
);

// POST /api/projects/:projectId/teams
router.post(
  "/:projectId/teams",
  requireAuth,
  checkProjectAccess,
  teamManagementRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    const name =
      typeof req.body.name ===
      "string"
        ? req.body.name.trim()
        : "";

    if (!projectId) {
      return res.status(400).json({
        message:
          "projectId không hợp lệ",
      });
    }

    if (
      !name ||
      name.length > 100
    ) {
      return res.status(400).json({
        message:
          "Tên đội bắt buộc và không được vượt quá 100 ký tự",
      });
    }

    const result =
      await db.query(
        `
          INSERT INTO teams (
            project_id,
            name
          )
          VALUES ($1, $2)

          ON CONFLICT (
            project_id,
            lower(name)
          )
          DO NOTHING

          RETURNING
            id,
            project_id,
            name,
            created_at
        `,
        [projectId, name]
      );

    if (
      result.rows.length === 0
    ) {
      return res.status(409).json({
        message:
          "Tên đội đã tồn tại trong dự án",
      });
    }

    return res
      .status(201)
      .json({
        team: result.rows[0],
      });
  })
);

// GET /api/projects/:projectId/teams/:teamId/members
router.get(
  "/:projectId/teams/:teamId/members",
  requireAuth,
  checkProjectAccess,
  allRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    const teamId =
      positiveId(
        req.params.teamId
      );

    if (
      !projectId ||
      !teamId
    ) {
      return res.status(400).json({
        message:
          "ID dự án hoặc đội không hợp lệ",
      });
    }

    const team =
      await db.query(
        `
          SELECT id
          FROM teams
          WHERE id = $1
            AND project_id = $2
        `,
        [teamId, projectId]
      );

    if (
      team.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Không tìm thấy đội trong dự án",
      });
    }

    const result =
      await db.query(
        `
          SELECT
            tm.user_id,
            u.name,
            u.email,
            tm.created_at

          FROM team_members tm

          JOIN users u
            ON u.id = tm.user_id

          WHERE tm.team_id = $1
            AND tm.project_id = $2

          ORDER BY tm.user_id
        `,
        [teamId, projectId]
      );

    return res.json({
      members: result.rows,
    });
  })
);

// POST /api/projects/:projectId/teams/:teamId/members
router.post(
  "/:projectId/teams/:teamId/members",
  requireAuth,
  checkProjectAccess,
  teamManagementRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    const teamId =
      positiveId(
        req.params.teamId
      );

    const userId =
      positiveId(
        req.body.user_id
      );

    if (
      !projectId ||
      !teamId ||
      !userId
    ) {
      return res.status(400).json({
        message:
          "projectId, teamId và user_id phải là số nguyên dương",
      });
    }

    const team =
      await db.query(
        `
          SELECT id
          FROM teams
          WHERE id = $1
            AND project_id = $2
        `,
        [teamId, projectId]
      );

    if (
      team.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Không tìm thấy đội trong dự án",
      });
    }

    const membership =
      await db.query(
        `
          SELECT 1
          FROM project_members
          WHERE project_id = $1
            AND user_id = $2
        `,
        [projectId, userId]
      );

    if (
      membership.rows.length === 0
    ) {
      return res.status(400).json({
        message:
          "Người dùng chưa là thành viên của dự án",
      });
    }

    // Một người chỉ thuộc một đội
    // trong cùng một dự án.
    const existingTeam =
      await db.query(
        `
          SELECT
            tm.team_id,
            t.name AS team_name

          FROM team_members tm

          JOIN teams t
            ON t.id = tm.team_id
           AND t.project_id =
               tm.project_id

          WHERE tm.project_id = $1
            AND tm.user_id = $2

          LIMIT 1
        `,
        [projectId, userId]
      );

    if (
      existingTeam.rows.length >
      0
    ) {
      const existing =
        existingTeam.rows[0];

      if (
        Number(existing.team_id) ===
        teamId
      ) {
        return res.status(409).json({
          message:
            "Người dùng đã thuộc đội này",
        });
      }

      return res.status(409).json({
        message:
          `Người dùng đã thuộc đội "${existing.team_name}" trong dự án`,
      });
    }

    const result =
      await db.query(
        `
          INSERT INTO team_members (
            team_id,
            project_id,
            user_id
          )
          VALUES ($1, $2, $3)

          RETURNING
            team_id,
            project_id,
            user_id,
            created_at
        `,
        [
          teamId,
          projectId,
          userId,
        ]
      );

    return res
      .status(201)
      .json({
        member: result.rows[0],
      });
  })
);

// ============================================================
// ASSIGNMENT - S-25
// ============================================================

// POST /api/projects/:projectId/tasks/:taskId/assignment
router.post(
  "/:projectId/tasks/:taskId/assignment",
  requireAuth,
  checkProjectAccess,
  assignmentRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    const taskId =
      positiveId(
        req.params.taskId
      );

    const teamId =
      positiveId(
        req.body.team_id
      );

    if (
      !projectId ||
      !taskId ||
      !teamId
    ) {
      return res.status(400).json({
        message:
          "projectId, taskId và team_id phải là số nguyên dương",
      });
    }

    const task =
      await db.query(
        `
          SELECT t.id

          FROM tasks t

          JOIN work_items wi
            ON wi.id =
               t.work_item_id

          WHERE t.id = $1
            AND wi.project_id = $2
        `,
        [taskId, projectId]
      );

    if (
      task.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Không tìm thấy task trong dự án",
      });
    }

    const team =
      await db.query(
        `
          SELECT id
          FROM teams
          WHERE id = $1
            AND project_id = $2
        `,
        [teamId, projectId]
      );

    if (
      team.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Không tìm thấy đội trong dự án",
      });
    }

    const result =
      await db.query(
        `
          INSERT INTO task_assignments (
            task_id,
            team_id,
            assigned_by
          )
          VALUES ($1, $2, $3)

          ON CONFLICT (task_id)

          DO UPDATE SET
            team_id =
              EXCLUDED.team_id,
            assigned_by =
              EXCLUDED.assigned_by,
            assigned_at =
              CURRENT_TIMESTAMP

          RETURNING
            task_id,
            team_id,
            assigned_by,
            assigned_at
        `,
        [
          taskId,
          teamId,
          req.user.id,
        ]
      );

    return res.json({
      assignment:
        result.rows[0],
    });
  })
);

// PATCH /api/projects/:projectId/tasks/:taskId/quantity-plan
router.patch(
  "/:projectId/tasks/:taskId/quantity-plan",
  requireAuth,
  checkProjectAccess,
  assignmentRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    const taskId =
      positiveId(
        req.params.taskId
      );

    const plannedQuantity =
      parseQuantity(
        req.body.planned_quantity
      );

    const quantityUnit =
      typeof req.body
        .quantity_unit === "string"
        ? req.body.quantity_unit.trim()
        : "";

    if (
      !projectId ||
      !taskId
    ) {
      return res.status(400).json({
        message:
          "ID không hợp lệ",
      });
    }

    if (
      plannedQuantity === null
    ) {
      return res.status(400).json({
        message:
          "Khối lượng kế hoạch phải lớn hơn 0, tối đa 9.999.999.999,99 và không quá 2 chữ số thập phân.",
      });
    }

    if (
      !quantityUnit ||
      quantityUnit.length > 30
    ) {
      return res.status(400).json({
        message:
          "Đơn vị khối lượng bắt buộc và không được vượt quá 30 ký tự",
      });
    }

    const result =
      await db.query(
        `
          UPDATE tasks t

          SET
            planned_quantity = $1,
            quantity_unit = $2,
            updated_at =
              CURRENT_TIMESTAMP

          FROM work_items wi

          WHERE t.id = $3
            AND wi.id =
                t.work_item_id
            AND wi.project_id = $4

          RETURNING
            t.id,
            t.name,
            t.planned_quantity,
            t.quantity_unit
        `,
        [
          plannedQuantity,
          quantityUnit,
          taskId,
          projectId,
        ]
      );

    if (
      result.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Không tìm thấy công việc trong dự án",
      });
    }

    return res.json({
      message:
        "Đã cập nhật khối lượng kế hoạch.",
      task: result.rows[0],
    });
  })
);

// ============================================================
// S-26 / T-59 (bổ sung)
// Chỉ huy trưởng / Ban quản lý xem việc của TẤT CẢ đội trong
// tuần, không phải chọn từng đội một như /my-team/tasks.
// Đội trưởng không dùng route này (họ chỉ xem đội của mình).
//
// LƯU Ý THỨ TỰ: phải khai báo TRƯỚC "/:projectId/teams/:teamId/tasks"
// ở dưới, nếu không Express sẽ khớp "all" vào :teamId và trả 400.
// ============================================================

const overviewRoles = allow([
  ROLES.CHI_HUY_TRUONG,
  ROLES.BAN_QUAN_LY,
  ROLES.CHU_DAU_TU,
]);

// GET /api/projects/:projectId/teams/all/tasks
router.get(
  "/:projectId/teams/all/tasks",
  requireAuth,
  checkProjectAccess,
  overviewRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    if (!projectId) {
      return res.status(400).json({
        message:
          "projectId không hợp lệ",
      });
    }

    const weekStart =
      req.query.week_start;

    const weekEnd =
      req.query.week_end;

    const reportDate =
      req.query.report_date;

    if (
      !isValidDateOnly(
        weekStart
      ) ||
      !isValidDateOnly(
        weekEnd
      ) ||
      !isValidDateOnly(
        reportDate
      )
    ) {
      return res.status(400).json({
        message:
          "week_start, week_end và report_date phải có định dạng YYYY-MM-DD hợp lệ",
      });
    }

    if (
      weekStart > weekEnd
    ) {
      return res.status(400).json({
        message:
          "Khoảng tuần không hợp lệ",
      });
    }

    if (
      reportDate < weekStart ||
      reportDate > weekEnd
    ) {
      return res.status(400).json({
        message:
          "report_date phải nằm trong tuần đang xem",
      });
    }

    // Giống /my-team/tasks nhưng KHÔNG lọc theo một team_id —
    // trả việc của mọi đội trong dự án, kèm team_id/team_name
    // trên từng dòng để frontend tự nhóm theo đội.
    const result =
      await db.query(
        `
          SELECT
            t.id AS task_id,
            t.name,
            t.duration_days,
            t.percent_complete,
            t.actual_end_date,

            t.planned_quantity,
            t.quantity_unit,

            wi.id AS work_item_id,
            wi.name
              AS work_item_name,

            ta.team_id,
            tm.name
              AS team_name,

            sr.early_start,
            sr.early_finish,
            sr.is_critical,

            COALESCE(
              today.total_today,
              0
            )::numeric(12,2)::text
              AS reported_today,

            COALESCE(
              all_report.total_reported,
              0
            )::numeric(12,2)::text
              AS cumulative_reported,

            last_report.last_reported_at

          FROM task_assignments ta

          JOIN tasks t
            ON t.id = ta.task_id

          JOIN work_items wi
            ON wi.id =
               t.work_item_id

          JOIN teams tm
            ON tm.id =
               ta.team_id
           AND tm.project_id =
               wi.project_id

          JOIN schedule_results sr
            ON sr.task_id = t.id

          LEFT JOIN LATERAL (
            SELECT
              SUM(qr.quantity)
                AS total_today

            FROM task_quantity_reports qr

            WHERE qr.project_id =
                  wi.project_id
              AND qr.task_id =
                  t.id
              AND qr.team_id =
                  ta.team_id
              AND qr.report_date =
                  $4::date
          ) today ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              SUM(qr.quantity)
                AS total_reported

            FROM task_quantity_reports qr

            WHERE qr.project_id =
                  wi.project_id
              AND qr.task_id =
                  t.id
              AND qr.team_id =
                  ta.team_id
          ) all_report ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              MAX(qr.created_at)
                AS last_reported_at

            FROM task_quantity_reports qr

            WHERE qr.project_id =
                  wi.project_id
              AND qr.task_id =
                  t.id
              AND qr.team_id =
                  ta.team_id
          ) last_report ON TRUE

          WHERE wi.project_id = $1

            -- Không hiện việc đã hoàn thành.
            AND COALESCE(
                  t.percent_complete,
                  0
                ) < 100

            AND t.actual_end_date
                IS NULL

            -- Chỉ việc có lịch và giao
            -- với tuần đang xem.
            AND sr.early_start
                IS NOT NULL

            AND sr.early_start::date
                <= $3::date

            AND COALESCE(
                  sr.early_finish::date,
                  sr.early_start::date
                ) >= $2::date

          ORDER BY
            tm.name,
            sr.early_start
              NULLS LAST,
            t.id
        `,
        [
          projectId,
          weekStart,
          weekEnd,
          reportDate,
        ]
      );

    return res.json({
      week: {
        start: weekStart,
        end: weekEnd,
        report_date:
          reportDate,
      },

      tasks:
        result.rows.map(
          (task) => ({
            ...task,

            over_planned:
              task.planned_quantity !==
                null &&
              Number(
                task.cumulative_reported
              ) >
                Number(
                  task.planned_quantity
                ),
          })
        ),
    });
  })
);

// GET /api/projects/:projectId/teams/:teamId/tasks
router.get(
  "/:projectId/teams/:teamId/tasks",
  requireAuth,
  checkProjectAccess,
  allRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    const teamId =
      positiveId(
        req.params.teamId
      );

    if (
      !projectId ||
      !teamId
    ) {
      return res.status(400).json({
        message:
          "ID dự án hoặc đội không hợp lệ",
      });
    }

    const team =
      await db.query(
        `
          SELECT id
          FROM teams
          WHERE id = $1
            AND project_id = $2
        `,
        [teamId, projectId]
      );

    if (
      team.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Không tìm thấy đội trong dự án",
      });
    }

    const result =
      await db.query(
        `
          SELECT
            t.id AS task_id,
            t.name,
            t.duration_days,
            t.percent_complete,
            t.planned_quantity,
            t.quantity_unit,

            ta.assigned_at,
            ta.assigned_by,

            wi.id AS work_item_id,
            wi.name
              AS work_item_name

          FROM task_assignments ta

          JOIN tasks t
            ON t.id = ta.task_id

          JOIN work_items wi
            ON wi.id =
               t.work_item_id

          WHERE ta.team_id = $1
            AND wi.project_id = $2

          ORDER BY t.id
        `,
        [teamId, projectId]
      );

    return res.json({
      tasks: result.rows,
    });
  })
);

// ============================================================
// S-26 / T-59
// Đội trưởng xem việc của đội trong tuần
// ============================================================

// GET /api/projects/:projectId/my-team/tasks
router.get(
  "/:projectId/my-team/tasks",
  requireAuth,
  checkProjectAccess,
  fieldViewRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    if (!projectId) {
      return res.status(400).json({
        message:
          "projectId không hợp lệ",
      });
    }

    const weekStart =
      req.query.week_start;

    const weekEnd =
      req.query.week_end;

    const reportDate =
      req.query.report_date;

    if (
      !isValidDateOnly(
        weekStart
      ) ||
      !isValidDateOnly(
        weekEnd
      ) ||
      !isValidDateOnly(
        reportDate
      )
    ) {
      return res.status(400).json({
        message:
          "week_start, week_end và report_date phải có định dạng YYYY-MM-DD hợp lệ",
      });
    }

    if (
      weekStart > weekEnd
    ) {
      return res.status(400).json({
        message:
          "Khoảng tuần không hợp lệ",
      });
    }

    if (
      reportDate < weekStart ||
      reportDate > weekEnd
    ) {
      return res.status(400).json({
        message:
          "report_date phải nằm trong tuần đang xem",
      });
    }

    let teamId =
      positiveId(
        req.query.team_id
      );

    // Đội trưởng luôn bị ép về
    // đúng đội của chính mình.
    if (
      req.projectRole ===
      ROLES.DOI_TRUONG
    ) {
      const ownTeam =
        await findUserTeam(
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
    } else if (!teamId) {
      // Không tự động lấy đội đầu tiên.
      return res.status(400).json({
        message:
          "Vui lòng chọn đội cần xem.",
      });
    }

    const teamResult =
      await db.query(
        `
          SELECT
            id,
            name

          FROM teams

          WHERE id = $1
            AND project_id = $2
        `,
        [teamId, projectId]
      );

    if (
      teamResult.rows.length === 0
    ) {
      return res.status(404).json({
        message:
          "Không tìm thấy đội trong dự án",
      });
    }

    const result =
      await db.query(
        `
          SELECT
            t.id AS task_id,
            t.name,
            t.duration_days,
            t.percent_complete,
            t.actual_end_date,

            t.planned_quantity,
            t.quantity_unit,

            wi.id AS work_item_id,
            wi.name
              AS work_item_name,

            ta.team_id,
            tm.name
              AS team_name,

            sr.early_start,
            sr.early_finish,
            sr.is_critical,

            COALESCE(
              today.total_today,
              0
            )::numeric(12,2)::text
              AS reported_today,

            COALESCE(
              all_report.total_reported,
              0
            )::numeric(12,2)::text
              AS cumulative_reported,

            last_report.last_reported_at

          FROM task_assignments ta

          JOIN tasks t
            ON t.id = ta.task_id

          JOIN work_items wi
            ON wi.id =
               t.work_item_id

          JOIN teams tm
            ON tm.id =
               ta.team_id
           AND tm.project_id =
               wi.project_id

          JOIN schedule_results sr
            ON sr.task_id = t.id

          LEFT JOIN LATERAL (
            SELECT
              SUM(qr.quantity)
                AS total_today

            FROM task_quantity_reports qr

            WHERE qr.project_id =
                  wi.project_id
              AND qr.task_id =
                  t.id
              AND qr.team_id =
                  ta.team_id
              AND qr.report_date =
                  $5::date
          ) today ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              SUM(qr.quantity)
                AS total_reported

            FROM task_quantity_reports qr

            WHERE qr.project_id =
                  wi.project_id
              AND qr.task_id =
                  t.id
              AND qr.team_id =
                  ta.team_id
          ) all_report ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              MAX(qr.created_at)
                AS last_reported_at

            FROM task_quantity_reports qr

            WHERE qr.project_id =
                  wi.project_id
              AND qr.task_id =
                  t.id
              AND qr.team_id =
                  ta.team_id
          ) last_report ON TRUE

          WHERE wi.project_id = $1
            AND ta.team_id = $2

            -- Không hiện việc đã hoàn thành.
            AND COALESCE(
                  t.percent_complete,
                  0
                ) < 100

            AND t.actual_end_date
                IS NULL

            -- Chỉ việc có lịch và giao
            -- với tuần đang xem.
            AND sr.early_start
                IS NOT NULL

            AND sr.early_start::date
                <= $4::date

            AND COALESCE(
                  sr.early_finish::date,
                  sr.early_start::date
                ) >= $3::date

          ORDER BY
            sr.early_start
              NULLS LAST,
            t.id
        `,
        [
          projectId,
          teamId,
          weekStart,
          weekEnd,
          reportDate,
        ]
      );

    return res.json({
      team:
        teamResult.rows[0],

      week: {
        start: weekStart,
        end: weekEnd,
        report_date:
          reportDate,
      },

      tasks:
        result.rows.map(
          (task) => ({
            ...task,

            over_planned:
              task.planned_quantity !==
                null &&
              Number(
                task.cumulative_reported
              ) >
                Number(
                  task.planned_quantity
                ),
          })
        ),
    });
  })
);

// ============================================================
// QUANTITY REPORT
// ============================================================

// POST /api/projects/:projectId/tasks/:taskId/quantity-reports
router.post(
  "/:projectId/tasks/:taskId/quantity-reports",
  requireAuth,
  checkProjectAccess,
  allow([
    ROLES.DOI_TRUONG,
  ]),
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    const taskId =
      positiveId(
        req.params.taskId
      );

    const quantity =
      parseQuantity(
        req.body.quantity
      );

    const reportDate =
      req.body.report_date;

    if (
      !projectId ||
      !taskId
    ) {
      return res.status(400).json({
        message:
          "projectId hoặc taskId không hợp lệ",
      });
    }

    if (
      quantity === null
    ) {
      return res.status(400).json({
        message:
          "Khối lượng phải lớn hơn 0, tối đa 9.999.999.999,99 và không quá 2 chữ số thập phân.",
      });
    }

    if (
      !isValidDateOnly(
        reportDate
      )
    ) {
      return res.status(400).json({
        message:
          "Ngày báo cáo không hợp lệ.",
      });
    }

    const ownTeam =
      await findUserTeam(
        projectId,
        req.user.id
      );

    if (!ownTeam) {
      return res.status(403).json({
        message:
          "Đội trưởng chưa thuộc đội thi công nào",
      });
    }

    const client =
      await db.connect();

    try {
      await client.query("BEGIN");

      // Task bắt buộc thuộc đúng
      // project và đúng đội.
      const taskResult =
        await client.query(
          `
            SELECT
              t.id,
              t.name,
              t.planned_quantity,
              t.quantity_unit

            FROM tasks t

            JOIN work_items wi
              ON wi.id =
                 t.work_item_id

            JOIN task_assignments ta
              ON ta.task_id =
                 t.id

            WHERE t.id = $1
              AND wi.project_id = $2
              AND ta.team_id = $3

            FOR UPDATE OF t
          `,
          [
            taskId,
            projectId,
            ownTeam.id,
          ]
        );

      if (
        taskResult.rows.length ===
        0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(403).json({
          message:
            "Công việc này không được giao cho đội của bạn",
        });
      }

      const task =
        taskResult.rows[0];

      const insertResult =
        await client.query(
          `
            INSERT INTO task_quantity_reports (
              project_id,
              task_id,
              team_id,
              reported_by,
              quantity,
              report_date
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6::date
            )

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
            reportDate,
          ]
        );

      // SUM vẫn giữ NUMERIC,
      // không cast float.
      const totalResult =
        await client.query(
          `
            SELECT
              COALESCE(
                SUM(quantity),
                0
              )::numeric(12,2)::text
                AS cumulative_reported,

              COALESCE(
                SUM(quantity)
                  FILTER (
                    WHERE report_date =
                          $4::date
                  ),
                0
              )::numeric(12,2)::text
                AS reported_today

            FROM task_quantity_reports

            WHERE project_id = $1
              AND task_id = $2
              AND team_id = $3
          `,
          [
            projectId,
            taskId,
            ownTeam.id,
            reportDate,
          ]
        );

      const cumulativeReported =
        totalResult.rows[0]
          .cumulative_reported;

      const reportedToday =
        totalResult.rows[0]
          .reported_today;

      const plannedQuantity =
        task.planned_quantity ===
        null
          ? null
          : String(
              task.planned_quantity
            );

      // Chỉ dùng Number để so sánh;
      // phép SUM vẫn do PostgreSQL
      // NUMERIC thực hiện.
      const exceeded =
        plannedQuantity !== null &&
        Number(
          cumulativeReported
        ) >
          Number(
            plannedQuantity
          );

      await client.query(
        "COMMIT"
      );

      return res
        .status(201)
        .json({
          message: exceeded
            ? "Đã lưu báo cáo. Cảnh báo: khối lượng lũy kế đã vượt khối lượng công việc."
            : "Đã lưu báo cáo khối lượng.",

          warning: exceeded
            ? "Khối lượng lũy kế vượt khối lượng kế hoạch nhưng báo cáo vẫn được ghi nhận."
            : null,

          report:
            insertResult.rows[0],

          task: {
            task_id: task.id,
            name: task.name,

            planned_quantity:
              plannedQuantity,

            quantity_unit:
              task.quantity_unit,

            reported_today:
              reportedToday,

            cumulative_reported:
              cumulativeReported,

            over_planned:
              exceeded,
          },
        });
    } catch (error) {
      await client.query(
        "ROLLBACK"
      );

      throw error;
    } finally {
      client.release();
    }
  })
);

// ============================================================
// REPORT HISTORY
// ============================================================

// GET /api/projects/:projectId/tasks/:taskId/quantity-reports
router.get(
  "/:projectId/tasks/:taskId/quantity-reports",
  requireAuth,
  checkProjectAccess,
  fieldViewRoles,
  asyncHandler(async (req, res) => {
    const projectId =
      positiveId(
        req.params.projectId
      );

    const taskId =
      positiveId(
        req.params.taskId
      );

    if (
      !projectId ||
      !taskId
    ) {
      return res.status(400).json({
        message:
          "ID không hợp lệ",
      });
    }

    // Luôn xác nhận task nằm
    // trong project hiện tại.
    const taskExists =
      await db.query(
        `
          SELECT t.id

          FROM tasks t

          JOIN work_items wi
            ON wi.id =
               t.work_item_id

          WHERE t.id = $1
            AND wi.project_id = $2
        `,
        [taskId, projectId]
      );

    if (
      taskExists.rows.length ===
      0
    ) {
      return res.status(404).json({
        message:
          "Không tìm thấy công việc trong dự án",
      });
    }

    const params = [
      projectId,
      taskId,
    ];

    let teamFilter = "";

    // Đội trưởng chỉ xem lịch sử
    // công việc của đúng đội mình.
    if (
      req.projectRole ===
      ROLES.DOI_TRUONG
    ) {
      const ownTeam =
        await findUserTeam(
          projectId,
          req.user.id
        );

      if (!ownTeam) {
        return res.status(403).json({
          message:
            "Đội trưởng chưa thuộc đội thi công nào",
        });
      }

      const assigned =
        await db.query(
          `
            SELECT 1

            FROM task_assignments ta

            JOIN tasks t
              ON t.id =
                 ta.task_id

            JOIN work_items wi
              ON wi.id =
                 t.work_item_id

            WHERE ta.task_id = $1
              AND ta.team_id = $2
              AND wi.project_id = $3

            LIMIT 1
          `,
          [
            taskId,
            ownTeam.id,
            projectId,
          ]
        );

      if (
        assigned.rows.length === 0
      ) {
        return res.status(403).json({
          message:
            "Công việc này không được giao cho đội của bạn",
        });
      }

      params.push(ownTeam.id);

      teamFilter =
        "AND qr.team_id = $3";
    }

    const result =
      await db.query(
        `
          SELECT
            qr.id,
            qr.quantity,
            qr.report_date,
            qr.created_at,
            qr.reported_by,

            u.name
              AS reported_by_name,

            tm.id
              AS team_id,

            tm.name
              AS team_name

          FROM task_quantity_reports qr

          JOIN tasks t
            ON t.id =
               qr.task_id

          JOIN work_items wi
            ON wi.id =
               t.work_item_id
           AND wi.project_id =
               qr.project_id

          JOIN users u
            ON u.id =
               qr.reported_by

          JOIN teams tm
            ON tm.id =
               qr.team_id
           AND tm.project_id =
               qr.project_id

          WHERE qr.project_id = $1
            AND qr.task_id = $2

            ${teamFilter}

          ORDER BY
            qr.report_date DESC,
            qr.created_at DESC
        `,
        params
      );

    return res.json({
      reports: result.rows,
    });
  })
);

// ============================================================
// QUAN TRỌNG:
// module.exports chỉ nằm MỘT LẦN và ở cuối file.
// ============================================================

module.exports = router;