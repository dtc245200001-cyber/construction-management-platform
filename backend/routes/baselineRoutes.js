"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, allow, createProjectRouter } = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { ROLES } = require("../utils/constants");

const router = createProjectRouter();

// POST /api/projects/:projectId/baselines  — chốt kế hoạch gốc
router.post(
  "/:projectId/baselines",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]), // NFR: chỉ ban quản lý được chốt
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Khoá dòng dự án để hai lần chốt đồng thời không đè nhau
      await client.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [projectId]);

      // Bản cũ chuyển thành lịch sử
      await client.query(
        "UPDATE baselines SET is_active = false WHERE project_id = $1 AND is_active = true",
        [projectId]
      );

      const baseline = await client.query(
        `INSERT INTO baselines (project_id, created_by)
         VALUES ($1, $2)
         RETURNING id, project_id, created_by, created_at, is_active`,
        [projectId, req.user.id]
      );

      // Chép bốn mốc của mọi task trong dự án
      const items = await client.query(
        `INSERT INTO baseline_items
           (baseline_id, task_id, early_start, early_finish, late_start, late_finish)
         SELECT $1, sr.task_id, sr.early_start, sr.early_finish, sr.late_start, sr.late_finish
         FROM schedule_results sr
         JOIN tasks t ON t.id = sr.task_id
         JOIN work_items wi ON wi.id = t.work_item_id
         WHERE wi.project_id = $2
           AND sr.early_start IS NOT NULL`,
        [baseline.rows[0].id, projectId]
      );

      if (items.rowCount === 0) {
        // Chưa tính tiến độ → không chốt bản rỗng; ROLLBACK cũng trả lại bản cũ
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Chưa có kết quả tiến độ để chốt. Hãy tính tiến độ trước.",
        });
      }

      await client.query("COMMIT");
      return res.status(201).json({ ...baseline.rows[0], task_count: items.rowCount });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

// GET /api/projects/:projectId/baselines — lịch sử chốt (ai, lúc nào)
router.get(
  "/:projectId/baselines",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const result = await db.query(
      `SELECT b.id, b.created_by, u.name AS created_by_name, b.created_at, b.is_active,
              (SELECT COUNT(*) FROM baseline_items bi WHERE bi.baseline_id = b.id)::int AS task_count
       FROM baselines b
       JOIN users u ON u.id = b.created_by
       WHERE b.project_id = $1
       ORDER BY b.created_at DESC, b.id DESC`,
      [projectId]
    );
    return res.json(result.rows);
  })
);

module.exports = router;