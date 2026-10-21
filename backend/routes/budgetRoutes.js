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


const budgetSummaryService = require("../services/budgetSummaryService");

// T-122 / T-123: Tổng hợp ngân sách, thực chi và cảnh báo.
router.get(
  "/:projectId/budgets/summary",
  requireAuth,
  checkProjectAccess,
  requirePermission("budget.view"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);

    if (!projectId) {
      return res.status(400).json({
        message: "projectId không hợp lệ",
      });
    }

    res.setHeader("Cache-Control", "no-store");

    const result = await budgetSummaryService.getBudgetSummary(projectId);
    return res.status(200).json(result);
  })
);

module.exports = router;
