"use strict";

// S-22 / T-50
// Router cho mục đầu ngày (nhân lực, thiết bị, thời tiết).
// Mount trong app.js ngay sau diaryRoutes: app.use('/api/projects', diaryDaysRoutes)

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  allow,
  createProjectRouter,
} = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { ROLES } = require("../utils/constants");
const { logAudit } = require("../utils/auditLogger");
const {
  validateDiaryDayBody,
  validateDateParam,
  validateDiaryDaysQuery,
} = require("../utils/diaryDayValidators");
const { assertDayEditable } = require("../utils/diaryDayGuard");

const router = createProjectRouter();

// Các role được phép ghi mục đầu ngày
const WRITE_ROLES = [ROLES.KY_SU_GIAM_SAT, ROLES.CHI_HUY_TRUONG, ROLES.BAN_QUAN_LY];

/**
 * Tính "hôm nay" theo múi giờ Asia/Ho_Chi_Minh, trả về chuỗi YYYY-MM-DD.
 * KHÔNG dùng new Date().toISOString().slice(0,10) vì sẽ sai lệch UTC.
 */
function todayVN() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

/**
 * Tính can_edit từ req.projectRole.
 */
function calcCanEdit(projectRole) {
  if (projectRole === "system_admin") return true;
  return WRITE_ROLES.map(String).includes(String(projectRole));
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/projects/:projectId/diary-catalogs
// Trả danh mục thời tiết và thiết bị đang active.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/projects/{projectId}/diary-catalogs:
 *   get:
 *     summary: Lấy danh mục thời tiết và thiết bị thi công
 *     tags: [DiaryDays]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Danh mục thành công
 */
router.get(
  "/:projectId/diary-catalogs",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const [weatherRes, equipRes] = await Promise.all([
      db.query(
        `SELECT id, code, label, is_adverse
         FROM diary_weather_types
         WHERE is_active = true
         ORDER BY sort_order, id`
      ),
      db.query(
        `SELECT id, code, label, unit
         FROM diary_equipment_types
         WHERE is_active = true
         ORDER BY sort_order, id`
      ),
    ]);

    return res.json({
      weather_types: weatherRes.rows,
      equipment_types: equipRes.rows,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/projects/:projectId/diary-days/:date
// Trả mục đầu ngày cho một ngày cụ thể. Luôn 200, exists=false khi chưa có.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/projects/{projectId}/diary-days/{date}:
 *   get:
 *     summary: Lấy mục đầu ngày theo ngày cụ thể
 *     tags: [DiaryDays]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: "2026-10-09"
 *     responses:
 *       200:
 *         description: Dữ liệu mục đầu ngày (exists=false nếu chưa ghi)
 */
router.get(
  "/:projectId/diary-days/:date",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const dateErrors = validateDateParam(req.params.date);
    if (dateErrors.length > 0) return res.status(400).json({ message: dateErrors[0] });

    const date = req.params.date;
    const canEdit = calcCanEdit(req.projectRole);

    // Đếm số mục nhật ký tự do (diary_entries) của ngày theo giờ VN
    const countRes = await db.query(
      `SELECT COUNT(*)::int AS cnt
       FROM diary_entries
       WHERE project_id = $1
         AND entry_date = $2::date`,
      [projectId, date]
    );
    const entriesCount = countRes.rows[0].cnt;

    // Lấy mục đầu ngày kèm thiết bị
    const logRes = await db.query(
      `SELECT
          dl.id, dl.log_date, dl.manpower_count,
          dl.weather_type_id,
          wt.code AS weather_code,
          wt.label AS weather_label,
          wt.is_adverse AS weather_is_adverse,
          dl.weather_note,
          dl.created_at, dl.updated_at,
          uc.name AS created_by_name,
          uu.name AS updated_by_name
       FROM diary_daily_logs dl
       LEFT JOIN diary_weather_types wt ON wt.id = dl.weather_type_id
       JOIN users uc ON uc.id = dl.created_by
       JOIN users uu ON uu.id = dl.updated_by
       WHERE dl.project_id = $1 AND dl.log_date = $2::date`,
      [projectId, date]
    );

    if (logRes.rows.length === 0) {
      return res.json({
        project_id: projectId,
        date,
        exists: false,
        can_edit: canEdit,
        entries_count: entriesCount,
        day: null,
      });
    }

    const log = logRes.rows[0];

    // Lấy danh sách thiết bị
    const eqRes = await db.query(
      `SELECT
          de.equipment_type_id,
          et.code,
          et.label,
          et.unit,
          de.quantity
       FROM diary_daily_equipment de
       JOIN diary_equipment_types et ON et.id = de.equipment_type_id
       WHERE de.daily_log_id = $1
       ORDER BY et.sort_order, et.id`,
      [log.id]
    );

    return res.json({
      project_id: projectId,
      date,
      exists: true,
      can_edit: canEdit,
      entries_count: entriesCount,
      day: {
        ...log,
        equipment: eqRes.rows,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/projects/:projectId/diary-days?from=&to=
// Trả mảng dày 7-62 ngày phục vụ chế độ xem tuần.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/projects/{projectId}/diary-days:
 *   get:
 *     summary: Lấy danh sách mục đầu ngày theo khoảng thời gian (xem tuần)
 *     tags: [DiaryDays]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *           example: "2026-10-05"
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *           example: "2026-10-11"
 *     responses:
 *       200:
 *         description: Mảng dày các ngày trong khoảng
 */
router.get(
  "/:projectId/diary-days",
  requireAuth,
  checkProjectAccess,
  allow(Object.values(ROLES)),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const queryErrors = validateDiaryDaysQuery(req.query);
    if (queryErrors.length > 0) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: queryErrors });
    }

    const { from, to } = req.query;

    // Dùng generate_series để đảm bảo mảng dày (kể cả ngày chưa có bản ghi)
    const daysRes = await db.query(
      `SELECT
          gs.d::date AS date,
          (dl.id IS NOT NULL) AS has_daily_log,
          dl.manpower_count,
          wt.code AS weather_code,
          wt.label AS weather_label,
          wt.is_adverse AS weather_is_adverse,
          COALESCE(eq_count.cnt, 0)::int AS equipment_count,
          COALESCE(entry_count.cnt, 0)::int AS entries_count
       FROM generate_series($2::date, $3::date, '1 day'::interval) gs(d)
       LEFT JOIN diary_daily_logs dl
              ON dl.project_id = $1 AND dl.log_date = gs.d::date
       LEFT JOIN diary_weather_types wt ON wt.id = dl.weather_type_id
       LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS cnt
           FROM diary_daily_equipment de
           WHERE de.daily_log_id = dl.id
       ) eq_count ON TRUE
       LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS cnt
           FROM diary_entries de2
           WHERE de2.project_id = $1
             AND de2.entry_date = gs.d::date
       ) entry_count ON TRUE
       ORDER BY gs.d`,
      [projectId, from, to]
    );

    return res.json({
      project_id: projectId,
      from,
      to,
      days: daysRes.rows.map((row) => ({
        date: row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10),
        has_daily_log: row.has_daily_log,
        manpower_count: row.manpower_count,
        weather_code: row.weather_code,
        weather_label: row.weather_label,
        weather_is_adverse: row.weather_is_adverse,
        equipment_count: row.equipment_count,
        entries_count: row.entries_count,
      })),
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/projects/:projectId/diary-days/:date
// Upsert mục đầu ngày. 201 khi tạo mới, 200 khi cập nhật.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/projects/{projectId}/diary-days/{date}:
 *   put:
 *     summary: Ghi hoặc cập nhật mục đầu ngày
 *     tags: [DiaryDays]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: "2026-10-09"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               manpower_count:
 *                 type: integer
 *               weather_type_id:
 *                 type: integer
 *               weather_note:
 *                 type: string
 *               equipment:
 *                 type: array
 *               expected_updated_at:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       201:
 *         description: Tạo mới thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       409:
 *         description: Xung đột phiên bản (STALE_DAILY_LOG)
 */
router.put(
  "/:projectId/diary-days/:date",
  requireAuth,
  checkProjectAccess,
  allow(WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ message: "projectId không hợp lệ" });

    const dateErrors = validateDateParam(req.params.date);
    if (dateErrors.length > 0) return res.status(400).json({ message: dateErrors[0] });

    const date = req.params.date;

    // Kiểm tra không cho ghi ngày tương lai
    if (date > todayVN()) {
      return res.status(400).json({ message: "Không được ghi mục đầu ngày cho ngày ở tương lai" });
    }

    // Validate body
    const { errors, isEmpty } = validateDiaryDayBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors });
    }
    if (isEmpty) {
      return res.status(400).json({ message: "Mục đầu ngày không có nội dung" });
    }

    const {
      manpower_count = null,
      weather_type_id = null,
      weather_note = null,
      equipment = [],
      expected_updated_at = null,
    } = req.body;

    // Chuẩn hoá weather_note
    const weatherNoteTrimmed =
      typeof weather_note === "string" && weather_note.trim().length > 0
        ? weather_note.trim()
        : null;

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Điểm móc S-24 — kiểm tra khoá sổ
      await assertDayEditable(client, projectId, date);

      // Kiểm tra weather_type_id tồn tại và đang active
      if (weather_type_id !== null) {
        const wtRes = await client.query(
          "SELECT id FROM diary_weather_types WHERE id = $1 AND is_active = true",
          [weather_type_id]
        );
        if (wtRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(422).json({
            code: "INVALID_WEATHER_TYPE",
            message: "Loại thời tiết không tồn tại hoặc không còn hoạt động",
          });
        }
      }

      // Kiểm tra tất cả equipment_type_id tồn tại và đang active
      const eqList = Array.isArray(equipment) ? equipment : [];
      if (eqList.length > 0) {
        const eqIds = eqList.map((e) => e.equipment_type_id);
        const eqCheck = await client.query(
          `SELECT id FROM diary_equipment_types
           WHERE id = ANY($1::int[]) AND is_active = true`,
          [eqIds]
        );
        if (eqCheck.rows.length !== eqIds.length) {
          await client.query("ROLLBACK");
          return res.status(422).json({
            code: "INVALID_EQUIPMENT_TYPE",
            message: "Một hoặc nhiều loại thiết bị không tồn tại hoặc không còn hoạt động",
          });
        }
      }

      // Khoá dòng hiện có (nếu có) để kiểm tra xung đột phiên bản ngay
      // trong transaction — giữ lock tới lúc upsert nên không còn cửa sổ race.
      const existingRes = await client.query(
        `SELECT id, updated_at FROM diary_daily_logs
         WHERE project_id = $1 AND log_date = $2::date
         FOR UPDATE`,
        [projectId, date]
      );
      const existingRow = existingRes.rows[0] || null;

      // Kiểm tra xung đột phiên bản: client phải gửi đúng updated_at mà nó
      // đã thấy. So sánh tuyệt đối theo mili-giây (lệch dù 1ms cũng là stale).
      if (existingRow && expected_updated_at !== null) {
        const currentTs = new Date(existingRow.updated_at).getTime();
        const expectedTs = new Date(expected_updated_at).getTime();

        if (Number.isNaN(expectedTs) || currentTs !== expectedTs) {
          // Trả về dữ liệu hiện tại để UI hiển thị
          const currentLogRes = await client.query(
            `SELECT dl.*, wt.code AS weather_code, wt.label AS weather_label,
                    wt.is_adverse AS weather_is_adverse,
                    uc.name AS created_by_name, uu.name AS updated_by_name
             FROM diary_daily_logs dl
             LEFT JOIN diary_weather_types wt ON wt.id = dl.weather_type_id
             JOIN users uc ON uc.id = dl.created_by
             JOIN users uu ON uu.id = dl.updated_by
             WHERE dl.project_id = $1 AND dl.log_date = $2::date`,
            [projectId, date]
          );
          const currentEqRes = await client.query(
            `SELECT de.equipment_type_id, et.code, et.label, et.unit, de.quantity
             FROM diary_daily_equipment de
             JOIN diary_equipment_types et ON et.id = de.equipment_type_id
             WHERE de.daily_log_id = $1`,
            [currentLogRes.rows[0].id]
          );
          await client.query("ROLLBACK");
          return res.status(409).json({
            code: "STALE_DAILY_LOG",
            message: "Mục này vừa được người khác cập nhật. Vui lòng tải lại dữ liệu mới.",
            day: { ...currentLogRes.rows[0], equipment: currentEqRes.rows },
          });
        }
      }

      // Upsert duy nhất — an toàn cho concurrent requests nhờ UNIQUE
      // (project_id, log_date) cộng row lock đã giữ ở SELECT FOR UPDATE trên.
      // (xmax=0 nghĩa là bản ghi vừa được INSERT, xmax>0 là UPDATE)
      const upsertRes = await client.query(
        `INSERT INTO diary_daily_logs
            (project_id, log_date, manpower_count, weather_type_id, weather_note,
             created_by, updated_by, created_at, updated_at)
         VALUES ($1, $2::date, $3, $4, $5, $6, $6, NOW(), NOW())
         ON CONFLICT (project_id, log_date) DO UPDATE
           SET manpower_count  = EXCLUDED.manpower_count,
               weather_type_id = EXCLUDED.weather_type_id,
               weather_note    = EXCLUDED.weather_note,
               updated_by      = EXCLUDED.updated_by,
               updated_at      = NOW()
         RETURNING *, (xmax = 0) AS inserted`,
        [projectId, date, manpower_count, weather_type_id, weatherNoteTrimmed, req.user.id]
      );

      const log = upsertRes.rows[0];

      const logId = log.id;

      // Thay thế toàn bộ thiết bị: DELETE rồi INSERT hàng loạt
      await client.query("DELETE FROM diary_daily_equipment WHERE daily_log_id = $1", [logId]);
      if (eqList.length > 0) {
        const eqValues = eqList
          .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`)
          .join(", ");
        const eqParams = [logId];
        eqList.forEach((e) => {
          eqParams.push(e.equipment_type_id, e.quantity);
        });
        await client.query(
          `INSERT INTO diary_daily_equipment (daily_log_id, equipment_type_id, quantity) VALUES ${eqValues}`,
          eqParams
        );
      }

      await client.query("COMMIT");

      // Đếm mục nhật ký tự do của ngày (entry_date đã chuẩn hoá theo giờ VN
      // ở tầng ghi diary_entries) để UI hiển thị đúng ngay sau khi lưu.
      const entriesCountRes = await db.query(
        `SELECT COUNT(*)::int AS cnt
         FROM diary_entries
         WHERE project_id = $1 AND entry_date = $2::date`,
        [projectId, date]
      );

      // Lấy dữ liệu đầy đủ để trả về
      const finalLogRes = await db.query(
        `SELECT dl.*, wt.code AS weather_code, wt.label AS weather_label,
                wt.is_adverse AS weather_is_adverse,
                uc.name AS created_by_name, uu.name AS updated_by_name
         FROM diary_daily_logs dl
         LEFT JOIN diary_weather_types wt ON wt.id = dl.weather_type_id
         JOIN users uc ON uc.id = dl.created_by
         JOIN users uu ON uu.id = dl.updated_by
         WHERE dl.id = $1`,
        [logId]
      );
      const finalEqRes = await db.query(
        `SELECT de.equipment_type_id, et.code, et.label, et.unit, de.quantity
         FROM diary_daily_equipment de
         JOIN diary_equipment_types et ON et.id = de.equipment_type_id
         WHERE de.daily_log_id = $1
         ORDER BY et.sort_order, et.id`,
        [logId]
      );

      const responseBody = {
        project_id: projectId,
        date,
        exists: true,
        can_edit: calcCanEdit(req.projectRole),
        entries_count: entriesCountRes.rows[0].cnt, // Đếm thật sau COMMIT
        day: {
          ...finalLogRes.rows[0],
          equipment: finalEqRes.rows,
        },
      };

      // Audit log (không để lỗi audit phá vỡ luồng chính)
      try {
        await logAudit({
          userId: req.user.id,
          action: "UPSERT_DIARY_DAILY_LOG",
          entity: "diary_daily_logs",
          entityId: logId,
          details: { log_date: date, created: Boolean(log.inserted) },
        });
      } catch (e) {
        console.error("Audit log lỗi:", e);
      }

      return res.status(log.inserted ? 201 : 200).json(responseBody);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
      throw error;
    } finally {
      client.release();
    }
  })
);

module.exports = router;
