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
//   - Kỹ sư giám sát chỉ xem phiếu do mình lập; Chủ đầu tư xem phiếu trong dự án.
//   - Ảnh lưu bytea, kiểm tra magic bytes thật (không chỉ đuôi file).
//   - Ảnh KHÔNG bắt buộc (ACCEPTANCE_PHOTO_REQUIRED=false mặc định).

const multer = require("multer");
const sharp = require("sharp");
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
const { PERMISSIONS, ROLE_LABELS, can } = require("../utils/permissions");
const { ROLES } = require("../utils/constants");
const {
  computeVoucherItems,
  detectMimeFromBuffer,
} = require("../utils/acceptanceHelpers");
const { extractPhotoMetadata } = require("../services/photoMetadata");
const { evaluateGeofence } = require("../utils/geo");
const {
  inspectPhotoMetadata,
  inspectVoucherPhotoRecord,
} = require("../services/photoInspection");

const router = createProjectRouter();

const requireAcceptancePermission = (permissionKey) => {
  const allowedRoles = PERMISSIONS[permissionKey] || [];
  const middleware = (req, res, next) => {
    if (req.user && req.user.is_system_admin) {
      res.locals.roleChecked = true;
      return next();
    }

    if (allowedRoles.includes(req.projectRole)) {
      res.locals.roleChecked = true;
      return next();
    }

    const roleLabel = ROLE_LABELS[req.projectRole] || req.projectRole || "chưa xác định";
    return res.status(403).json({
      error: `Vai trò ${roleLabel} không có quyền ${permissionKey}`,
    });
  };
  middleware.permissionKey = permissionKey;
  return middleware;
};

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
  requireAcceptancePermission("acceptance.create_dossier"),
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

      // S-39: audit "ai đã lập phiếu" — ghi sau COMMIT theo pattern fail-open
      // (audit fail không phá luồng chính). details dùng { old_value, new_value }
      // để đồng nhất với các sự kiện chuyển trạng thái khác.
      try {
        await logAudit({
          userId: req.user.id,
          action: "CREATE_ACCEPTANCE_VOUCHER",
          entity: "acceptance_vouchers",
          entityId: voucher.id,
          projectId,
          details: {
            old_value: null,
            new_value: {
              status: voucher.status,
              batch_name: voucher.batch_name,
              item_count: computedItems.length,
              has_negative_delta: voucher.has_negative_delta,
            },
          },
          ipAddress: req.ip,
        });
      } catch (auditErr) {
        console.error("Audit error:", auditErr);
      }

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
  requireAcceptancePermission("acceptance.access"),
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
         AND ($2::boolean = false OR av.created_by = $3)
       ORDER BY av.created_at DESC`,
      [
        projectId,
        req.projectRole === ROLES.KY_SU_GIAM_SAT,
        req.user.id,
      ]
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
  requireAcceptancePermission("acceptance.access"),
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
  requireAcceptancePermission("acceptance.access"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    res.setHeader("Cache-Control", "no-store");

    // Lấy phiếu kèm cấu hình bán kính công trường
    const voucherRes = await db.query(
      `SELECT
         av.*,
         u.name AS created_by_name,
         reviewer.name AS reviewed_by_name,
         p.site_radius_m
       FROM acceptance_vouchers av
       JOIN users u ON u.id = av.created_by
       LEFT JOIN users reviewer ON reviewer.id = av.reviewed_by
       JOIN projects p ON p.id = av.project_id
       WHERE av.id = $1 AND av.project_id = $2
         AND ($3::boolean = false OR av.created_by = $4)`,
      [
        voucherId,
        projectId,
        req.projectRole === ROLES.KY_SU_GIAM_SAT,
        req.user.id,
      ]
    );

    if (voucherRes.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy phiếu nghiệm thu" });
    }

    const voucher = voucherRes.rows[0];
    const siteRadius = voucher.site_radius_m !== null ? parseInt(voucher.site_radius_m, 10) : null;

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
         captured_at,
         captured_at_source,
         metadata_status,
         metadata_source,
         gps_source,
         geofence_status,
         geofence_distance_m,
         geofence_checked_at,
         geofence_basis,
         exif_metadata,
         CONCAT('/api/projects/', $2::text, '/acceptance-vouchers/', voucher_id, '/photos/', id) AS url
       FROM acceptance_voucher_photos
       WHERE voucher_id = $1
       ORDER BY created_at`,
      [voucherId, projectId]
    );

    const photo_flags = {
      total: photosRes.rows.length,
      inside: 0,
      outside: 0,
      no_gps: 0,
      no_site_config: 0,
      unverified: 0,
      anomalies_count: 0,
      clean_count: 0,
      incomplete_count: 0,
      error_count: 0,
    };

    const isReviewer = req.projectRole === ROLES.CHU_DAU_TU;
    const canSeeEvidenceFlags = Boolean(
      req.projectRole === ROLES.CHU_DAU_TU ||
      can(req.projectRole, "acceptance.approve_official") ||
      (req.user && req.user.is_system_admin)
    );

    const photos = photosRes.rows.map((p) => {
      const status = p.geofence_status || "no_site_config";
      if (status === "inside") photo_flags.inside++;
      else if (status === "outside") photo_flags.outside++;
      else if (status === "no_gps") photo_flags.no_gps++;
      else photo_flags.no_site_config++;

      if (
        (status === "inside" || status === "outside") &&
        p.geofence_basis === "client_reported"
      ) {
        photo_flags.unverified++;
      }

      const inspectionRaw = inspectVoucherPhotoRecord(p, voucher);
      if (inspectionRaw.status === "warning") photo_flags.anomalies_count++;
      else if (inspectionRaw.status === "clean") photo_flags.clean_count++;
      else if (inspectionRaw.status === "incomplete_data") photo_flags.incomplete_count++;
      else if (inspectionRaw.status === "error") photo_flags.error_count++;

      const inspection = isReviewer
        ? inspectionRaw
        : { data_status_label: inspectionRaw.data_status_label || null };

      let basePhoto;
      if (isReviewer) {
        basePhoto = { ...p };
      } else if (canSeeEvidenceFlags) {
        basePhoto = {
          id: p.id,
          file_name: p.file_name,
          file_size: p.file_size,
          mime_type: p.mime_type,
          caption: p.caption,
          created_at: p.created_at,
          url: p.url,
          geofence_status: p.geofence_status,
          geofence_checked_at: p.geofence_checked_at,
          geofence_basis: p.geofence_basis,
          gps_source: p.gps_source,
        };
      } else {
        basePhoto = {
          id: p.id,
          file_name: p.file_name,
          file_size: p.file_size,
          mime_type: p.mime_type,
          caption: p.caption,
          created_at: p.created_at,
          url: p.url,
        };
      }

      return {
        ...basePhoto,
        geofence_distance_m:
          canSeeEvidenceFlags && p.geofence_distance_m !== null
            ? parseFloat(p.geofence_distance_m)
            : undefined,
        ...(canSeeEvidenceFlags ? { radius_m: siteRadius } : {}),
        inspection,
      };
    });

    return res.json({
      voucher,
      items: itemsRes.rows,
      photos,
      ...(canSeeEvidenceFlags ? { photo_flags } : {}),
    });
  })
);

