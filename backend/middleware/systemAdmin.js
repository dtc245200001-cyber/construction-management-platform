const { logAudit, getClientIp } = require('../utils/auditLogger');

function requireSystemAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  if (!req.session.user.is_system_admin) {
    logAudit({
      userId: req.session.user.id,
      action: "ACCESS_DENIED_REQUIRE_SYSTEM_ADMIN",
      entity: "system",
      details: { method: req.method, path: req.originalUrl || req.path },
      ipAddress: getClientIp(req),
    });
    return res.status(403).json({ error: "Chỉ System Admin mới được thực hiện thao tác này" });
  }

  req.user = req.session.user;
  return next();
}

requireSystemAdmin.allowedRoles = ['SYSTEM_ADMIN'];

module.exports = requireSystemAdmin;

