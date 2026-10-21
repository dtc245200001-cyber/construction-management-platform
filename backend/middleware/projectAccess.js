"use strict";

const express = require("express");
const pool = require("../config/db");
const logger = require("../utils/logger");
const asyncHandler = require("../utils/asyncHandler");
const { PERMISSIONS, ROLE_LABELS, can: canPermission } = require("../utils/permissions");
const { financialSerializerMiddleware } = require("../utils/financialSerializer");
const { logAudit, getClientIp } = require("../utils/auditLogger");
const resolveClientIp = (req) => (typeof getClientIp === "function" ? getClientIp(req) : req?.ip || null);

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

    const clientIp = resolveClientIp(req);

    logger.warn({
      userId,
      projectId,
      method: req.method,
      path: req.path,
      reason: "NOT_MEMBER",
      ip: clientIp,
    }, "Truy cập bị từ chối: user không phải thành viên dự án");

    logAudit({
      userId,
      action: "ACCESS_DENIED_NOT_MEMBER",
      entity: "projects",
      projectId: parsedProjectId,
      details: { method: req.method, path: req.originalUrl || req.path, reason: "NOT_MEMBER" },
      ipAddress: clientIp,
    });

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

    const clientIp = resolveClientIp(req);

    if (!roles || roles.length === 0) {
      logger.warn({
        userId: req.user && req.user.id,
        projectId: req.params.projectId,
        method: req.method,
        path: req.path,
        reason: "ROLE_NOT_ALLOWED",
        ip: clientIp,
      }, "Truy cập bị từ chối: route chưa khai báo role (default deny)");

      logAudit({
        userId: req.user && req.user.id,
        action: "ACCESS_DENIED_ROLE_NOT_ALLOWED",
        entity: "projects",
        projectId: req.params.projectId,
        details: { method: req.method, path: req.originalUrl || req.path, reason: "ROLE_NOT_CONFIGURED" },
        ipAddress: clientIp,
      });

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
        ip: clientIp,
      }, "Truy cập bị từ chối: vai trò không đủ quyền");

      logAudit({
        userId: req.user && req.user.id,
        action: "ACCESS_DENIED_ROLE_NOT_ALLOWED",
        entity: "projects",
        projectId: req.params.projectId,
        details: { method: req.method, path: req.originalUrl || req.path, currentRole, allowedRoles: normalizedAllowedRoles },
        ipAddress: clientIp,
      });

      return res.status(403).json({ error: "Vai trò của bạn không đủ quyền hạn" });
    }

    res.locals.roleChecked = true;
    return next();
  };
  
  // Gắn cờ để createProjectRouter nhận biết route này có check quyền
  mw.allowedRoles = roles;
  return mw;
};

// Middleware kiểm tra quyền theo ma trận trung tâm (utils/permissions.js).
// THAY THẾ dần cho allow([...]) rải rác ở từng route — thêm role mới hoặc đổi
// quyền chỉ cần sửa 1 chỗ (PERMISSIONS), không phải sửa từng route.
// Yêu cầu chạy sau checkProjectAccess (để có req.projectRole).
const requirePermission = (permissionKey) => {
  const mw = (req, res, next) => {
    if (req.user && req.user.is_system_admin) {
      res.locals.roleChecked = true;
      return next();
    }

    const currentRole = req.projectRole ? String(req.projectRole) : "";

    if (canPermission(currentRole, permissionKey)) {
      res.locals.roleChecked = true;
      return next();
    }

    const roleLabel = ROLE_LABELS[currentRole] || currentRole || "chưa xác định";
    const clientIp = resolveClientIp(req);

    logger.warn({
      userId: req.user && req.user.id,
      projectId: req.params.projectId,
      currentRole,
      permissionKey,
      allowedRoles: PERMISSIONS[permissionKey] || [],
      method: req.method,
      path: req.path,
      reason: "PERMISSION_DENIED",
      ip: clientIp,
    }, "Truy cập bị từ chối: vai trò không đủ quyền");

    logAudit({
      userId: req.user && req.user.id,
      action: "ACCESS_DENIED_PERMISSION_REQUIRED",
      entity: "projects",
      projectId: req.params.projectId,
      details: { method: req.method, path: req.originalUrl || req.path, currentRole, permissionKey },
      ipAddress: clientIp,
    });

    return res.status(403).json({
      error: `Vai trò ${roleLabel} không có quyền ${permissionKey}`,
    });
  };

  // Gắn cờ để createProjectRouter nhận biết route này có check quyền
  mw.permissionKey = permissionKey;
  return mw;
};

// Trình trợ giúp tạo Router dự án mặc định từ chối
const createProjectRouter = () => {
  const router = express.Router({ mergeParams: true });
  // OV-1: Tầng Serializer bảo vệ - tự động loại bỏ các trường tiền tệ nhạy cảm đối với Đội trưởng
  router.use(financialSerializerMiddleware());
  
  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  methods.forEach(method => {
    const original = router[method].bind(router);
    
    router[method] = (path, ...handlers) => {
      // Tìm xem có middleware kiểm tra quyền nào không
      // (allow() cũ gắn allowedRoles, requirePermission() mới gắn permissionKey)
      const hasRoleCheck = handlers.some(h => h && (h.allowedRoles || h.permissionKey));
      
      if (!hasRoleCheck) {
        // Gắn middleware default deny vào đầu chuỗi xử lý
        const defaultDeny = (req, res, next) => {
          // Bỏ qua nếu route không chứa projectId (ví dụ: GET /api/projects)
          if (!req.params.projectId) {
            return next();
          }

          const clientIp = resolveClientIp(req);

          logger.warn({
            userId: req.user && req.user.id,
            projectId: req.params.projectId,
            method: req.method,
            path: req.path,
            reason: "DEFAULT_DENY",
            ip: clientIp,
          }, "Truy cập bị từ chối: route không sử dụng wrapper allow()");

          logAudit({
            userId: req.user && req.user.id,
            action: "ACCESS_DENIED_DEFAULT_DENY",
            entity: "projects",
            projectId: req.params.projectId,
            details: { method: req.method, path: req.originalUrl || req.path, reason: "DEFAULT_DENY" },
            ipAddress: clientIp,
          });
          
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
  requirePermission,
  can: canPermission,
  createProjectRouter,
};