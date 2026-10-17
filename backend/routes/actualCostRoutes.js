"use strict";

const requireAuth = require("../middleware/auth");
const {
  checkProjectAccess,
  requirePermission,
  createProjectRouter,
} = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const actualCostService = require("../services/actualCostService");


const multer = require("multer");
const actualCostImportService = require("../services/actualCostImportService");

const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith(".csv")) {
      return callback(new Error("Chi chap nhan file .csv"));
    }
    callback(null, true);
  },
}).single("file");

function receiveCsv(req, res, next) {
  uploadCsv(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message: err.code === "LIMIT_FILE_SIZE"
          ? "File CSV vuot qua 1MB"
          : err.message,
      });
    }
    next();
  });
}

const router = createProjectRouter();

// T-120: Ghi nhận chi phí thực tế
router.post(
  "/:projectId/actual-costs",
  requireAuth,
  checkProjectAccess,
  requirePermission("cost.record"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);

    if (!projectId) {
      return res.status(400).json({
        message: "projectId không hợp lệ",
      });
    }

    const result = await actualCostService.createActualCost({
      projectId,
      userId: req.user.id,
      data: req.body || {},
    });

    if (result.status !== 201) {
      return res.status(result.status).json({
        message: result.error || "Dữ liệu không hợp lệ",
        ...(result.errors ? { errors: result.errors } : {}),
      });
    }

    return res.status(201).json({
      message: "Ghi nhận chi phí thành công",
      actual_cost: result.cost,
    });
  })
);

// T-120: Xem danh sách chi phí thực tế
router.get(
  "/:projectId/actual-costs",
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

    const costs = await actualCostService.getActualCosts(projectId);

    return res.status(200).json({
      project_id: projectId,
      total: costs.length,
      actual_costs: costs,
    });
  })
);


// T-121: Nhap chi phi thuc te hang loat bang CSV
router.post(
  "/:projectId/actual-costs/import",
  requireAuth,
  checkProjectAccess,
  requirePermission("cost.record"),
  receiveCsv,
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);

    if (!projectId) {
      return res.status(400).json({
        message: "projectId khong hop le",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Vui long tai len file CSV qua truong file",
      });
    }

    const result = await actualCostImportService.importActualCosts({
      projectId,
      userId: req.user.id,
      buffer: req.file.buffer,
    });

    if (result.status !== 201) {
      return res.status(result.status).json({
        message: result.error,
        ...(result.details ? { details: result.details } : {}),
        ...(result.errors ? { errors: result.errors } : {}),
      });
    }

    return res.status(201).json({
      message: "Nhap chi phi CSV thanh cong",
      imported: result.imported,
      actual_costs: result.actual_costs,
    });
  })
);

module.exports = router;
