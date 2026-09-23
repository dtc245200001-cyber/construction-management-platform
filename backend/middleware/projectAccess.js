const pool = require('../config/db');

// Middleware xác thực thành viên thuộc dự án
const checkProjectAccess = async (req, res, next) => {
  try {
    const projectId = req.params.projectId || req.body.projectId;
    const userId = req.user.id || req.user.user_id;
    console.log("--> DEBUG CHECK ACCESS:", { projectId, userId, user: req.user });

    if (!projectId) {
      return res.status(400).json({ error: 'Thiếu projectId' });
    }

    const query = `
      SELECT role 
      FROM project_members 
      WHERE project_id = $1 AND user_id = $2
    `;
    const result = await pool.query(query, [projectId, userId]);

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Bạn không có quyền truy cập dự án này' });
    }

    // Chuẩn hóa role về chữ hoa (ví dụ: OWNER, MANAGER, MEMBER)
    req.projectRole = String(result.rows[0].role).toUpperCase();
    next();
  } catch (error) {
    console.error('Lỗi kiểm tra quyền dự án:', error);
    res.status(500).json({ error: 'Lỗi server khi kiểm tra quyền' });
  }
};

// Middleware kiểm tra vai trò cụ thể trong dự án
const requireProjectRoles = (allowedRoles = []) => {
  return (req, res, next) => {
    // Nếu không truyền role nào, mặc định từ chối (default deny)
    if (!allowedRoles || allowedRoles.length === 0) {
      return res.status(403).json({ error: 'Không có quyền thực hiện hành động này' });
    }

    const currentRole = req.projectRole;
    const normalizedAllowedRoles = allowedRoles.map((r) => String(r).toUpperCase());

    if (!currentRole || !normalizedAllowedRoles.includes(currentRole)) {
      return res.status(403).json({ error: 'Vai trò của bạn không đủ quyền hạn' });
    }

    next();
  };
};

module.exports = {
  checkProjectAccess,
  requireProjectRoles,
};