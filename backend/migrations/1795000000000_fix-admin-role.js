exports.up = (pgm) => {
  // Update any system admin with role 'chu_dau_tu' to 'ban_quan_ly' globally
  pgm.sql(`
    UPDATE users 
    SET role_id = (SELECT id FROM roles WHERE name = 'system_admin' LIMIT 1)
    WHERE is_system_admin = true AND email = 'admin@congtrinh.vn';
  `);

  // Update their project roles if they were inserted as chu_dau_tu
  pgm.sql(`
    UPDATE project_members 
    SET role = 'ban_quan_ly' 
    WHERE user_id IN (SELECT id FROM users WHERE is_system_admin = true AND email = 'admin@congtrinh.vn')
      AND role = 'chu_dau_tu';
  `);
};

exports.down = (pgm) => {
  // Not strictly reversible without knowing previous state, but we can do a no-op
};
