"use strict";

// S-43 / T-112: Router API Đề nghị thanh toán
// Mount trong app.js: app.use('/api/projects', paymentRequestRoutes)

const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  requirePermission,
  createProjectRouter,
} = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const paymentRequestService = require("../services/paymentRequestService");
const { logAudit } = require("../utils/auditLogger");

const router = createProjectRouter();

/**
 * POST /api/projects/:projectId/payment-requests
 * Lập đề nghị thanh toán từ các phiếu nghiệm thu đã duyệt trong kỳ.
 * Quyền: ban_quan_ly
 */
router.post(
  "/:projectId/payment-requests",
  requireAuth,
  checkProjectAccess,
  requirePermission("payment_request.create"),
  asyncHandler(async (req, res) => {
    try {
      const result = await paymentRequestService.createPaymentRequest({
        projectId: req.params.projectId,
        userId: req.user.id,
        period_start: req.body.period_start,
        period_end: req.body.period_end,
        acceptance_ids: req.body.acceptance_ids,
      });

      return res.status(201).json({
        message: "Lập đề nghị thanh toán thành công",
        payment_request: result,
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          error: err.message,
          message: err.message,
          ...(err.missing_work_items ? { missing_work_items: err.missing_work_items } : {}),
        });
      }
      throw err;
    }
  })
);

/**
 * GET /api/projects/:projectId/payment-requests
 * Lấy danh sách đề nghị thanh toán của dự án.
 * Quyền: ban_quan_ly, chu_dau_tu
 */
router.get(
  "/:projectId/payment-requests",
  requireAuth,
  checkProjectAccess,
  requirePermission("payment_request.view"),
  asyncHandler(async (req, res) => {
    const list = await paymentRequestService.getPaymentRequestsByProject(
      req.params.projectId
    );
    return res.status(200).json({ payment_requests: list });
  })
);

/**
 * GET /api/projects/:projectId/payment-requests/:id
 * Lấy chi tiết đề nghị thanh toán (kèm danh sách phiếu và chi tiết dòng).
 * Quyền: ban_quan_ly, chu_dau_tu
 */
router.get(
  "/:projectId/payment-requests/:id",
  requireAuth,
  checkProjectAccess,
  requirePermission("payment_request.view"),
  asyncHandler(async (req, res) => {
    try {
      const detail = await paymentRequestService.getPaymentRequestDetail(
        req.params.projectId,
        req.params.id
      );
      return res.status(200).json({ payment_request: detail });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          error: err.message,
          message: err.message,
        });
      }
      throw err;
    }
  })
);


/**
 * POST /api/projects/:projectId/payment-requests/:id/approve
 * S-44 / T-114: Chủ đầu tư duyệt đề nghị thanh toán.
 */
router.post(
  "/:projectId/payment-requests/:id/approve",
  requireAuth,
  checkProjectAccess,
  requirePermission("payment.approve"),
  asyncHandler(async (req, res) => {
    try {
      const updated = await paymentRequestService.approvePaymentRequest({
        projectId: req.params.projectId,
        paymentRequestId: req.params.id,
        userId: req.user.id,
      });

      await logAudit({
        userId: req.user.id,
        action: "APPROVE_PAYMENT_REQUEST",
        entity: "payment_requests",
        entityId: Number(req.params.id),
        projectId: Number(req.params.projectId),
        details: {
          old_value: { status: "DRAFT" },
          new_value: { status: "APPROVED" },
        },
        ipAddress: req.ip,
      });

      return res.status(200).json({
        message: "Đã duyệt đề nghị thanh toán",
        payment_request: updated,
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          code: err.code,
          error: err.message,
          message: err.message,
        });
      }
      throw err;
    }
  })
);

/**
 * POST /api/projects/:projectId/payment-requests/:id/return
 * S-44 / T-114: Chủ đầu tư trả lại đề nghị, bắt buộc lý do.
 */
router.post(
  "/:projectId/payment-requests/:id/return",
  requireAuth,
  checkProjectAccess,
  requirePermission("payment.approve"),
  asyncHandler(async (req, res) => {
    try {
      const updated = await paymentRequestService.returnPaymentRequest({
        projectId: req.params.projectId,
        paymentRequestId: req.params.id,
        userId: req.user.id,
        reason: req.body.reason,
      });

      await logAudit({
        userId: req.user.id,
        action: "RETURN_PAYMENT_REQUEST",
        entity: "payment_requests",
        entityId: Number(req.params.id),
        projectId: Number(req.params.projectId),
        details: {
          old_value: { status: "DRAFT" },
          new_value: { status: "RETURNED" },
          reason: updated.return_reason,
        },
        ipAddress: req.ip,
      });

      return res.status(200).json({
        message: "Đã trả lại đề nghị thanh toán",
        payment_request: updated,
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          code: err.code,
          error: err.message,
          message: err.message,
        });
      }
      throw err;
    }
  })
);


/**
 * GET /api/projects/:projectId/payment-retention-config
 * S-45 / T-116: đọc cấu hình tạm giữ của dự án.
 */
router.get(
  "/:projectId/payment-retention-config",
  requireAuth,
  checkProjectAccess,
  requirePermission("payment_request.view"),
  asyncHandler(async (req, res) => {
    try {
      const config = await paymentRequestService.getRetentionConfig(
        req.params.projectId
      );
      return res.status(200).json({ retention_config: config });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          error: err.message,
          message: err.message,
        });
      }
      throw err;
    }
  })
);

/**
 * PUT /api/projects/:projectId/payment-retention-config
 * S-45 / T-116: Ban quản lý hoặc Chủ đầu tư cấu hình tỷ lệ/trần tạm giữ.
 */
router.put(
  "/:projectId/payment-retention-config",
  requireAuth,
  checkProjectAccess,
  requirePermission("payment_retention.manage"),
  asyncHandler(async (req, res) => {
    try {
      const result = await paymentRequestService.updateRetentionConfig({
        projectId: req.params.projectId,
        retention_rate: req.body.retention_rate,
        retention_cap_amount: req.body.retention_cap_amount,
      });

      await logAudit({
        userId: req.user.id,
        action: "UPDATE_PAYMENT_RETENTION_CONFIG",
        entity: "projects",
        entityId: Number(req.params.projectId),
        projectId: Number(req.params.projectId),
        details: {
          old_value: result.before,
          new_value: result.after,
        },
        ipAddress: req.ip,
      });

      return res.status(200).json({
        message: "Đã cập nhật cấu hình tạm giữ",
        retention_config: result.after,
      });
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          error: err.message,
          message: err.message,
        });
      }
      throw err;
    }
  })
);

module.exports = router;
