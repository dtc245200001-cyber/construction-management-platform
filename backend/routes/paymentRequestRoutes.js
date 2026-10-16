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

module.exports = router;
