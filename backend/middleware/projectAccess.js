"use strict";

const express = require("express");
const pool = require("../config/db");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");

// Middleware xác thực thành viên thuộc dự án
const checkProjectAccess = asyncHandler(async (req, res, next) => {
  const projectId = req.params.projectId;
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
    if (req.user && req.user.is_system_admin) {
      req.projectRole = "system_admin";
      return next();
    }

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

  req.projectRole = String(result.rows[0].role);
  return next();
});

// Wrapper kiểm tra quyền
const allow = (roles = []) => {
  const mw = (req, res, next) => {
    if (req.user && req.user.is_system_admin) {
      res.locals.roleChecked = true;
      return next();
    }

    if (!roles || roles.length === 0) {
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
    const normalizedAllowedRoles = roles.map((r) => String(r));

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

    res.locals.roleChecked = true;
    return next();
  };
  
  // Gắn cờ để createProjectRouter nhận biết route này có check quyền
  mw.allowedRoles = roles;
  return mw;
};

// Trình trợ giúp tạo Router dự án mặc định từ chối
const createProjectRouter = () => {
  const router = express.Router({ mergeParams: true });
  
  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  methods.forEach(method => {
    const original = router[method].bind(router);
    
    router[method] = (path, ...handlers) => {
      // Tìm xem có middleware allow() nào không
      const hasRoleCheck = handlers.some(h => h && h.allowedRoles);
      
      if (!hasRoleCheck) {
        // Gắn middleware default deny vào đầu chuỗi xử lý
        const defaultDeny = (req, res, next) => {
          // Bỏ qua nếu route không chứa projectId (ví dụ: GET /api/projects)
          if (!req.params.projectId) {
            return next();
          }

          logger.warn({
            userId: req.user && req.user.id,
            projectId: req.params.projectId,
            method: req.method,
            path: req.path,
            reason: "DEFAULT_DENY",
            ip: req.ip,
          }, "Truy cập bị từ chối: route không sử dụng wrapper allow()");
          
          if (process.env.NODE_ENV !== 'production') {
            throw new Error(`Route chưa khai báo quyền truy cập: ${method.toUpperCase()} ${path}`);
          }
          
          return res.status(403).json({ error: "Chưa phân quyền cho endpoint này" });
        };
        
        // Đặt defaultDeny lên đầu
        handlers.unshift(defaultDeny);
      }
      
      return original(path, ...handlers);
    };
  });
  
  return router;
};

// Vẫn xuất requireProjectRoles để tương thích ngược nếu cần, trỏ về allow
module.exports = {
  checkProjectAccess,
  requireProjectRoles: allow,
  allow,
  createProjectRouter,
};