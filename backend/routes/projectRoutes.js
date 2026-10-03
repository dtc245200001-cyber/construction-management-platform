const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  allow,
  createProjectRouter,
} = require("../middleware/projectAccess");
const { ROLES } = require("../utils/constants");
const { getScheduleResults } = require("../services/scheduleQuery");
const { calculateAndSaveSchedule } = require("../services/scheduleCalculation");

const router = createProjectRouter();

// GET /api/projects - Danh sÃƒÂ¡ch dÃ¡Â»Â± ÃƒÂ¡n mÃƒÂ  user tham gia
router.get(
  "/",
  requireAuth,
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT p.id, p.name, p.code, p.location, p.status, p.start_date, p.sprint_length_weeks, p.actual_progress, p.planned_progress, p.created_at, p.updated_at, pm.role, pm.last_opened_at,
         (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id) as member_count
         FROM projects p
         JOIN project_members pm ON p.id = pm.project_id
         WHERE pm.user_id = $1
         ORDER BY pm.last_opened_at DESC NULLS LAST, p.created_at DESC`,
        [req.session.user.id]
      );

      return res.json({
        projects: result.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

const requireSystemAdmin = require("../middleware/systemAdmin");
const { createAuditMiddleware } = require("../utils/auditLogger");

// POST /api/projects - TÃ¡ÂºÂ¡o dÃ¡Â»Â± ÃƒÂ¡n mÃ¡Â»â€ºi
router.post(
  "/",
  requireSystemAdmin,
  createAuditMiddleware("CREATE_PROJECT", "projects"),
  async (req, res, next) => {
    const {
      name,
      code,
      location,
      start_date,
      sprint_length_weeks,
    } = req.body;

    if (!name || name.length > 255) {
      return res.status(400).json({
        message: "TÃƒÂªn dÃ¡Â»Â± ÃƒÂ¡n lÃƒÂ  bÃ¡ÂºÂ¯t buÃ¡Â»â„¢c vÃƒÂ  khÃƒÂ´ng quÃƒÂ¡ 255 kÃƒÂ½ tÃ¡Â»Â±",
      });
    }

    if (!code) {
      return res.status(400).json({
        message: "MÃƒÂ£ dÃ¡Â»Â± ÃƒÂ¡n lÃƒÂ  bÃ¡ÂºÂ¯t buÃ¡Â»â„¢c",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Check unique code
      const exist = await client.query(
        "SELECT id FROM projects WHERE code = $1",
        [code]
      );

      if (exist.rows.length > 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message: "MÃƒÂ£ dÃ¡Â»Â± ÃƒÂ¡n Ã„â€˜ÃƒÂ£ tÃ¡Â»â€œn tÃ¡ÂºÂ¡i",
        });
      }

      const projectResult = await client.query(
        `INSERT INTO projects
         (name, code, location, start_date, sprint_length_weeks, status, actual_progress, planned_progress)
         VALUES ($1, $2, $3, $4, $5, 'ChuÃ¡ÂºÂ©n bÃ¡Â»â€¹', 0, 0)
         RETURNING *`,
        [
          name,
          code,
          location || null,
          start_date || null,
          sprint_length_weeks || 1,
        ]
      );

      const newProject = projectResult.rows[0];

      await client.query(
        `INSERT INTO project_members
         (project_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [newProject.id, req.session.user.id, ROLES.BAN_QUAN_LY]
      );

      await client.query("COMMIT");

      return res.status(201).json({
        message: "TÃ¡ÂºÂ¡o dÃ¡Â»Â± ÃƒÂ¡n thÃƒÂ nh cÃƒÂ´ng",
        project: newProject,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

// GET /api/projects/:projectId/schedule-results
router.get(
  "/:projectId/schedule-results",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);

      if (!Number.isInteger(projectId) || projectId <= 0) {
        return res.status(400).json({
          message: "projectId khÃƒÂ´ng hÃ¡Â»Â£p lÃ¡Â»â€¡",
        });
      }

      let criticalOnly = null;

      if (req.query.critical !== undefined) {
        if (
          req.query.critical !== "true" &&
          req.query.critical !== "false"
        ) {
          return res.status(400).json({
            message: "critical phÃ¡ÂºÂ£i lÃƒÂ  true hoÃ¡ÂºÂ·c false",
          });
        }

        criticalOnly = req.query.critical === "true";
      }

      const results = await getScheduleResults(
        projectId,
        criticalOnly
      );

      return res.json({
        projectId,
        count: results.length,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:projectId
router.get(
  "/:projectId",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT id, name, location, start_date, created_at, updated_at
         FROM projects
         WHERE id = $1`,
        [req.params.projectId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y dÃ¡Â»Â± ÃƒÂ¡n",
        });
      }

      return res.json({
        project: result.rows[0],
        membership: req.projectRole,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/open
router.post(
  "/:projectId/open",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      await db.query(
        `UPDATE project_members
         SET last_opened_at = CURRENT_TIMESTAMP
         WHERE project_id = $1 AND user_id = $2`,
        [req.params.projectId, req.session.user.id]
      );

      return res.json({
        message: "Opened successfully",
        role: req.projectRole,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/projects/:projectId/members
router.get(
  "/:projectId/members",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT u.id, u.name, u.email, pm.role,
                u.failed_login_attempts,
                u.locked_until
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
         WHERE pm.project_id = $1
         ORDER BY pm.created_at ASC`,
        [req.params.projectId]
      );

      const invResult = await db.query(
        `SELECT id, email, project_role as role, token, created_at
         FROM invitations
         WHERE project_id = $1
           AND used_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP`,
        [req.params.projectId]
      );

      return res.json({
        members: result.rows,
        invitations: invResult.rows,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/members
router.post(
  "/:projectId/members",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU]),
  createAuditMiddleware("ADD_PROJECT_MEMBER", "project_members"),
  async (req, res, next) => {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({
        message: "Vui lÃƒÂ²ng cung cÃ¡ÂºÂ¥p email vÃƒÂ  vai trÃƒÂ²",
      });
    }

    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({
        message: "Vai trÃƒÂ² khÃƒÂ´ng hÃ¡Â»Â£p lÃ¡Â»â€¡",
      });
    }

    try {
      // 1. TÃƒÂ¬m user theo email
      const userResult = await db.query(
        "SELECT id, name FROM users WHERE email = $1",
        [email]
      );

      if (userResult.rows.length === 0) {
        // User does not exist in the system. Create an invitation instead.
        const crypto = require("crypto");
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        );

        await db.query(
          `INSERT INTO invitations
           (email, token, invited_by, expires_at, project_id, project_role)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            email,
            token,
            req.session.user.id,
            expiresAt,
            req.params.projectId,
            role,
          ]
        );

        console.log(
          `[EMAIL MOCK] GÃ¡Â»Â­i thÃ†Â° mÃ¡Â»Âi tham gia dÃ¡Â»Â± ÃƒÂ¡n Ã„â€˜Ã¡ÂºÂ¿n ${email}. Link: http://localhost:5173/register?token=${token}`
        );

        return res.status(201).json({
          message:
            "NgÃ†Â°Ã¡Â»Âi dÃƒÂ¹ng chÃ†Â°a cÃƒÂ³ tÃƒÂ i khoÃ¡ÂºÂ£n. Ã„ÂÃƒÂ£ gÃ¡Â»Â­i thÃ†Â° mÃ¡Â»Âi tham gia hÃ¡Â»â€¡ thÃ¡Â»â€˜ng vÃƒÂ  dÃ¡Â»Â± ÃƒÂ¡n.",
        });
      }

      const userId = userResult.rows[0].id;

      // 2. KiÃ¡Â»Æ’m tra user Ã„â€˜ÃƒÂ£ trong dÃ¡Â»Â± ÃƒÂ¡n chÃ†Â°a
      const exist = await db.query(
        `SELECT id
         FROM project_members
         WHERE project_id = $1 AND user_id = $2`,
        [req.params.projectId, userId]
      );

      if (exist.rows.length > 0) {
        // CÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t role
        await db.query(
          `UPDATE project_members
           SET role = $1
           WHERE project_id = $2 AND user_id = $3`,
          [role, req.params.projectId, userId]
        );

        return res.json({
          message: "Ã„ÂÃƒÂ£ cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t vai trÃƒÂ² cÃ¡Â»Â§a thÃƒÂ nh viÃƒÂªn",
        });
      }

      // 3. ThÃƒÂªm vÃƒÂ o dÃ¡Â»Â± ÃƒÂ¡n
      await db.query(
        `INSERT INTO project_members
         (project_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [req.params.projectId, userId, role]
      );

      return res.status(201).json({
        message: "Ã„ÂÃƒÂ£ thÃƒÂªm thÃƒÂ nh viÃƒÂªn vÃƒÂ o dÃ¡Â»Â± ÃƒÂ¡n",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/members/:userId/unlock - MÃ¡Â»Å¸ khÃƒÂ³a tÃƒÂ i khoÃ¡ÂºÂ£n thÃƒÂ nh viÃƒÂªn
router.post(
  "/:projectId/members/:userId/unlock",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU]),
  async (req, res, next) => {
    try {
      // KiÃ¡Â»Æ’m tra user cÃƒÂ³ trong dÃ¡Â»Â± ÃƒÂ¡n nÃƒÂ y khÃƒÂ´ng
      const member = await db.query(
        `SELECT u.id, u.email, u.failed_login_attempts, u.locked_until
         FROM users u
         JOIN project_members pm ON u.id = pm.user_id
         WHERE pm.project_id = $1 AND u.id = $2`,
        [req.params.projectId, req.params.userId]
      );

      if (member.rows.length === 0) {
        return res.status(404).json({
          message: "KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y thÃƒÂ nh viÃƒÂªn nÃƒÂ y trong dÃ¡Â»Â± ÃƒÂ¡n",
        });
      }

      await db.query(
        `UPDATE users
         SET failed_login_attempts = 0,
             locked_until = NULL
         WHERE id = $1`,
        [req.params.userId]
      );

      return res.json({
        message: "Ã„ÂÃƒÂ£ mÃ¡Â»Å¸ khÃƒÂ³a vÃƒÂ  reset sÃ¡Â»â€˜ lÃ¡ÂºÂ§n Ã„â€˜Ã„Æ’ng nhÃ¡ÂºÂ­p sai vÃ¡Â»Â 0",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/projects/:projectId/schedule/recalculate
router.post(
  "/:projectId/schedule/recalculate",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  async (req, res, next) => {
    try {
      const projectId = Number(req.params.projectId);

      if (!Number.isInteger(projectId) || projectId <= 0) {
        return res.status(400).json({
          message: "projectId khÃ´ng h?p l?",
        });
      }

      const result = await calculateAndSaveSchedule(projectId);

      return res.json({
        message: "ÃÃ£ tÃ­nh vÃ  luu k?t qu? l?ch",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
