"use strict";

const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  requirePermission,
  createProjectRouter,
} = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const budgetService = require("../services/budgetService");

const router = createProjectRouter();

/**
 * @swagger
 * /api/projects/{projectId}/budgets:
 *   get:
 *     summary: Lấy danh sách các phiên bản dự toán của dự án (T-119, S-46)
 *     tags: [Budgets]
 */
router.get(
  "/:projectId/budgets",
  requireAuth,
  checkProjectAccess,
  requirePermission("budget.view"),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const result = await budgetService.getBudgetVersions(projectId);
    return res.status(200).json(result);
  })
);

/**
 * @swagger
 * /api/projects/{projectId}/budgets/tree:
 *   get:
 *     summary: Xem cây dự toán với số tiền cộng dồn từ các lá lên các hạng mục cha (T-119, S-46)
 *     tags: [Budgets]
 */
router.get(
  "/:projectId/budgets/tree",
  requireAuth,
  checkProjectAccess,
  requirePermission("budget.view"),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const versionParam = req.query.version
      ? parsePositiveInt(req.query.version)
      : null;

    const result = await budgetService.getBudgetTree(projectId, versionParam);
    return res.status(200).json(result);
  })
);

/**
 * @swagger
 * /api/projects/{projectId}/budgets:
 *   post:
 *     summary: Tạo hoặc cập nhật phiên bản dự toán cho hạng mục lá (T-119, S-46)
 *     tags: [Budgets]
 */
router.post(
  "/:projectId/budgets",
  requireAuth,
  checkProjectAccess,
  requirePermission("budget.manage"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const result = await budgetService.saveBudgetVersion({
      projectId,
      userId: req.user.id,
      data: req.body || {},
    });

    if (result.status && result.status >= 400) {
      return res.status(result.status).json({
        message: result.error || "Dữ liệu không hợp lệ",
      });
    }

    return res.status(result.status || 200).json(result);
  })
);

/**
 * @swagger
 * /api/projects/{projectId}/budgets/justifications:
 *   get:
 *     summary: Lấy danh sách giải trình vượt dự toán và danh sách người duyệt độc lập (S-46)
 *     tags: [Budgets]
 */
router.get(
  "/:projectId/budgets/justifications",
  requireAuth,
  checkProjectAccess,
  requirePermission("budget.view"),
  asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const result = await budgetService.getOverrunJustifications(projectId);
    return res.status(200).json(result);
  })
);

/**
 * @swagger
 * /api/projects/{projectId}/budgets/justifications:
 *   post:
 *     summary: Tạo và gửi giải trình vượt dự toán để Chủ đầu tư duyệt (S-46)
 *     tags: [Budgets]
 */
router.post(
  "/:projectId/budgets/justifications",
  requireAuth,
  checkProjectAccess,
  requirePermission("budget.manage"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    const result = await budgetService.createOverrunJustification({
      projectId,
      userId: req.user.id,
      data: req.body || {},
    });

    if (result.status && result.status >= 400) {
      return res.status(result.status).json({
        message: result.error || "Dữ liệu không hợp lệ",
      });
    }

    return res.status(result.status || 201).json(result);
  })
);

/**
 * @swagger
 * /api/projects/{projectId}/budgets/justifications/{justificationId}/verify:
 *   post:
 *     summary: Kế toán thẩm tra & xác nhận đối chiếu số liệu trên phiếu giải trình vượt dự toán
 *     tags: [Budgets]
 */
router.post(
  "/:projectId/budgets/justifications/:justificationId/verify",
  requireAuth,
  checkProjectAccess,
  requirePermission("budget.verify_overrun"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const justificationId = parsePositiveInt(req.params.justificationId);
    if (!projectId || !justificationId) {
      return res
        .status(400)
        .json({ message: "projectId hoặc justificationId không hợp lệ" });
    }

    const result =
      await budgetService.verifyOverrunJustificationByAccountant({
        projectId,
        justificationId,
        userId: req.user.id,
        data: req.body || {},
      });

    if (result.status && result.status >= 400) {
      return res.status(result.status).json({
        message: result.error || "Không thể xác nhận giải trình",
      });
    }

    return res.status(result.status || 200).json(result);
  })
);

/**
 * @swagger
 * /api/projects/{projectId}/budgets/justifications/{justificationId}/review:
 *   post:
 *     summary: Duyệt hoặc từ chối giải trình vượt dự toán (bắt buộc người duyệt độc lập, cấm tự duyệt)
 *     tags: [Budgets]
 */
router.post(
  "/:projectId/budgets/justifications/:justificationId/review",
  requireAuth,
  checkProjectAccess,
  requirePermission("budget.approve_overrun"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    const justificationId = parsePositiveInt(req.params.justificationId);
    if (!projectId || !justificationId) {
      return res
        .status(400)
        .json({ message: "projectId hoặc justificationId không hợp lệ" });
    }

    const result = await budgetService.reviewOverrunJustification({
      projectId,
      justificationId,
      userId: req.user.id,
      data: req.body || {},
    });

    if (result.status && result.status >= 400) {
      return res.status(result.status).json({
        message: result.error || "Không thể xử lý giải trình",
      });
    }

    return res.status(result.status || 200).json(result);
  })
);

module.exports = router;
