"use strict";

/**
 * Router tra cứu siêu dữ liệu ảnh hiện trường (EXIF/GPS)
 * Story S-40: T-106
 *
 * Tiêu chí:
 * - Hiển thị thời điểm và toạ độ khi xem ảnh trong nhật ký và phiếu nghiệm thu.
 * - Ảnh không có siêu dữ liệu thì ghi rõ trạng thái.
 * - Giới hạn quyền xem toạ độ thô: chỉ Chủ đầu tư (CHU_DAU_TU) và Ban quản lý (BAN_QUAN_LY).
 * - Các vai trò khác chỉ biết ảnh có toạ độ (has_gps: true/false), không thấy toạ độ thô.
 * - Tuyệt đối KHÔNG log toạ độ hoặc thời gian chụp.
 * - Header Cache-Control: no-store.
 */

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  requirePermission,
  createProjectRouter,
} = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { can } = require("../utils/permissions");
const {
  inspectVoucherPhotoRecord,
  sanitizeInspectionForRole,
} = require("../services/photoInspection");

const router = createProjectRouter();

const STATUS_LABELS = {
  complete: "Đầy đủ thời gian và toạ độ",
  time_only: "Chỉ có thời gian chụp",
  gps_only: "Chỉ có toạ độ",
  none: "Ảnh không có siêu dữ liệu gốc",
  unreadable: "Siêu dữ liệu bị lỗi hoặc không thể đọc",
  unsupported: "Định dạng không hỗ trợ đọc siêu dữ liệu",
  not_processed: "Chưa qua xử lý siêu dữ liệu",
};

/**
 * @swagger
 * /api/projects/{projectId}/photo-metadata/{kind}/{photoId}:
 *   get:
 *     summary: Xem siêu dữ liệu ảnh (thời gian chụp, trạng thái, toạ độ nếu có quyền)
 *     tags: [PhotoMetadata]
 */
