"use strict";

const pool = require("../config/db");
const { logAudit, getClientIp, sanitizeAuditDetails } = require("../utils/auditLogger");

/**
 * Kiểm tra xem user có quyền tạo dự án hay không:
 * - System admin -> true
 * - User đang giữ vai trò Ban quản lý ở ít nhất một dự án, tài khoản hoạt động và đã xác thực -> true
 * - Các vai trò khác hoặc chưa làm BQL -> false
 */
async function checkUserProjectCreatePermission(userId, isSystemAdmin) {
  if (isSystemAdmin) {
    return true;
  }
  if (!userId) return false;

  const result = await pool.query(
    `SELECT 1
     FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     JOIN users u ON u.id = pm.user_id
     WHERE pm.user_id = $1
       AND pm.role = 'ban_quan_ly'
       AND u.is_verified = true
       AND (u.locked_until IS NULL OR u.locked_until <= CURRENT_TIMESTAMP)
     LIMIT 1`,
    [userId]
  );

  return result.rows.length > 0;
}

/**
 * Middleware bảo vệ route POST /api/projects
 */
async function requireProjectCreatePermission(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  const userId = req.session.user.id;
  const isSystemAdmin = Boolean(req.session.user.is_system_admin);

  try {
    const allowed = await checkUserProjectCreatePermission(userId, isSystemAdmin);

    if (!allowed) {
      const clientIp = getClientIp(req);
      logAudit({
        userId,
        action: "CREATE_PROJECT_DENIED",
        entity: "projects",
        details: {
          method: req.method,
          path: req.originalUrl || req.path,
          reason: "NOT_PROJECT_CREATOR",
          body: sanitizeAuditDetails(req.body),
        },
        ipAddress: clientIp,
      });

      return res.status(403).json({
        error: "Bạn không có quyền tạo dự án. Chỉ System Admin hoặc người đang giữ vai trò Ban quản lý mới được tạo dự án.",
      });
    }

    req.user = req.session.user;
    req.isSystemAdminCreator = isSystemAdmin;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  checkUserProjectCreatePermission,
  requireProjectCreatePermission,
};