// S-38: Người lập sửa phiếu nháp hoặc phiếu bị trả lại.
router.put(
  "/:projectId/acceptance-vouchers/:voucherId",
  requireAuth,
  checkProjectAccess,
  requireAcceptancePermission("acceptance.update_dossier"),
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
          old_value: { status: voucher.status, batch_name: voucher.batch_name, has_negative_delta: voucher.has_negative_delta },
          new_value: { status: voucher.status, batch_name: batch_name.trim(), has_negative_delta: hasNegativeDelta, items: computedItems },
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
  requireAcceptancePermission("acceptance.create_dossier"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Khoá dòng để tránh 2 thao tác đồng thời trên cùng phiếu.
      const voucherRes = await client.query(
        `SELECT id, project_id, batch_name, status, has_negative_delta, created_by, created_at
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
        return res.status(403).json({ code: "ONLY_CREATOR_CAN_SUBMIT", message: "Chỉ người lập phiếu mới được gửi duyệt phiếu này" });
      }

      if (voucher.has_negative_delta) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          code: "HAS_NEGATIVE_DELTA",
          message:
            "Phiếu có hạng mục khối lượng đợt âm — chưa thể gửi duyệt. " +
            "Vui lòng điều chỉnh hoặc chờ quy tắc xử lý đợt âm.",
        });
      }

      if (voucher.status !== "draft" && voucher.status !== "returned") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          code: "INVALID_STATE",
          message: `Không thể gửi duyệt từ trạng thái "${voucher.status}"`,
        });
      }

      const itemCount = await client.query(
        "SELECT COUNT(*)::int AS count FROM acceptance_voucher_items WHERE voucher_id = $1", [voucherId]
      );
      if (!itemCount.rows[0] || itemCount.rows[0].count < 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({ code: "EMPTY_ACCEPTANCE_VOUCHER", message: "Phiếu không có hạng mục để gửi duyệt" });
      }

      const photosRes = await client.query(
        `SELECT id, file_data, file_name, file_size, mime_type
         FROM acceptance_voucher_photos
         WHERE voucher_id = $1
         ORDER BY id`,
        [voucherId]
      );
      for (const photo of photosRes.rows) {
        const photoMeta = await extractPhotoMetadata(
          photo.file_data,
          photo.mime_type,
          {}
        );
        const inspection = await inspectPhotoMetadata({
          buffer: photo.file_data,
          mimeType: photo.mime_type,
          fileName: photo.file_name,
          fileSize: photo.file_size,
          capturedAt: photoMeta.captured_at,
          voucherCreatedAt: voucher.created_at,
          photoMeta,
        });
        if (
          inspection.can_evaluate !== true ||
          ![
            "full_data",
            "incomplete_data",
            "incomplete_data_warning",
          ].includes(inspection.data_status)
        ) {
          await client.query("ROLLBACK");
          return res.status(422).json({
            code: "PHOTO_INSPECTION_UNAVAILABLE",
            message: `Chưa thể xác định trạng thái hợp lệ cho ảnh "${photo.file_name}". Vui lòng thay ảnh hoặc tải lại ảnh.`,
          });
        }

        await client.query(
          `UPDATE acceptance_voucher_photos
           SET exif_metadata = $1
           WHERE id = $2 AND voucher_id = $3`,
          [JSON.stringify(inspection), photo.id, voucherId]
        );
      }

      const updated = await client.query(
        `UPDATE acceptance_vouchers
         SET status = 'pending_review', updated_at = NOW()
         WHERE id = $1
         RETURNING id, project_id, batch_name, status, has_negative_delta, created_by, created_at, updated_at`,
        [voucherId]
      );

      await client.query("COMMIT");

      try {
        await logAudit({
          userId: req.user.id,
          action: voucher.status === "returned" ? "RESUBMIT_ACCEPTANCE_VOUCHER" : "SUBMIT_ACCEPTANCE_VOUCHER",
          entity: "acceptance_vouchers",
          entityId: voucherId,
          projectId,
          details: {
            old_value: { status: voucher.status },
            new_value: { status: "pending_review" },
            batch_name: voucher.batch_name,
          },
          ipAddress: req.ip,
        });
      } catch (auditErr) {
        console.error("Audit error:", auditErr);
      }

      return res.json({ voucher: updated.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── POST /:projectId/acceptance-vouchers/:voucherId/approve ──────────────────
// Chủ đầu tư duyệt phiếu (pending_review → approved).
router.post(
  "/:projectId/acceptance-vouchers/:voucherId/approve",
  requireAuth,
  checkProjectAccess,
  requireAcceptancePermission("acceptance.approve_official"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const note = req.body.note ? String(req.body.note).trim().slice(0, 2000) : null;

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const voucherRes = await client.query(
        `SELECT id, project_id, batch_name, status
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
          code: "INVALID_STATE",
          message: `Chỉ duyệt phiếu đang ở trạng thái "pending_review" (hiện: "${voucher.status}")`,
        });
      }

      const updated = await client.query(
        `UPDATE acceptance_vouchers
         SET status = 'approved',
             reviewed_by = $1,
             reviewed_at = NOW(),
             review_note = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, project_id, batch_name, status, reviewed_by, reviewed_at, review_note, updated_at`,
        [req.user.id, note, voucherId]
      );

      await client.query("COMMIT");

      try {
        await logAudit({
          userId: req.user.id,
          action: "APPROVE_ACCEPTANCE_VOUCHER",
          entity: "acceptance_vouchers",
          entityId: voucherId,
          projectId,
          details: {
            old_value: { status: voucher.status },
            new_value: { status: "approved", review_note: note },
            batch_name: voucher.batch_name,
          },
          ipAddress: req.ip,
        });
      } catch (auditErr) {
        console.error("Audit error:", auditErr);
      }

      return res.json({
        message: "Đã duyệt phiếu nghiệm thu",
        voucher: updated.rows[0],
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── POST /:projectId/acceptance-vouchers/:voucherId/return ───────────────────
// Chủ đầu tư trả phiếu (pending_review → returned), bắt buộc có lý do.
router.post(
  "/:projectId/acceptance-vouchers/:voucherId/return",
  requireAuth,
  checkProjectAccess,
  requireAcceptancePermission("acceptance.return_official"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const reason = req.body.reason ? String(req.body.reason).trim() : "";
    if (!reason) {
      return res.status(400).json({ code: "RETURN_REASON_REQUIRED", message: "Phải nhập lý do trả lại phiếu" });
    }
    if (reason.length > 2000) {
      return res.status(400).json({ message: "Lý do trả lại không quá 2000 ký tự" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const voucherRes = await client.query(
        `SELECT id, project_id, batch_name, status
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
          code: "INVALID_STATE",
          message: `Chỉ trả lại phiếu đang ở trạng thái "pending_review" (hiện: "${voucher.status}")`,
        });
      }

      const updated = await client.query(
        `UPDATE acceptance_vouchers
         SET status = 'returned',
             reviewed_by = $1,
             reviewed_at = NOW(),
             review_note = $2,
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, project_id, batch_name, status, reviewed_by, reviewed_at, review_note, updated_at`,
        [req.user.id, reason, voucherId]
      );

      await client.query("COMMIT");

      try {
        await logAudit({
          userId: req.user.id,
          action: "RETURN_ACCEPTANCE_VOUCHER",
          entity: "acceptance_vouchers",
          entityId: voucherId,
          projectId,
          details: {
            old_value: { status: voucher.status },
            new_value: { status: "returned", review_note: reason },
            batch_name: voucher.batch_name,
            reason,
          },
          ipAddress: req.ip,
        });
      } catch (auditErr) {
        console.error("Audit error:", auditErr);
      }

      return res.json({ voucher: updated.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─── GET /:projectId/acceptance-vouchers/:voucherId/history ───────────────────
// Timeline audit giới hạn theo vai trò và quyền sở hữu phiếu của người lập.
router.get(
  "/:projectId/acceptance-vouchers/:voucherId/history",
  requireAuth,
  checkProjectAccess,
  requireAcceptancePermission("acceptance.access"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const voucherId = parsePositiveInt(req.params.voucherId);
    if (!projectId || !voucherId) {
      return res.status(400).json({ message: "ID không hợp lệ" });
    }

    const voucherRes = await db.query(
      `SELECT id FROM acceptance_vouchers
       WHERE id = $1 AND project_id = $2
         AND ($3::boolean = false OR created_by = $4)`,
      [
        voucherId,
        projectId,
        req.projectRole === ROLES.KY_SU_GIAM_SAT,
        req.user.id,
      ]
    );
    if (voucherRes.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy phiếu nghiệm thu" });
    }

    const historyRes = await db.query(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.ip_address, a.created_at,
              u.name AS user_name, u.email AS user_email
       FROM audit_logs a
       JOIN users u ON u.id = a.user_id
       WHERE a.entity = 'acceptance_vouchers' AND a.entity_id = $1 AND a.project_id = $2
       ORDER BY a.created_at DESC, a.id DESC`,
      [voucherId, projectId]
    );

    return res.json({ voucher_id: voucherId, logs: historyRes.rows });
  })
);

// ─── GET /:projectId/audit-logs — Audit Portal (Chủ đầu tư / Ban quản lý) ─────
// S-39: Màn hình tổng quan — lọc toàn bộ sự kiện của dự án theo trục thời gian.
// Chỉ đọc; append-only đảm bảo bởi trigger ở tầng DB.
const AUDIT_ENTITY_WHITELIST = new Set([
  "acceptance_vouchers",
  "acceptance_voucher_items",
  "acceptance_voucher_photos",
  "daily_log_locks",
  "diary_entries",
  "diary_entry_conflicts",
  "diary_daily_logs",
  "task_quantity_reports",
  "tasks",
  "work_items",
  "projects",
  "users",
  "invitations",
  "teams",
]);
const AUDIT_ACTION_PATTERN = /^[A-Z][A-Z0-9_]{2,59}$/;

router.get(
  "/:projectId/audit-logs",
  requireAuth,
  checkProjectAccess,
  requirePermission("audit.view_project"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    res.setHeader("Cache-Control", "no-store");

    // ── Sanitize filter params ────────────────────────────────────────────
    const { entity, entity_id, action, from, to } = req.query;

    if (entity !== undefined && entity !== "" && !AUDIT_ENTITY_WHITELIST.has(entity)) {
      return res.status(400).json({ message: `entity không hợp lệ: ${entity}` });
    }

    let entityId = null;
    if (entity_id !== undefined && entity_id !== "") {
      entityId = parsePositiveInt(entity_id);
      if (!entityId) return res.status(400).json({ message: "entity_id không hợp lệ" });
    }

    if (action !== undefined && action !== "" && !AUDIT_ACTION_PATTERN.test(action)) {
      return res.status(400).json({ message: "action không hợp lệ" });
    }

    if (from !== undefined && from !== "" && isNaN(Date.parse(from))) {
      return res.status(400).json({ message: "from không phải ngày hợp lệ" });
    }
    if (to !== undefined && to !== "" && isNaN(Date.parse(to))) {
      return res.status(400).json({ message: "to không phải ngày hợp lệ" });
    }
    if (from && to && Date.parse(from) > Date.parse(to)) {
      return res.status(400).json({ message: "Từ ngày phải trước hoặc bằng đến ngày" });
    }

    const limit = Math.min(parsePositiveInt(req.query.limit) || 50, 200);
    const offset = parsePositiveInt(req.query.offset) || 0;

    // ── Build WHERE ───────────────────────────────────────────────────────
    const params = [projectId];
    const whereParts = ["a.project_id = $1"];
    let idx = 2;

    if (entity) {
      whereParts.push(`a.entity = $${idx++}`);
      params.push(entity);
    }
    if (entityId) {
      whereParts.push(`a.entity_id = $${idx++}`);
      params.push(entityId);
    }
    if (action) {
      whereParts.push(`a.action = $${idx++}`);
      params.push(action);
    }
    if (from) {
      whereParts.push(`a.created_at >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      whereParts.push(`a.created_at <= $${idx++}`);
      params.push(to);
    }

    const whereClause = whereParts.join(" AND ");

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs a WHERE ${whereClause}`,
      params
    );

    const dataRes = await db.query(
      `SELECT a.id, a.user_id, u.name AS user_name, u.email AS user_email,
              a.action, a.entity, a.entity_id, a.details, a.ip_address, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${whereClause}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return res.json({
      project_id: projectId,
      total: countRes.rows[0].total,
      limit,
      offset,
      logs: dataRes.rows,
    });
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
  requireAcceptancePermission("acceptance.create_dossier"),
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

    // Kiểm tra phiếu tồn tại và thuộc dự án (kèm thông tin phạm vi công trường)
    const voucherCheck = await db.query(
      `SELECT av.id, av.status, av.created_by, av.created_at,
              p.site_latitude, p.site_longitude, p.site_radius_m
       FROM acceptance_vouchers av
       JOIN projects p ON p.id = av.project_id
       WHERE av.id = $1 AND av.project_id = $2`,
      [voucherId, projectId]
    );
    if (voucherCheck.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy phiếu nghiệm thu" });
    }
    if (Number(voucherCheck.rows[0].created_by) !== Number(req.user.id)) {
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

    // Trích xuất EXIF và chuẩn hoá metadata ảnh hiện trường (S-40 / T-105)
    // KHÔNG log toạ độ thô ra file log
    const photoMeta = await extractPhotoMetadata(
      req.file.buffer,
      detectedMime,
      req.body
    );

    // Đánh giá geofence so với tâm và bán kính công trường (S-41 / T-108)
    const geofenceEval = evaluateGeofence({
      photo: {
        gps_latitude: photoMeta.gps_latitude,
        gps_longitude: photoMeta.gps_longitude,
        gps_accuracy_m: photoMeta.gps_accuracy_m,
        gps_source: photoMeta.gps_source,
      },
      site: {
        site_latitude: voucherCheck.rows[0].site_latitude,
        site_longitude: voucherCheck.rows[0].site_longitude,
        site_radius_m: voucherCheck.rows[0].site_radius_m,
      },
      basis: photoMeta.gps_source,
    });

    // Phân tích và phát hiện dấu hiệu bất thường của ảnh bằng chứng (S-42 / T-109)
    const inspection = await inspectPhotoMetadata({
      buffer: req.file.buffer,
      mimeType: detectedMime,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      capturedAt: photoMeta.captured_at,
      voucherCreatedAt: voucherCheck.rows[0].created_at,
      clientFallback: req.body,
      photoMeta,
    });

    const caption = req.body.caption
      ? String(req.body.caption).trim().slice(0, 500)
      : null;

    const insertRes = await db.query(
      `INSERT INTO acceptance_voucher_photos
         (voucher_id, file_name, file_size, mime_type, file_data, exif_metadata, caption, uploaded_by,
          captured_at, captured_at_source, gps_latitude, gps_longitude, gps_accuracy_m, metadata_status, metadata_source,
          geofence_status, geofence_distance_m, geofence_checked_at, gps_source, geofence_basis)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING id, file_name, file_size, mime_type, caption, uploaded_by, created_at,
                 captured_at, captured_at_source, metadata_status, metadata_source,
                 (gps_latitude IS NOT NULL) AS has_gps,
                 geofence_status, geofence_distance_m, geofence_checked_at,
                 gps_source, geofence_basis, exif_metadata`,
      [
        voucherId,
        req.file.originalname,
        req.file.size,
        detectedMime,
        req.file.buffer,
        JSON.stringify(inspection),
        caption,
        req.user.id,
        photoMeta.captured_at,
        photoMeta.captured_at_source,
        photoMeta.gps_latitude,
        photoMeta.gps_longitude,
        photoMeta.gps_accuracy_m,
        photoMeta.metadata_status,
        photoMeta.metadata_source,
        geofenceEval.status,
        geofenceEval.distance_m,
        geofenceEval.checked_at,
        photoMeta.gps_source,
        geofenceEval.basis,
      ]
    );

    const photo = insertRes.rows[0];
    return res.status(201).json({
      id: photo.id,
      file_name: photo.file_name,
      file_size: photo.file_size,
      mime_type: photo.mime_type,
      caption: photo.caption,
      uploaded_by: photo.uploaded_by,
      created_at: photo.created_at,
      inspection: {
        data_status_label: inspection.data_status_label || null,
      },
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
  requireAcceptancePermission("acceptance.access"),
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
       WHERE avp.id = $1 AND avp.voucher_id = $2 AND av.project_id = $3
         AND ($4::boolean = false OR av.created_by = $5)`,
      [
        photoId,
        voucherId,
        projectId,
        req.projectRole === ROLES.KY_SU_GIAM_SAT,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy ảnh" });
    }

    const { file_data, mime_type, file_name } = result.rows[0];
    const isSupervisor = req.projectRole === ROLES.KY_SU_GIAM_SAT;
    const responseImage = isSupervisor
      ? await sharp(file_data)
          .rotate()
          .resize({
            width: 800,
            height: 600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 82 })
          .toBuffer()
      : file_data;
    res.setHeader("Content-Type", isSupervisor ? "image/jpeg" : mime_type);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(isSupervisor ? "acceptance-preview.jpg" : file_name)}"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(responseImage);
  })
);

// ─── GET /api/projects/:projectId/work-items/:workItemId/acceptance-dossier.pdf ─
// S-50 / T-127: xuất hồ sơ nghiệm thu của 1 hạng mục ra PDF.
// - Dữ liệu dựng 100% phía server (không nhận nội dung từ client).
// - Quyền xuất hồ sơ: acceptance.export_dossier (chỉ Ban quản lý).
// - Toạ độ thô chỉ in khi người xuất có quyền photo.view_gps (CĐT + BQL).
router.get(
  "/:projectId/work-items/:workItemId/acceptance-dossier.pdf",
  requireAuth,
  checkProjectAccess,
  requireAcceptancePermission("acceptance.export_dossier"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const workItemId = parsePositiveInt(req.params.workItemId);
    if (!projectId || !workItemId) {
      return res.status(400).json({ message: "Tham số không hợp lệ" });
    }

    const canViewGps = Boolean(
      can(req.projectRole, "photo.view_gps") || (req.user && req.user.is_system_admin)
    );

    const { generateAcceptanceDossier } = require("../services/acceptanceDossierService");
    const result = await generateAcceptanceDossier(projectId, workItemId, { canViewGps });

    if (result.notFound) {
      return res.status(404).json({ message: "Không tìm thấy hạng mục trong dự án" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.filename)}"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", result.buffer.length);
    return res.send(result.buffer);
  })
);

module.exports = router;