router.get(
  "/:projectId/photo-metadata/:kind/:photoId",
  requireAuth,
  checkProjectAccess,
  requirePermission("photo.view_metadata"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const photoId = parsePositiveInt(req.params.photoId);
    const { kind } = req.params;

    if (!projectId || !photoId) {
      return res.status(400).json({ message: "Tham số projectId hoặc photoId không hợp lệ" });
    }

    if (kind !== "diary" && kind !== "acceptance") {
      return res.status(400).json({
        message: "Tham số kind không hợp lệ. Chỉ chấp nhận 'diary' hoặc 'acceptance'",
      });
    }

    // Luôn đặt Cache-Control: no-store để bảo vệ quyền riêng tư vị trí
    res.setHeader("Cache-Control", "no-store");

    let query = "";
    if (kind === "diary") {
      query = `
        SELECT dea.id, dea.file_name, dea.file_size, dea.mime_type,
               dea.captured_at, dea.captured_at_source,
               dea.gps_latitude, dea.gps_longitude, dea.gps_accuracy_m,
               dea.metadata_status, dea.metadata_source,
               dea.geofence_status, dea.geofence_distance_m, dea.geofence_checked_at,
               dea.created_at AS uploaded_at,
               de.created_at AS entry_created_at,
               de.entry_date,
               u.name AS uploaded_by_name,
               CONCAT('/api/projects/', $2::text, '/diary/attachments/', dea.id) AS url
        FROM diary_entry_attachments dea
        JOIN diary_entries de ON dea.diary_entry_id = de.id
        LEFT JOIN users u ON de.created_by = u.id
        WHERE dea.id = $1 AND de.project_id = $2
      `;
    } else {
      query = `
        SELECT avp.id, avp.file_name, avp.file_size, avp.mime_type,
               avp.captured_at, avp.captured_at_source,
               avp.gps_latitude, avp.gps_longitude, avp.gps_accuracy_m,
               avp.metadata_status, avp.metadata_source,
               avp.geofence_status, avp.geofence_distance_m, avp.geofence_checked_at,
               avp.exif_metadata,
               avp.created_at AS uploaded_at,
               av.created_at AS voucher_created_at,
               av.batch_name,
               av.id AS voucher_id,
               u.name AS uploaded_by_name,
               CONCAT('/api/projects/', $2::text, '/acceptance-vouchers/', avp.voucher_id, '/photos/', avp.id) AS url
        FROM acceptance_voucher_photos avp
        JOIN acceptance_vouchers av ON avp.voucher_id = av.id
        LEFT JOIN users u ON avp.uploaded_by = u.id
        WHERE avp.id = $1 AND av.project_id = $2
      `;
    }

    const result = await db.query(query, [photoId, projectId]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        message: `Không tìm thấy ảnh ${kind === "diary" ? "nhật ký" : "nghiệm thu"} trong dự án`,
      });
    }

    const row = result.rows[0];
    const hasGps = row.gps_latitude !== null && row.gps_longitude !== null;
    const canViewGps = Boolean(
      can(req.projectRole, "photo.view_gps") || (req.user && req.user.is_system_admin)
    );

    const isReviewer = Boolean(
      can(req.projectRole, "acceptance.review_internal") ||
      can(req.projectRole, "acceptance.approve_official") ||
      req.projectRole === "chu_dau_tu" ||
      req.projectRole === "ban_quan_ly" ||
      (req.user && req.user.is_system_admin)
    );

    // Đánh giá dấu hiệu bất thường (Story S-42 / T-109)
    let inspection = null;
    try {
      const inspectionRaw = inspectVoucherPhotoRecord(row, {
        created_at: row.voucher_created_at || row.entry_created_at,
      });
      inspection = sanitizeInspectionForRole(inspectionRaw, isReviewer);
    } catch (_inspErr) {
      inspection = {
        status: "incomplete_data",
        can_evaluate: false,
        has_sufficient_data: false,
        summary: "Dữ liệu không đầy đủ để đánh giá toàn diện",
        warnings: [],
        metadata: {},
        inspected_at: new Date().toISOString(),
      };
    }

    const photoUrl =
      row.url ||
      (kind === "diary"
        ? `/api/projects/${projectId}/diary/attachments/${row.id}`
        : `/api/projects/${projectId}/acceptance-vouchers/${row.voucher_id}/photos/${row.id}`);

    const responsePayload = {
      id: row.id,
      file_name: row.file_name,
      file_size: row.file_size,
      mime_type: row.mime_type,
      uploaded_at: row.uploaded_at,
      uploaded_by_name: row.uploaded_by_name || "Người dùng hệ thống",
      batch_name: row.batch_name || (row.entry_date ? `Nhật ký ${row.entry_date}` : null),
      url: photoUrl,
      status: row.metadata_status,
      status_label: STATUS_LABELS[row.metadata_status] || "Không xác định",
      captured_at: row.captured_at,
      captured_at_source: row.captured_at_source,
      source: row.metadata_source,
      has_gps: hasGps,
      is_reviewer: isReviewer,
      geofence: {
        status: row.geofence_status || "not_checked",
        distance_m:
          row.geofence_distance_m !== null && !isNaN(row.geofence_distance_m)
            ? parseFloat(row.geofence_distance_m)
            : null,
        checked_at: row.geofence_checked_at || null,
      },
      inspection,
    };

    // Chỉ đính kèm toạ độ thô nếu người dùng có quyền photo.view_gps VÀ ảnh có toạ độ
    if (canViewGps && hasGps) {
      const lat = parseFloat(row.gps_latitude);
      const lng = parseFloat(row.gps_longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        responsePayload.gps = {
          latitude: lat,
          longitude: lng,
          accuracy_m:
            row.gps_accuracy_m !== null && !isNaN(row.gps_accuracy_m)
              ? parseFloat(row.gps_accuracy_m)
              : null,
        };
      }
    }

    return res.status(200).json(responsePayload);
  })
);

module.exports = router;
