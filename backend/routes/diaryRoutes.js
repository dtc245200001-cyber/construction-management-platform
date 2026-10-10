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

      // Check lock status
      const lockCheck = await client.query(
        `SELECT is_locked FROM daily_log_locks WHERE project_id = $1 AND log_date = ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`,
        [projectId, entryAtVal]
      );
      if (lockCheck.rows.length > 0 && lockCheck.rows[0].is_locked) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "Nhật ký thi công của ngày này đã bị khóa, không thể thêm mới." });
      }


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

/**
 * @swagger
 * /api/projects/{projectId}/diary-locks/{date}:
 *   get:
 *     summary: Lấy trạng thái khóa nhật ký của ngày
 *     tags: [Diary]
 */
router.get(
  "/:projectId/diary-locks/:date",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ message: "Ngày không hợp lệ" });

    const result = await db.query(
      "SELECT * FROM daily_log_locks WHERE project_id = $1 AND log_date = $2",
      [projectId, req.params.date]
    );
    if (result.rows.length === 0) {
      return res.json({ is_locked: false });
    }
    return res.json(result.rows[0]);
  })
);

/**
 * @swagger
 * /api/projects/{projectId}/diary-locks/{date}/lock:
 *   post:
 *     summary: Khóa nhật ký
 *     tags: [Diary]
 */
router.post(
  "/:projectId/diary-locks/:date/lock",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.KY_SU_GIAM_SAT]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ message: "Ngày không hợp lệ" });

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (req.params.date >= todayStr) {
      return res.status(400).json({ message: "Chỉ được khóa nhật ký của ngày đã qua" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO daily_log_locks (project_id, log_date, locked_by, is_locked, locked_at) 
         VALUES ($1, $2, $3, true, NOW())
         ON CONFLICT (project_id, log_date) 
         DO UPDATE SET is_locked = true, locked_by = $3, locked_at = NOW() 
         RETURNING *`,
        [projectId, req.params.date, req.user.id]
      );
      await client.query("COMMIT");
      try { await logAudit({ userId: req.user.id, action: "LOCK_DIARY", entity: "daily_log_locks", entityId: result.rows[0].id, details: { date: req.params.date }}); } catch(e){ console.error("Audit error:", e); }
      return res.json(result.rows[0]);
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
 * /api/projects/{projectId}/diary-locks/{date}/unlock:
 *   post:
 *     summary: Mở khóa nhật ký
 *     tags: [Diary]
 */
router.post(
  "/:projectId/diary-locks/:date/unlock",
  requireAuth,
  checkProjectAccess,
  allow([ROLES.BAN_QUAN_LY]),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ message: "Ngày không hợp lệ" });

    const { reason } = req.body;
    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({ message: "Phải nhập lý do mở khóa" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE daily_log_locks SET is_locked = false, unlocked_by = $1, unlocked_at = NOW(), unlock_reason = $2
         WHERE project_id = $3 AND log_date = $4 RETURNING *`,
        [req.user.id, reason.trim(), projectId, req.params.date]
      );
      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Nhật ký chưa được khóa hoặc không tìm thấy trạng thái khóa" });
      }
      await client.query("COMMIT");
      try { await logAudit({ userId: req.user.id, action: "UNLOCK_DIARY", entity: "daily_log_locks", entityId: result.rows[0].id, details: { date: req.params.date, reason: reason.trim() }}); } catch(e){ console.error("Audit error:", e); }
      return res.json(result.rows[0]);
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
 * /api/projects/{projectId}/diary-locks/{date}/history:
 *   get:
 *     summary: Lấy lịch sử khóa/mở khóa của ngày
 *     tags: [Diary]
 */
router.get(
  "/:projectId/diary-locks/:date/history",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) return res.status(400).json({ message: "Ngày không hợp lệ" });

    const lockResult = await db.query(
      "SELECT id FROM daily_log_locks WHERE project_id = $1 AND log_date = $2",
      [projectId, req.params.date]
    );

    if (lockResult.rows.length === 0) return res.json([]);

    const lockId = lockResult.rows[0].id;
    const historyResult = await db.query(
      `SELECT a.*, u.name as user_name 
       FROM audit_logs a 
       JOIN users u ON u.id = a.user_id 
       WHERE a.entity = 'daily_log_locks' AND a.entity_id = $1 
       ORDER BY a.created_at DESC`,
      [lockId]
    );

    return res.json(historyResult.rows);
  })
);

module.exports = router;
