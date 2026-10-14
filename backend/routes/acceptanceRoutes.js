"use strict";

// S-36 / T-90
// Router phiếu nghiệm thu khối lượng đợt
// Mount trong app.js: app.use('/api/projects', acceptanceRoutes)
//
// Giả định:
//   - Chỉ hạng mục LÁ (không có con) mới được nhập luỹ kế.
//   - Luỹ kế mới >= 0 (validate ở tầng ứng dụng + DB constraint).
//   - Hạng mục phải thuộc dự án (reject 422 nếu không).
//   - Vai trò được lập phiếu: ky_su_giam_sat (acceptance.create_dossier).
//   - Tất cả thành viên dự án xem được phiếu (project.member).
//   - Ảnh lưu bytea, kiểm tra magic bytes thật (không chỉ đuôi file).
//   - Ảnh KHÔNG bắt buộc (ACCEPTANCE_PHOTO_REQUIRED=false mặc định).

const multer = require("multer");
const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  requirePermission,
  createProjectRouter,
} = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { parseDecimalInput } = require("../utils/decimalInput");
const { logAudit } = require("../utils/auditLogger");
const {
  computeVoucherItems,
  detectMimeFromBuffer,
} = require("../utils/acceptanceHelpers");

const router = createProjectRouter();

// ─── HẰNG SỐ CẤU HÌNH ────────────────────────────────────────────────────────
const ACCEPTANCE_PHOTO_REQUIRED =
  process.env.ACCEPTANCE_PHOTO_REQUIRED === "true"; // mặc định: không bắt buộc
const ACCEPTANCE_MAX_PHOTO_SIZE_MB =
  parseInt(process.env.ACCEPTANCE_MAX_PHOTO_SIZE_MB, 10) || 10;
const ACCEPTANCE_MAX_PHOTO_SIZE_BYTES =
  ACCEPTANCE_MAX_PHOTO_SIZE_MB * 1024 * 1024;
const ACCEPTANCE_MAX_PHOTOS_PER_VOUCHER =
  parseInt(process.env.ACCEPTANCE_MAX_PHOTOS_PER_VOUCHER, 10) || 0; // 0 = không giới hạn
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

