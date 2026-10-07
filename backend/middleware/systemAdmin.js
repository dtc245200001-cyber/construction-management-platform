function requireSystemAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  if (!req.session.user.is_system_admin) {
    return res.status(403).json({ error: "Chỉ System Admin mới được thực hiện thao tác này" });
  }

  req.user = req.session.user;
  return next();
}

requireSystemAdmin.allowedRoles = ['SYSTEM_ADMIN'];

module.exports = requireSystemAdmin;
