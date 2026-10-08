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
