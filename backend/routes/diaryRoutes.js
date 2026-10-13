"use strict";

const multer = require("multer");
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, requirePermission, createProjectRouter } = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const {
  validateCreateDiaryEntry,
  validateGetDiaryEntries,
  validateUpdateDiaryEntry,
} = require("../utils/diaryValidators");
const { logAudit } = require("../utils/auditLogger");

const router = createProjectRouter();
const diaryImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedMimeTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."));
    }
  },
});
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  // Giữ 4 role như hành vi cũ (ghi chú lệch đặc tả trong permissions.js).
  requirePermission("site_log.create"),
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

      // Idempotency theo client_id (T-70/S-30): INSERT trực tiếp, dựa vào
      // UNIQUE constraint diary_entries_client_id_idx ở tầng DB. Nếu 2 request
      // cùng client_id vào đồng thời, bên thua ăn lỗi 23505 thì query lại bản
      // ghi đã có và trả 200 như mới tạo (client coi là đã đồng bộ).
      // KHÔNG kiểm tra bằng SELECT-rồi-INSERT (có race condition).
      const fetchRowById = async (entryId) => {
        const finalRes = await client.query(
          `SELECT d.*, w.name AS work_item_name, w.code AS work_item_code,
                  u.name AS created_by_name, u2.name AS updated_by_name
           FROM diary_entries d
           JOIN work_items w ON w.id = d.work_item_id
           JOIN users u ON u.id = d.created_by
           LEFT JOIN users u2 ON u2.id = d.updated_by
           WHERE d.id = $1`,
          [entryId]
        );
        return finalRes.rows[0];
      };

      try {
        const insertRes = await client.query(
          `INSERT INTO diary_entries (project_id, work_item_id, content, entry_at, created_by, updated_by, version, client_id)
           VALUES ($1, $2, $3, $4, $5, $5, 1, $6)
           RETURNING *`,
          [projectId, work_item_id, content.trim(), entryAtVal, req.user.id, client_id || null]
        );
        insertedRow = await fetchRowById(insertRes.rows[0].id);
      } catch (insertError) {
        // Sau lỗi unique_violation, transaction ở trạng thái aborted — bắt buộc
        // ROLLBACK trước khi SELECT lại, rồi mở transaction mới cho câu SELECT.
        const isClientIdConflict =
          insertError &&
          insertError.code === "23505" &&
          (insertError.constraint === "diary_entries_client_id_idx" ||
            String(insertError.message || "").includes("diary_entries_client_id_idx"));
        if (!client_id || !isClientIdConflict) throw insertError;
        await client.query("ROLLBACK");
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT d.*, w.name AS work_item_name, w.code AS work_item_code,
                  u.name AS created_by_name, u2.name AS updated_by_name
           FROM diary_entries d
           JOIN work_items w ON w.id = d.work_item_id
           JOIN users u ON u.id = d.created_by
           LEFT JOIN users u2 ON u2.id = d.updated_by
           WHERE d.project_id = $1 AND d.client_id = $2`,
          [projectId, client_id]
        );
        if (existing.rows.length === 0) throw insertError;
        await client.query("ROLLBACK");
        return res.status(200).json(existing.rows[0]);
      }

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
  requirePermission("site_log.view"),
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
      `SELECT d.*, w.name AS work_item_name, w.code AS work_item_code,
              u.name AS created_by_name, u2.name AS updated_by_name,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', a.id,
                  'file_name', a.file_name,
                  'file_size', a.file_size,
                  'mime_type', a.mime_type,
                  'created_at', a.created_at,
                  'url', '/api/projects/' || d.project_id || '/diary-entries/' || d.id || '/attachments/' || a.id
                ) ORDER BY a.id)
                FROM diary_entry_attachments a
                WHERE a.diary_entry_id = d.id
              ), '[]'::json) AS attachments
       FROM diary_entries d
       JOIN work_items w ON w.id = d.work_item_id
       JOIN users u ON u.id = d.created_by
       LEFT JOIN users u2 ON u2.id = d.updated_by
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
 * /api/projects/{projectId}/diary-entries/{entryId}:
 *   delete:
 *     summary: Xóa một mục nhật ký
 *     tags: [Diary]
 */
