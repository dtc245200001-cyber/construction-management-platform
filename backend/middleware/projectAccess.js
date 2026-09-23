const db = require("../config/db");

/**
 * Middleware kiểm tra quyền truy cập theo project.
 *
 * Default deny:
 * - Không khai báo role => 403
 * - Không phải thành viên project => 403
 * - Role không được phép => 403
 */
function requireProjectRoles(allowedRoles = []) {
  const normalizedAllowedRoles = Array.isArray(allowedRoles)
    ? allowedRoles.map((role) => String(role).toUpperCase())
    : [];

  return async (req, res, next) => {
    try {
      // DEFAULT DENY
      if (normalizedAllowedRoles.length === 0) {
        return res.status(403).json({
          message: "Forbidden: route chưa khai báo quyền truy cập",
        });
      }

      // Chưa đăng nhập
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          message: "Chưa đăng nhập",
        });
      }

      const projectId = Number(req.params.projectId);

      // Project ID không hợp lệ
      if (!Number.isInteger(projectId) || projectId <= 0) {
        return res.status(400).json({
          message: "Project ID không hợp lệ",
        });
      }

      // Kiểm tra user có thuộc project không
      const result = await db.query(
        `SELECT id, user_id, project_id, role
         FROM project_members
         WHERE user_id = $1
           AND project_id = $2
         LIMIT 1`,
        [req.user.id, projectId]
      );

      // Không phải thành viên project
      if (result.rows.length === 0) {
        return res.status(403).json({
          message: "Forbidden: bạn không phải thành viên của dự án",
        });
      }

      const membership = result.rows[0];

      const memberRole = String(membership.role).toUpperCase();

      // Có trong project nhưng role không được phép
      if (!normalizedAllowedRoles.includes(memberRole)) {
        return res.status(403).json({
          message: "Forbidden: bạn không có quyền thực hiện thao tác này",
        });
      }

      // Lưu membership cho handler phía sau
      req.projectMember = membership;

      return next();
    } catch (error) {
      console.error("PROJECT ACCESS ERROR:", error);

      return res.status(500).json({
        message: "Lỗi máy chủ khi kiểm tra quyền dự án",
      });
    }
  };
}

// QUAN TRỌNG:
// export trực tiếp function để require(...) nhận được function
module.exports = requireProjectRoles;