// Cấu hình multer: lưu memory, giới hạn dung lượng theo cấu hình
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ACCEPTANCE_MAX_PHOTO_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    // Chỉ lọc sơ bộ theo mimetype khai báo; kiểm tra magic bytes sau
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Định dạng ảnh không được hỗ trợ. Chỉ chấp nhận: ${ALLOWED_MIME_TYPES.join(", ")}`));
    }
  },
});

// ─── POST /api/projects/:projectId/acceptance-vouchers ────────────────────────
/**
 * @swagger
 * /api/projects/{projectId}/acceptance-vouchers:
 *   post:
 *     summary: Tạo phiếu nghiệm thu nháp cho đợt
 *     tags: [Acceptance]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [batch_name, items]
 *             properties:
 *               batch_name:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [work_item_id, cumulative_quantity]
 *                   properties:
 *                     work_item_id:
 *                       type: integer
 *                     cumulative_quantity:
 *                       type: string
 *     responses:
 *       201:
 *         description: Phiếu nháp đã tạo
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       403:
 *         description: Không có quyền
 *       422:
 *         description: Hạng mục không hợp lệ (ngoài dự án hoặc không phải lá)
 */
router.post(
  "/:projectId/acceptance-vouchers",
  requireAuth,
  checkProjectAccess,
  requirePermission("acceptance.create_dossier"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const { batch_name, items } = req.body;

    // Validate batch_name
    if (!batch_name || typeof batch_name !== "string" || batch_name.trim() === "") {
      return res.status(400).json({ message: "Tên đợt nghiệm thu (batch_name) là bắt buộc" });
    }
    if (batch_name.trim().length > 200) {
      return res.status(400).json({ message: "Tên đợt không được quá 200 ký tự" });
    }

    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Danh sách hạng mục (items) không được rỗng" });
    }

    // Validate từng item
    const itemErrors = [];
    const parsedItems = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rowErrors = {};

      const workItemId = parsePositiveInt(item.work_item_id);
      if (!workItemId) {
        rowErrors.work_item_id = "work_item_id không hợp lệ";
      }

      const qtyResult = parseDecimalInput(item.cumulative_quantity, {
        maxIntDigits: 11,
        maxScale: 3,
        fieldName: "Luỹ kế",
      });
      if (!qtyResult.valid) {
        rowErrors.cumulative_quantity = qtyResult.error;
      }

      if (Object.keys(rowErrors).length > 0) {
        itemErrors.push({ index: i, errors: rowErrors });
      } else {
        parsedItems.push({
          work_item_id: workItemId,
          cumulative_quantity: qtyResult.value,
        });
      }
    }

    if (itemErrors.length > 0) {
      return res.status(400).json({
        message: "Dữ liệu hạng mục không hợp lệ",
        item_errors: itemErrors,
      });
    }

    // Kiểm tra trùng work_item_id trong request
    const workItemIds = parsedItems.map((i) => i.work_item_id);
    const uniqueIds = new Set(workItemIds);
    if (uniqueIds.size !== workItemIds.length) {
      return res.status(400).json({
        message: "Danh sách hạng mục có work_item_id trùng lặp",
      });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Kiểm tra tất cả hạng mục thuộc dự án và là lá
      const wiCheck = await client.query(
        `SELECT
           wi.id,
           wi.unit,
           NOT EXISTS (
             SELECT 1 FROM work_items child WHERE child.parent_id = wi.id
           ) AS is_leaf
         FROM work_items wi
         WHERE wi.id = ANY($1::int[]) AND wi.project_id = $2`,
        [workItemIds, projectId]
      );

      const foundMap = new Map(wiCheck.rows.map((r) => [r.id, r]));

      const invalidItems = [];
      for (const item of parsedItems) {
        const found = foundMap.get(item.work_item_id);
        if (!found) {
          invalidItems.push({
            work_item_id: item.work_item_id,
            reason: "Hạng mục không tồn tại hoặc không thuộc dự án này",
          });
        } else if (!found.is_leaf) {
          invalidItems.push({
            work_item_id: item.work_item_id,
            reason: "Chỉ được nhập khối lượng cho hạng mục lá (không có con)",
          });
        }
      }

      if (invalidItems.length > 0) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          message: "Một số hạng mục không hợp lệ",
          invalid_items: invalidItems,
        });
      }

      // Tính khối lượng đợt cho từng hạng mục
      const computedItems = await computeVoucherItems(
        client,
        parsedItems.map((item) => ({
          ...item,
          unit: foundMap.get(item.work_item_id)?.unit || null,
        }))
      );

      // Kiểm tra có dòng âm không
      const hasNegativeDelta = computedItems.some(
        (it) => parseFloat(it.delta_quantity) < 0
      );

      // Tạo phiếu
      const voucherRes = await client.query(
        `INSERT INTO acceptance_vouchers
           (project_id, batch_name, status, has_negative_delta, created_by, updated_at)
         VALUES ($1, $2, 'draft', $3, $4, NOW())
         RETURNING id, project_id, batch_name, status, has_negative_delta, created_by, created_at, updated_at`,
        [projectId, batch_name.trim(), hasNegativeDelta, req.user.id]
      );

      const voucher = voucherRes.rows[0];

      // Chèn chi tiết
      for (const it of computedItems) {
        await client.query(
          `INSERT INTO acceptance_voucher_items
             (voucher_id, work_item_id, cumulative_quantity, prev_approved_cumulative, delta_quantity, unit)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            voucher.id,
            it.work_item_id,
            it.cumulative_quantity,
            it.prev_approved_cumulative,
            it.delta_quantity,
            it.unit,
          ]
        );
      }

      await client.query("COMMIT");

      // Cảnh báo đợt âm trong response (không phải lỗi — phiếu vẫn lưu được)
      const warnings = [];
      if (hasNegativeDelta) {
        warnings.push({
          code: "HAS_NEGATIVE_DELTA",
          message:
            "Phiếu có hạng mục với khối lượng đợt âm (luỹ kế mới < luỹ kế đã duyệt). " +
            "Phiếu được lưu dạng nháp nhưng KHÔNG thể gửi duyệt cho đến khi có quy tắc điều chỉnh.",
        });
      }

      return res.status(201).json({
        voucher: {
          ...voucher,
          has_negative_delta: voucher.has_negative_delta,
        },
        items: computedItems,
        warnings,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── GET /api/projects/:projectId/acceptance-vouchers ─────────────────────────
/**
 * @swagger
 * /api/projects/{projectId}/acceptance-vouchers:
 *   get:
 *     summary: Danh sách phiếu nghiệm thu của dự án
 *     tags: [Acceptance]
 */
router.get(
  "/:projectId/acceptance-vouchers",
  requireAuth,
  checkProjectAccess,
  requirePermission("project.member"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    res.setHeader("Cache-Control", "no-store");

    const { rows } = await db.query(
      `SELECT
         av.id,
         av.batch_name,
         av.status,
         av.has_negative_delta,
         av.created_by,
         u.name AS created_by_name,
         av.reviewed_by,
         reviewer.name AS reviewed_by_name,
         av.reviewed_at,
         av.review_note,
         av.created_at,
         av.updated_at,
         (SELECT COUNT(*) FROM acceptance_voucher_items avi WHERE avi.voucher_id = av.id)::int AS item_count,
         (SELECT COUNT(*) FROM acceptance_voucher_photos avp WHERE avp.voucher_id = av.id)::int AS photo_count
       FROM acceptance_vouchers av
       JOIN users u ON u.id = av.created_by
       LEFT JOIN users reviewer ON reviewer.id = av.reviewed_by
       WHERE av.project_id = $1
       ORDER BY av.created_at DESC`,
      [projectId]
    );

    return res.json({ project_id: projectId, count: rows.length, vouchers: rows });
  })
);

// ─── GET /api/projects/:projectId/acceptance-vouchers/items-summary ───────────
/**
 * @swagger
 * /api/projects/{projectId}/acceptance-vouchers/items-summary:
 *   get:
 *     summary: Danh sách hạng mục lá kèm luỹ kế đã duyệt gần nhất và số đội báo
 *     tags: [Acceptance]
 */
router.get(
  "/:projectId/acceptance-vouchers/items-summary",
  requireAuth,
  checkProjectAccess,
  requirePermission("project.member"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    res.setHeader("Cache-Control", "no-store");

    const query = `
      SELECT
        wi.id,
        wi.parent_id,
        wi.code,
        wi.name,
        wi.unit,
        wi.quantity::text AS contract_quantity,
        COALESCE((
          SELECT avi.cumulative_quantity::text
          FROM acceptance_voucher_items avi
          JOIN acceptance_vouchers av ON av.id = avi.voucher_id
          WHERE avi.work_item_id = wi.id
            AND av.project_id = $1
            AND av.status = 'approved'
          ORDER BY av.created_at DESC, av.id DESC
          LIMIT 1
        ), '0.000') AS prev_approved_cumulative,
        COALESCE((
          SELECT SUM(tqr.quantity)::text
          FROM task_quantity_reports tqr
          JOIN tasks t ON t.id = tqr.task_id
          WHERE t.work_item_id = wi.id
            AND tqr.project_id = $1
        ), '0') AS team_reported_quantity
      FROM work_items wi
      WHERE wi.project_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM work_items child WHERE child.parent_id = wi.id
        )
      ORDER BY wi.code, wi.id
    `;

    const { rows } = await db.query(query, [projectId]);
    return res.json({ project_id: projectId, items: rows });
  })
);