router.delete(
  "/:projectId/diary-entries/:entryId",
  requireAuth,
  checkProjectAccess,
  requirePermission("site_log.create"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const entryId = parsePositiveInt(req.params.entryId);
    if (!projectId || !entryId) {
      return res.status(400).json({ message: "Tham số không hợp lệ" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Tìm bản ghi nhật ký
      const entryRes = await client.query(
        "SELECT * FROM diary_entries WHERE id = $1 AND project_id = $2",
        [entryId, projectId]
      );
      if (entryRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy mục nhật ký cần xóa" });
      }
      const entry = entryRes.rows[0];

      // Kiểm tra trạng thái khóa của ngày
      const entryDate = entry.entry_date || (entry.entry_at ? new Date(entry.entry_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) : null);
      if (entryDate) {
        const lockCheck = await client.query(
          "SELECT is_locked FROM daily_log_locks WHERE project_id = $1 AND log_date = $2",
          [projectId, entryDate]
        );
        if (lockCheck.rows.length > 0 && lockCheck.rows[0].is_locked) {
          await client.query("ROLLBACK");
          return res.status(403).json({ message: "Nhật ký của ngày này đã bị khóa, không thể xóa." });
        }
      }

      // Quyền: Admin, người tạo, hoặc chỉ huy trưởng / ban quản lý
      const isCreator = Number(entry.created_by) === Number(req.user.id);
      const isAdmin = Boolean(req.user.is_system_admin);
      const isManager = ["chi_huy_truong", "ban_quan_ly"].includes(req.projectRole);

      if (!isCreator && !isAdmin && !isManager) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "Bạn chỉ có thể xóa nhật ký do chính mình tạo ra hoặc có quyền quản trị dự án" });
      }

      // Xóa các attachments liên quan (hoặc để cascade)
      await client.query("DELETE FROM diary_entry_attachments WHERE diary_entry_id = $1", [entryId]);

      // Xóa diary entry
      await client.query("DELETE FROM diary_entries WHERE id = $1", [entryId]);

      await client.query("COMMIT");

      try {
        await logAudit({
          userId: req.user.id,
          action: "DELETE_DIARY_ENTRY",
          entity: "diary_entries",
          entityId: entryId,
          details: {
            content: entry.content?.slice(0, 100),
            work_item_id: entry.work_item_id,
            date: entryDate,
          },
        });
      } catch (auditErr) {
        console.error("Audit error:", auditErr);
      }

      return res.json({ success: true, message: "Đã xóa mục nhật ký thành công" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

/**
 * @swagger
 * /api/projects/{projectId}/diary-entries/{entryId}:
 *   put:
 *     summary: Cập nhật mục nhật ký kèm kiểm tra version (T-76 / T-77)
 *     tags: [Diary]
 */
router.put(
  "/:projectId/diary-entries/:entryId",
  requireAuth,
  checkProjectAccess,
  requirePermission("site_log.create"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const entryId = parsePositiveInt(req.params.entryId);
    if (!projectId || !entryId) {
      return res.status(400).json({ message: "Tham số không hợp lệ" });
    }

    const errors = validateUpdateDiaryEntry(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors });
    }

    const { work_item_id, content, entry_at, version: clientVersion, client_updated_at, source } = req.body;

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // 1. SELECT FOR UPDATE để khoá dòng và đọc dữ liệu mới nhất
      const selectRes = await client.query(
        `SELECT d.*, w.name AS work_item_name, w.code AS work_item_code,
                u.name AS created_by_name, u2.name AS updated_by_name
         FROM diary_entries d
         JOIN work_items w ON w.id = d.work_item_id
         JOIN users u ON u.id = d.created_by
         LEFT JOIN users u2 ON u2.id = d.updated_by
         WHERE d.id = $1 AND d.project_id = $2
         FOR UPDATE`,
        [entryId, projectId]
      );

      if (selectRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy mục nhật ký" });
      }

      const serverEntry = selectRes.rows[0];

      // 2. Kiểm tra khoá nhật ký của ngày
      const targetDate = entry_at
        ? new Date(entry_at).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })
        : (serverEntry.entry_date || new Date(serverEntry.entry_at).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }));

      const lockCheck = await client.query(
        "SELECT is_locked FROM daily_log_locks WHERE project_id = $1 AND log_date = $2",
        [projectId, targetDate]
      );
      if (lockCheck.rows.length > 0 && lockCheck.rows[0].is_locked) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "Nhật ký của ngày này đã bị khóa, không thể cập nhật." });
      }

      // 3. Kiểm tra work_item_id nếu có thay đổi
      let targetWorkItemId = serverEntry.work_item_id;
      let targetWorkItemName = serverEntry.work_item_name;
      let targetWorkItemCode = serverEntry.work_item_code;
      if (work_item_id !== undefined && work_item_id !== null && work_item_id !== serverEntry.work_item_id) {
        const wiCheck = await client.query(
          "SELECT id, name, code FROM work_items WHERE id = $1 AND project_id = $2",
          [work_item_id, projectId]
        );
        if (wiCheck.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(422).json({ code: "INVALID_WORK_ITEM", message: "Hạng mục không tồn tại hoặc không thuộc dự án này" });
        }
        targetWorkItemId = wiCheck.rows[0].id;
        targetWorkItemName = wiCheck.rows[0].name;
        targetWorkItemCode = wiCheck.rows[0].code;
      }

      // 4. So sánh phiên bản client vs server
      if (Number(clientVersion) === Number(serverEntry.version)) {
        // Cùng version -> Cập nhật thành công, tăng version nguyên tử trong cùng transaction
        const entryAtVal = entry_at ? new Date(entry_at).toISOString() : serverEntry.entry_at;

        const updateRes = await client.query(
          `UPDATE diary_entries
           SET work_item_id = $1,
               content = $2,
               entry_at = $3,
               version = version + 1,
               updated_by = $4,
               updated_at = NOW()
           WHERE id = $5 AND project_id = $6
           RETURNING *`,
          [targetWorkItemId, content.trim(), entryAtVal, req.user.id, entryId, projectId]
        );

        const updatedRow = updateRes.rows[0];

        // Lấy thông tin attachments hiện có
        const attRes = await client.query(
          `SELECT COALESCE(
            json_agg(json_build_object(
              'id', a.id,
              'file_name', a.file_name,
              'file_size', a.file_size,
              'mime_type', a.mime_type,
              'created_at', a.created_at,
              'url', '/api/projects/' || d.project_id || '/diary-entries/' || d.id || '/attachments/' || a.id
            ) ORDER BY a.id),
            '[]'::json
          ) AS attachments
           FROM diary_entries d
           LEFT JOIN diary_entry_attachments a ON a.diary_entry_id = d.id
           WHERE d.id = $1
           GROUP BY d.id`,
          [entryId]
        );

        await client.query("COMMIT");

        try {
          await logAudit({
            userId: req.user.id,
            action: "UPDATE_DIARY_ENTRY",
            entity: "diary_entries",
            entityId: entryId,
            projectId,
            details: {
              previous_version: serverEntry.version,
              new_version: updatedRow.version,
              work_item_id: targetWorkItemId,
            },
          });
        } catch (auditErr) {
          console.error("Audit error:", auditErr);
        }

        return res.status(200).json({
          ...updatedRow,
          work_item_name: targetWorkItemName,
          work_item_code: targetWorkItemCode,
          created_by_name: serverEntry.created_by_name,
          updated_by_name: req.user.name,
          attachments: attRes.rows[0]?.attachments || [],
        });
      }
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/:projectId/diary-entries/:entryId/attachments",
  requireAuth,
  checkProjectAccess,
  requirePermission("site_log.create"),
  (req, res, next) => {
    diaryImageUpload.single("image")(req, res, (error) => {
      if (error) return res.status(400).json({ message: error.message });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const entryId = parsePositiveInt(req.params.entryId);
    const clientId = req.body.client_id;

    if (!projectId || !entryId) {
      return res.status(400).json({ message: "ID nhật ký không hợp lệ" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Thiếu ảnh đính kèm" });
    }
    if (!UUID_PATTERN.test(clientId || "")) {
      return res.status(400).json({ message: "client_id không hợp lệ" });
    }

    const entry = await db.query(
      "SELECT id FROM diary_entries WHERE id = $1 AND project_id = $2",
      [entryId, projectId]
    );
    if (entry.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy nhật ký trong dự án" });
    }

    const result = await db.query(
      `INSERT INTO diary_entry_attachments
         (diary_entry_id, client_id, file_name, file_size, mime_type, file_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (diary_entry_id, client_id) DO NOTHING
       RETURNING id, file_name, file_size, mime_type, created_at`,
      [
        entryId,
        clientId,
        req.file.originalname,
        req.file.size,
        req.file.mimetype,
        req.file.buffer,
      ]
    );

    const attachment =
      result.rows[0] ||
      (
        await db.query(
          `SELECT id, file_name, file_size, mime_type, created_at
           FROM diary_entry_attachments
           WHERE diary_entry_id = $1 AND client_id = $2`,
          [entryId, clientId]
        )
      ).rows[0];

    return res.status(result.rows.length ? 201 : 200).json({
      ...attachment,
      url: `/api/projects/${projectId}/diary-entries/${entryId}/attachments/${attachment.id}`,
    });
  })
);

router.get(
  "/:projectId/diary-entries/:entryId/attachments/:attachmentId",
  requireAuth,
  checkProjectAccess,
  requirePermission("site_log.view"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const entryId = parsePositiveInt(req.params.entryId);
    const attachmentId = parsePositiveInt(req.params.attachmentId);
    if (!projectId || !entryId || !attachmentId) {
      return res.status(400).json({ message: "ID tệp đính kèm không hợp lệ" });
    }

    const result = await db.query(
      `SELECT a.file_data, a.mime_type
       FROM diary_entry_attachments a
       JOIN diary_entries d ON d.id = a.diary_entry_id
       WHERE a.id = $1 AND d.id = $2 AND d.project_id = $3`,
      [attachmentId, entryId, projectId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy ảnh đính kèm" });
    }

    res.setHeader("Content-Type", result.rows[0].mime_type);
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.send(result.rows[0].file_data);
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
  requirePermission("site_log.view"),
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
  // S-27: chốt sổ cuối ngày — Chỉ huy trưởng (đổi theo đặc tả, rút KSGS).
  requirePermission("site_log.close_daily"),
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
  // Điều chỉnh nhật ký đã chốt (có lý do + audit) — Chỉ huy trưởng
  // (đổi theo đặc tả, rút BQL).
  requirePermission("site_log.correct_locked"),
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
  requirePermission("site_log.view"),
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
