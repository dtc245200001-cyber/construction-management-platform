"use strict";

// S-49 / T-124 — API tổng hợp tiến độ cho dashboard Chủ đầu tư.
//
// Route được tạo bằng createProjectRouter() nên tuân thủ cơ chế default-deny:
// mọi route phải khai báo requirePermission(...). Ở đây dashboard là dữ liệu
// tổng quan dự án -> mở cho mọi thành viên (project.member), chặn người ngoài
// dự án qua checkProjectAccess (project_members) — không tin projectId client.

const db = require("../config/db");
const requireAuth = require("../middleware/auth");
const { checkProjectAccess, requirePermission, createProjectRouter } = require("../middleware/projectAccess");
const asyncHandler = require("../utils/asyncHandler");
const { parsePositiveInt } = require("../utils/validators");
const { getProgressDashboard } = require("../services/progressDashboardService");

const router = createProjectRouter();

// GET /api/projects/:projectId/progress-dashboard
// Tổng hợp % hoàn thành theo giá trị HĐ, chênh lệch ngày so với baseline,
// mốc bị vượt và công việc găng đang chậm — chỉ cho thành viên dự án.
/**
 * @swagger
 * /api/projects/{projectId}/progress-dashboard:
 *   get:
 *     summary: Tổng hợp tiến độ dự án cho dashboard chủ đầu tư
 *     tags: [Progress]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: projectId không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không thuộc dự án
 */
router.get(
  "/:projectId/progress-dashboard",
  requireAuth,
  checkProjectAccess,
  requirePermission("progress.view"),
  asyncHandler(async (req, res) => {
    const projectId = parsePositiveInt(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ message: "projectId không hợp lệ" });
    }

    // Xác nhận dự án tồn tại (checkProjectAccess đã chặn non-member,
    // nhưng giữ 404 rõ ràng nếu id hợp lệ mà không có dự án).
    const p = await db.query("SELECT id, name FROM projects WHERE id = $1", [projectId]);
    if (p.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy dự án" });
    }

    const data = await getProgressDashboard(projectId);
    data.project_name = p.rows[0].name;
    return res.json(data);
  })
);

module.exports = router;