// ─── GET /api/projects/:projectId/acceptance-vouchers/:voucherId ───────────────
/**
 * @swagger
 * /api/projects/{projectId}/acceptance-vouchers/{voucherId}:
 *   get:
 *     summary: Chi tiết phiếu nghiệm thu (kèm hạng mục và danh sách ảnh)
 *     tags: [Acceptance]
 */
router.get(
  "/:projectId/acceptance-vouchers/:voucherId",
  requireAuth,
  checkProjectAccess,
  requirePermission("project.member"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    res.setHeader("Cache-Control", "no-store");

    // Lấy phiếu
    const voucherRes = await db.query(
      `SELECT
         av.*,
         u.name AS created_by_name,
         reviewer.name AS reviewed_by_name
       FROM acceptance_vouchers av
       JOIN users u ON u.id = av.created_by
       LEFT JOIN users reviewer ON reviewer.id = av.reviewed_by
       WHERE av.id = $1 AND av.project_id = $2`,
      [voucherId, projectId]
    );

    if (voucherRes.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy phiếu nghiệm thu" });
    }

    const voucher = voucherRes.rows[0];

    // Lấy chi tiết hạng mục kèm thông tin từ S-26 (khối lượng đội báo)
    const itemsRes = await db.query(
      `SELECT
         avi.id,
         avi.work_item_id,
         wi.code AS work_item_code,
         wi.name AS work_item_name,
         avi.cumulative_quantity::text,
         avi.prev_approved_cumulative::text,
         avi.delta_quantity::text,
         avi.unit,
         -- Tổng khối lượng đội báo từ S-26 (tham khảo, không dùng tính toán)
         COALESCE((
           SELECT SUM(tqr.quantity)::text
           FROM task_quantity_reports tqr
           JOIN tasks t ON t.id = tqr.task_id
           WHERE t.work_item_id = avi.work_item_id
             AND tqr.project_id = av.project_id
         ), '0') AS team_reported_quantity
       FROM acceptance_voucher_items avi
       JOIN acceptance_vouchers av ON av.id = avi.voucher_id
       JOIN work_items wi ON wi.id = avi.work_item_id
       WHERE avi.voucher_id = $1
       ORDER BY wi.code, wi.id`,
      [voucherId]
    );

    // Lấy danh sách ảnh (không trả file_data để tiết kiệm băng thông)
    const photosRes = await db.query(
      `SELECT
         id,
         file_name,
         file_size,
         mime_type,
         caption,
         uploaded_by,
         created_at,
         '/api/projects/' || $2 || '/acceptance-vouchers/' || voucher_id || '/photos/' || id AS url
       FROM acceptance_voucher_photos
       WHERE voucher_id = $1
       ORDER BY created_at`,
      [voucherId, projectId]
    );

    return res.json({
      voucher,
      items: itemsRes.rows,
      photos: photosRes.rows,
    });
  })
);

