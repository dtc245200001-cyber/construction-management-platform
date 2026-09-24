// middleware/projectAccess.js — Kiểm tra quyền truy cập dự án (RBAC).
//
// checkProjectAccess: xác nhận user là thành viên của dự án, gắn req.projectRole.
// requireProjectRoles: kiểm tra vai trò cụ thể; không truyền role → default deny (S-03).
//
// Mọi lần từ chối (403) đều ghi nhật ký có cấu trúc theo NFR S-03.

"use strict";

const pool = require("../config/db");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");

// Middleware xác thực thành viên thuộc dự án
const checkProjectAccess = asyncHandler(async (req, res, next) => {
  const projectId = req.params.projectId || req.body.projectId;
  // Chỉ dùng req.user.id (được gán bởi middleware/auth.js từ session)
  const userId = req.user.id;

  const { parsePositiveInt } = require("../utils/validators");
  const parsedProjectId = parsePositiveInt(projectId);

  if (!parsedProjectId) {
    return res.status(400).json({ error: "Thiếu projectId hoặc projectId không hợp lệ" });
  }

  const result = await pool.query(
    `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [parsedProjectId, userId]
  );

  if (result.rows.length === 0) {
    // Ghi nhật ký 403 có cấu trúc (NFR S-03) — không log body
    logger.warn({
      userId,
      projectId,
      method: req.method,
      path: req.path,
      reason: "NOT_MEMBER",
      ip: req.ip,
    }, "Truy cập bị từ chối: user không phải thành viên dự án");

    return res.status(403).json({ error: "Bạn không có quyền truy cập dự án này" });
  }

  // Chuẩn hóa role về chữ hoa (OWNER, MANAGER, MEMBER)
  req.projectRole = String(result.rows[0].role).toUpperCase();
  return next();
});

// Middleware kiểm tra vai trò cụ thể trong dự án
const requireProjectRoles = (allowedRoles = []) => {
  return (req, res, next) => {
    // Không truyền role nào → default deny (S-03)
    if (!allowedRoles || allowedRoles.length === 0) {
      logger.warn({
        userId: req.user && req.user.id,
        projectId: req.params.projectId,
        method: req.method,
        path: req.path,
        reason: "ROLE_NOT_ALLOWED",
        ip: req.ip,
      }, "Truy cập bị từ chối: route chưa khai báo role (default deny)");

      return res.status(403).json({ error: "Không có quyền thực hiện hành động này" });
    }

    const currentRole = req.projectRole;
    const normalizedAllowedRoles = allowedRoles.map((r) => String(r).toUpperCase());

    if (!currentRole || !normalizedAllowedRoles.includes(currentRole)) {
      logger.warn({
        userId: req.user && req.user.id,
        projectId: req.params.projectId,
        currentRole,
        allowedRoles: normalizedAllowedRoles,
        method: req.method,
        path: req.path,
        reason: "ROLE_NOT_ALLOWED",
        ip: req.ip,
      }, "Truy cập bị từ chối: vai trò không đủ quyền");

      return res.status(403).json({ error: "Vai trò của bạn không đủ quyền hạn" });
    }

    return next();
  };
};

module.exports = {
  checkProjectAccess,
  requireProjectRoles,
};