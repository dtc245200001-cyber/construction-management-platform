"use strict";

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, allow, createProjectRouter } = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { ROLES } = require("../utils/constants");
const { validateCreateDiaryEntry, validateGetDiaryEntries } = require("../utils/diaryValidators");
const { logAudit } = require("../utils/auditLogger");

const router = createProjectRouter();

/**
 * @swagger
 * /api/projects/{projectId}/diary-entries:
 *   post:
 *     summary: Tạo mục nhật ký mới
 *     tags: [Diary]
 */
router.post(
  "/:projectId/diary-entries",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.KY_SU_GIAM_SAT, ROLES.CHI_HUY_TRUONG, ROLES.BAN_QUAN_LY, ROLES.DOI_TRUONG]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const errors = validateCreateDiaryEntry(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors });
    }

    const { work_item_id, content, entry_at, client_id } = req.body;
    const entryAtVal = entry_at ? new Date(entry_at).toISOString() : new Date().toISOString();

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Verify work_item_id exists and belongs to project
      const wiCheck = await client.query(
        "SELECT id, name, code FROM work_items WHERE id = $1 AND project_id = $2",
        [work_item_id, projectId]
      );
      if (wiCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(422).json({ code: "INVALID_WORK_ITEM", message: "Hạng mục không tồn tại hoặc không thuộc dự án này" });
      }

      let insertedRow;

      // Handle idempotency with client_id
      if (client_id) {
        const existing = await client.query(
          `SELECT d.*, w.name AS work_item_name, w.code AS work_item_code, u.name AS created_by_name 
           FROM diary_entries d
           JOIN work_items w ON w.id = d.work_item_id
           JOIN users u ON u.id = d.created_by
           WHERE d.project_id = $1 AND d.client_id = $2`,
          [projectId, client_id]
        );
        if (existing.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(200).json(existing.rows[0]);
        }
      }

      const insertRes = await client.query(
        `INSERT INTO diary_entries (project_id, work_item_id, content, entry_at, created_by, client_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [projectId, work_item_id, content.trim(), entryAtVal, req.user.id, client_id || null]
      );

      const newEntry = insertRes.rows[0];

      // Join to get extra fields
      const finalRes = await client.query(
        `SELECT d.*, w.name AS work_item_name, w.code AS work_item_code, u.name AS created_by_name 
         FROM diary_entries d
         JOIN work_items w ON w.id = d.work_item_id
         JOIN users u ON u.id = d.created_by
         WHERE d.id = $1`,
        [newEntry.id]
      );

      insertedRow = finalRes.rows[0];

      await client.query("COMMIT");

      // log audit
      try {
        await logAudit({ userId: req.user.id, action: "CREATE_DIARY_ENTRY", entity: "diary_entries", entityId: insertedRow.id });
      } catch (e) {
        console.error("Audit log failed:", e);
      }

      return res.status(201).json(insertedRow);
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
 * /api/projects/{projectId}/diary-entries:
 *   get:
 *     summary: Lấy danh sách nhật ký
 *     tags: [Diary]
 */
router.get(
  "/:projectId/diary-entries",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const { errors, params } = validateGetDiaryEntries(req.query);
    if (errors.length > 0) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors });
    }

    const { limit, offset } = params;
    
    let whereClause = "d.project_id = $1";
    const queryParams = [projectId];
    let paramIndex = 2;

    if (req.query.date) {
      whereClause += ` AND d.entry_date = $${paramIndex++}`;
      queryParams.push(req.query.date);
    } else if (req.query.from || req.query.to) {
      if (req.query.from) {
        whereClause += ` AND d.entry_date >= $${paramIndex++}`;
        queryParams.push(req.query.from);
      }
      if (req.query.to) {
        whereClause += ` AND d.entry_date <= $${paramIndex++}`;
        queryParams.push(req.query.to);
      }
    }

    if (req.query.work_item_id) {
      whereClause += ` AND d.work_item_id = $${paramIndex++}`;
      queryParams.push(parseInt(req.query.work_item_id, 10));
    }

    const countRes = await db.query(
      `SELECT COUNT(*) FROM diary_entries d WHERE ${whereClause}`,
      queryParams
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await db.query(
      `SELECT d.*, w.name AS work_item_name, w.code AS work_item_code, u.name AS created_by_name 
       FROM diary_entries d
       JOIN work_items w ON w.id = d.work_item_id
       JOIN users u ON u.id = d.created_by
       WHERE ${whereClause}
       ORDER BY d.entry_at DESC, d.id DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...queryParams, limit, offset]
    );

    return res.json({
      projectId,
      count: dataRes.rows.length,
      total,
      limit,
      offset,
      data: dataRes.rows
    });
  })
);

module.exports = router;