// ─── PUT /api/projects/:projectId/acceptance-vouchers/:voucherId ─────────────
/**
 * T-99 / S-38
 * Người lập được sửa phiếu ở trạng thái draft/returned. Phiếu pending_review
 * hoặc approved bị khóa để tránh thay đổi nội dung sau khi đã gửi/duyệt.
 */
router.put(
  "/:projectId/acceptance-vouchers/:voucherId",
  requireAuth,
  checkProjectAccess,
  requirePermission("acceptance.update_dossier"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const { batch_name, items } = req.body;
    if (!batch_name || typeof batch_name !== "string" || batch_name.trim() === "") {
      return res.status(400).json({ message: "Tên đợt nghiệm thu (batch_name) là bắt buộc" });
    }
    if (batch_name.trim().length > 200) {
      return res.status(400).json({ message: "Tên đợt không được quá 200 ký tự" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Danh sách hạng mục (items) không được rỗng" });
    }

    const itemErrors = [];
    const parsedItems = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const rowErrors = {};
      const workItemId = parsePositiveInt(item.work_item_id);
      if (!workItemId) rowErrors.work_item_id = "work_item_id không hợp lệ";

      const qtyResult = parseDecimalInput(item.cumulative_quantity, {
        maxIntDigits: 11,
        maxScale: 3,
        fieldName: "Luỹ kế",
      });
      if (!qtyResult.valid) rowErrors.cumulative_quantity = qtyResult.error;

      if (Object.keys(rowErrors).length > 0) {
        itemErrors.push({ index: i, errors: rowErrors });
      } else {
        parsedItems.push({
          work_item_id: workItemId,
          cumulative_quantity: qtyResult.value,
        });
      }
    }

    if (itemErrors.length > 0) {
      return res.status(400).json({
        message: "Dữ liệu hạng mục không hợp lệ",
        item_errors: itemErrors,
      });
    }

    const workItemIds = parsedItems.map((item) => item.work_item_id);
    if (new Set(workItemIds).size !== workItemIds.length) {
      return res.status(400).json({
        message: "Danh sách hạng mục có work_item_id trùng lặp",
      });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const voucherRes = await client.query(
        `SELECT id, project_id, batch_name, status, has_negative_delta, created_by,
                reviewed_by, reviewed_at, review_note
         FROM acceptance_vouchers
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [voucherId, projectId]
      );

      if (voucherRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy phiếu nghiệm thu" });
      }

      const voucher = voucherRes.rows[0];
      if (Number(voucher.created_by) !== Number(req.user.id)) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          code: "ONLY_CREATOR_CAN_EDIT",
          message: "Chỉ người lập phiếu mới được chỉnh sửa phiếu này",
        });
      }
      if (!["draft", "returned"].includes(voucher.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "ACCEPTANCE_VOUCHER_LOCKED",
          message: "Chỉ phiếu nháp hoặc phiếu bị trả lại mới được chỉnh sửa",
          current_status: voucher.status,
        });
      }

      const wiCheck = await client.query(
        `SELECT wi.id, wi.unit,
                NOT EXISTS (
                  SELECT 1 FROM work_items child WHERE child.parent_id = wi.id
                ) AS is_leaf
         FROM work_items wi
         WHERE wi.id = ANY($1::int[]) AND wi.project_id = $2`,
        [workItemIds, projectId]
      );
      const foundMap = new Map(wiCheck.rows.map((row) => [row.id, row]));
      const invalidItems = [];
      for (const item of parsedItems) {
        const found = foundMap.get(item.work_item_id);
        if (!found) {
          invalidItems.push({
            work_item_id: item.work_item_id,
            reason: "Hạng mục không tồn tại hoặc không thuộc dự án này",
          });
        } else if (!found.is_leaf) {
          invalidItems.push({
            work_item_id: item.work_item_id,
            reason: "Chỉ được nhập khối lượng cho hạng mục lá (không có con)",
          });
        }
      }
      if (invalidItems.length > 0) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          message: "Một số hạng mục không hợp lệ",
          invalid_items: invalidItems,
        });
      }

      const computedItems = await computeVoucherItems(
        client,
        parsedItems.map((item) => ({
          ...item,
          unit: foundMap.get(item.work_item_id)?.unit || null,
        }))
      );
      const hasNegativeDelta = computedItems.some(
        (item) => parseFloat(item.delta_quantity) < 0
      );

      await client.query(
        `UPDATE acceptance_vouchers
         SET batch_name = $1,
             has_negative_delta = $2,
             updated_at = NOW()
         WHERE id = $3 AND project_id = $4`,
        [batch_name.trim(), hasNegativeDelta, voucherId, projectId]
      );
      await client.query(
        "DELETE FROM acceptance_voucher_items WHERE voucher_id = $1",
        [voucherId]
      );
      for (const item of computedItems) {
        await client.query(
          `INSERT INTO acceptance_voucher_items
             (voucher_id, work_item_id, cumulative_quantity,
              prev_approved_cumulative, delta_quantity, unit)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            voucherId,
            item.work_item_id,
            item.cumulative_quantity,
            item.prev_approved_cumulative,
            item.delta_quantity,
            item.unit,
          ]
        );
      }

      const updatedRes = await client.query(
        `SELECT id, project_id, batch_name, status, has_negative_delta,
                created_by, reviewed_by, reviewed_at, review_note,
                created_at, updated_at
         FROM acceptance_vouchers
         WHERE id = $1 AND project_id = $2`,
        [voucherId, projectId]
      );

      await client.query("COMMIT");

      await logAudit({
        userId: req.user.id,
        action: "UPDATE_ACCEPTANCE_VOUCHER",
        entity: "acceptance_vouchers",
        entityId: voucherId,
        projectId,
        details: {
          status: voucher.status,
          batch_name: batch_name.trim(),
          item_count: computedItems.length,
          has_negative_delta: hasNegativeDelta,
        },
        ipAddress: req.ip,
      });

      return res.json({
        message: "Đã cập nhật phiếu nghiệm thu",
        voucher: updatedRes.rows[0],
        items: computedItems,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  })
);

// ─── POST /api/projects/:projectId/acceptance-vouchers/:voucherId/submit ──────
/** Gửi phiếu nháp hoặc phiếu đã bị trả lại sang trạng thái chờ duyệt. */
router.post(
  "/:projectId/acceptance-vouchers/:voucherId/submit",
  requireAuth,
  checkProjectAccess,
  requirePermission("acceptance.update_dossier"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const voucherRes = await client.query(
        `SELECT id, status, has_negative_delta, created_by
         FROM acceptance_vouchers
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [voucherId, projectId]
      );
      if (voucherRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy phiếu nghiệm thu" });
      }

      const voucher = voucherRes.rows[0];
      if (Number(voucher.created_by) !== Number(req.user.id)) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          code: "ONLY_CREATOR_CAN_SUBMIT",
          message: "Chỉ người lập phiếu mới được gửi duyệt phiếu này",
        });
      }
      if (!["draft", "returned"].includes(voucher.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "INVALID_ACCEPTANCE_STATUS",
          message: "Chỉ phiếu nháp hoặc phiếu bị trả lại mới được gửi duyệt",
          current_status: voucher.status,
        });
      }
      if (voucher.has_negative_delta) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "NEGATIVE_DELTA_BLOCKED",
          message: "Phiếu có khối lượng đợt âm chưa thể gửi duyệt",
        });
      }

      const itemCountRes = await client.query(
        "SELECT COUNT(*)::int AS count FROM acceptance_voucher_items WHERE voucher_id = $1",
        [voucherId]
      );
      if (!itemCountRes.rows[0] || itemCountRes.rows[0].count < 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "EMPTY_ACCEPTANCE_VOUCHER",
          message: "Phiếu không có hạng mục để gửi duyệt",
        });
      }

      const submittedRes = await client.query(
        `UPDATE acceptance_vouchers
         SET status = 'pending_review', updated_at = NOW()
         WHERE id = $1 AND project_id = $2
         RETURNING id, project_id, batch_name, status, has_negative_delta,
                   created_by, reviewed_by, reviewed_at, review_note,
                   created_at, updated_at`,
        [voucherId, projectId]
      );
      await client.query("COMMIT");

      await logAudit({
        userId: req.user.id,
        action: voucher.status === "returned"
          ? "RESUBMIT_ACCEPTANCE_VOUCHER"
          : "SUBMIT_ACCEPTANCE_VOUCHER",
        entity: "acceptance_vouchers",
        entityId: voucherId,
        projectId,
        details: {
          from_status: voucher.status,
          to_status: "pending_review",
        },
        ipAddress: req.ip,
      });

      return res.json({
        message: voucher.status === "returned"
          ? "Đã gửi lại phiếu nghiệm thu để duyệt"
          : "Đã gửi phiếu nghiệm thu để duyệt",
        voucher: submittedRes.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  })
);

// ─── POST /api/projects/:projectId/acceptance-vouchers/:voucherId/return ──────
/** Ban quản lý trả lại phiếu pending_review; bắt buộc có lý do. */
router.post(
  "/:projectId/acceptance-vouchers/:voucherId/return",
  requireAuth,
  checkProjectAccess,
  requirePermission("acceptance.review_internal"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) {
      return res.status(400).json({
        code: "RETURN_REASON_REQUIRED",
        message: "Bắt buộc nhập lý do trả lại phiếu",
      });
    }
    if (reason.length > 2000) {
      return res.status(400).json({
        code: "RETURN_REASON_TOO_LONG",
        message: "Lý do trả lại không được quá 2000 ký tự",
      });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const voucherRes = await client.query(
        `SELECT id, status, created_by
         FROM acceptance_vouchers
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [voucherId, projectId]
      );
      if (voucherRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy phiếu nghiệm thu" });
      }

      const voucher = voucherRes.rows[0];
      if (voucher.status !== "pending_review") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "INVALID_ACCEPTANCE_STATUS",
          message: "Chỉ phiếu đang chờ duyệt mới được trả lại",
          current_status: voucher.status,
        });
      }

      const returnedRes = await client.query(
        `UPDATE acceptance_vouchers
         SET status = 'returned',
             reviewed_by = $1,
             reviewed_at = NOW(),
             review_note = $2,
             updated_at = NOW()
         WHERE id = $3 AND project_id = $4
         RETURNING id, project_id, batch_name, status, has_negative_delta,
                   created_by, reviewed_by, reviewed_at, review_note,
                   created_at, updated_at`,
        [req.user.id, reason, voucherId, projectId]
      );
      await client.query("COMMIT");

      await logAudit({
        userId: req.user.id,
        action: "RETURN_ACCEPTANCE_VOUCHER",
        entity: "acceptance_vouchers",
        entityId: voucherId,
        projectId,
        details: {
          from_status: "pending_review",
          to_status: "returned",
          reason,
          creator_user_id: voucher.created_by,
        },
        ipAddress: req.ip,
      });

      return res.json({
        message: "Đã trả lại phiếu nghiệm thu",
        voucher: returnedRes.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  })
);

// ─── POST /api/projects/:projectId/acceptance-vouchers/:voucherId/approve ─────
/**
 * T-98 / S-38
 * Ban quản lý duyệt phiếu đang chờ duyệt. RBAC được kiểm tra hoàn toàn ở backend.
 */
router.post(
  "/:projectId/acceptance-vouchers/:voucherId/approve",
  requireAuth,
  checkProjectAccess,
  requirePermission("acceptance.review_internal"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const voucherRes = await client.query(
        `SELECT id, project_id, batch_name, status, has_negative_delta, created_by
         FROM acceptance_vouchers
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [voucherId, projectId]
      );

      if (voucherRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Không tìm thấy phiếu nghiệm thu" });
      }

      const voucher = voucherRes.rows[0];
      if (voucher.status !== "pending_review") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "INVALID_ACCEPTANCE_STATUS",
          message: "Chỉ phiếu đang chờ duyệt mới được duyệt",
          current_status: voucher.status,
        });
      }

      if (voucher.has_negative_delta) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "NEGATIVE_DELTA_BLOCKED",
          message: "Phiếu có khối lượng đợt âm chưa thể được duyệt",
        });
      }

      const approvedRes = await client.query(
        `UPDATE acceptance_vouchers
         SET status = 'approved',
             reviewed_by = $1,
             reviewed_at = NOW(),
             review_note = NULL,
             updated_at = NOW()
         WHERE id = $2 AND project_id = $3
         RETURNING id, project_id, batch_name, status, has_negative_delta,
                   created_by, reviewed_by, reviewed_at, review_note,
                   created_at, updated_at`,
        [req.user.id, voucherId, projectId]
      );

      await client.query("COMMIT");

      await logAudit({
        userId: req.user.id,
        action: "APPROVE_ACCEPTANCE_VOUCHER",
        entity: "acceptance_vouchers",
        entityId: voucherId,
        projectId,
        details: {
          from_status: "pending_review",
          to_status: "approved",
        },
        ipAddress: req.ip,
      });

      return res.json({
        message: "Đã duyệt phiếu nghiệm thu",
        voucher: approvedRes.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  })
);

// ─── POST /api/projects/:projectId/acceptance-vouchers/:voucherId/photos ───────
/**
 * @swagger
 * /api/projects/{projectId}/acceptance-vouchers/{voucherId}/photos:
 *   post:
 *     summary: Đính kèm ảnh hiện trường vào phiếu nghiệm thu
 *     tags: [Acceptance]
 */
router.post(
  "/:projectId/acceptance-vouchers/:voucherId/photos",
  requireAuth,
  checkProjectAccess,
  requirePermission("acceptance.create_dossier"),
  (req, res, next) => {
    photoUpload.single("photo")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: `Ảnh quá lớn. Dung lượng tối đa: ${ACCEPTANCE_MAX_PHOTO_SIZE_MB} MB`,
        });
      }
      if (err) return res.status(400).json({ message: err.message });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    // Ảnh có bắt buộc không tuỳ config
    if (!req.file) {
      if (ACCEPTANCE_PHOTO_REQUIRED) {
        return res.status(400).json({ message: "Thiếu ảnh đính kèm (bắt buộc)" });
      }
      return res.status(400).json({ message: "Thiếu file ảnh trong request" });
    }

    // Kiểm tra magic bytes thật (không chỉ tin đuôi file hoặc Content-Type)
    const detectedMime = detectMimeFromBuffer(req.file.buffer);
    if (!ALLOWED_MIME_TYPES.includes(detectedMime)) {
      return res.status(400).json({
        message: `Định dạng ảnh không được chấp nhận (phát hiện: ${detectedMime || "không xác định"}). Chỉ chấp nhận: ${ALLOWED_MIME_TYPES.join(", ")}`,
      });
    }

    // Kiểm tra phiếu tồn tại và thuộc dự án
    const voucherCheck = await db.query(
      "SELECT id, status FROM acceptance_vouchers WHERE id = $1 AND project_id = $2",
      [voucherId, projectId]
    );
    if (voucherCheck.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy phiếu nghiệm thu" });
    }
    if (!["draft", "returned"].includes(voucherCheck.rows[0].status)) {
      return res.status(409).json({
        code: "ACCEPTANCE_VOUCHER_LOCKED",
        message: "Phiếu đã gửi duyệt hoặc đã duyệt không được bổ sung ảnh",
        current_status: voucherCheck.rows[0].status,
      });
    }

    // Kiểm tra số lượng ảnh nếu có giới hạn
    if (ACCEPTANCE_MAX_PHOTOS_PER_VOUCHER > 0) {
      const countRes = await db.query(
        "SELECT COUNT(*)::int AS cnt FROM acceptance_voucher_photos WHERE voucher_id = $1",
        [voucherId]
      );
      if (countRes.rows[0].cnt >= ACCEPTANCE_MAX_PHOTOS_PER_VOUCHER) {
        return res.status(400).json({
          message: `Đã đạt giới hạn ${ACCEPTANCE_MAX_PHOTOS_PER_VOUCHER} ảnh cho phiếu này`,
        });
      }
    }

    // Trích xuất EXIF nếu có (giữ nguyên siêu dữ liệu gốc cho E-07)
    // KHÔNG log toạ độ thô ra file log
    let exifMetadata = null;
    try {
      // exif-parser là optional: nếu chưa cài thì bỏ qua, không chặn upload.
      // Để cài: cd backend && npm install exif-parser
      // eslint-disable-next-line
      const ExifParser = require("exif-parser");
      const parser = ExifParser.create(req.file.buffer);
      parser.enableSimpleValues(true);
      const exifResult = parser.parse();
      if (exifResult && exifResult.tags) {
        exifMetadata = {
          // Lưu đầy đủ vào DB (E-07 sẽ đọc qua API)
          tags: exifResult.tags,
          imageSize: exifResult.imageSize,
        };
      }
    } catch (_e) {
      // exif-parser chưa cài hoặc EXIF parse thất bại — bỏ qua, không chặn upload
    }

    const caption = req.body.caption
      ? String(req.body.caption).trim().slice(0, 500)
      : null;

    const insertRes = await db.query(
      `INSERT INTO acceptance_voucher_photos
         (voucher_id, file_name, file_size, mime_type, file_data, exif_metadata, caption, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, file_name, file_size, mime_type, caption, uploaded_by, created_at`,
      [
        voucherId,
        req.file.originalname,
        req.file.size,
        detectedMime,
        req.file.buffer,
        exifMetadata ? JSON.stringify(exifMetadata) : null,
        caption,
        req.user.id,
      ]
    );

    const photo = insertRes.rows[0];
    return res.status(201).json({
      ...photo,
      url: `/api/projects/${projectId}/acceptance-vouchers/${voucherId}/photos/${photo.id}`,
    });
  })
);

// ─── GET /api/projects/:projectId/acceptance-vouchers/:voucherId/photos/:photoId
/**
 * @swagger
 * /api/projects/{projectId}/acceptance-vouchers/{voucherId}/photos/{photoId}:
 *   get:
 *     summary: Tải xuống ảnh hiện trường (kiểm quyền dự án)
 *     tags: [Acceptance]
 */
router.get(
  "/:projectId/acceptance-vouchers/:voucherId/photos/:photoId",
  requireAuth,
  checkProjectAccess,
  requirePermission("project.member"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    const photoId = parsePositiveInt(req.params.photoId);
    if (!projectId || !voucherId || !photoId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    // Kiểm tra quyền: photo phải thuộc phiếu thuộc dự án
    const result = await db.query(
      `SELECT avp.file_data, avp.mime_type, avp.file_name
       FROM acceptance_voucher_photos avp
       JOIN acceptance_vouchers av ON av.id = avp.voucher_id
       WHERE avp.id = $1 AND avp.voucher_id = $2 AND av.project_id = $3`,
      [photoId, voucherId, projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy ảnh" });
    }

    const { file_data, mime_type, file_name } = result.rows[0];
    res.setHeader("Content-Type", mime_type);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(file_name)}"`
    );
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.send(file_data);
  })
);

module.exports = router;
