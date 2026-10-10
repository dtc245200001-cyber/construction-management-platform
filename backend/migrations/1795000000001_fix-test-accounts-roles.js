exports.up = (pgm) => {
  const accounts = [
    { email: 'banquanly@cong-truong-360.vn', role: 'ban_quan_ly' },
    { email: 'chihuytruong@cong-truong-360.vn', role: 'chi_huy_truong' },
    { email: 'kysugiamsat@cong-truong-360.vn', role: 'ky_su_giam_sat' },
    { email: 'doitruong@cong-truong-360.vn', role: 'doi_truong' },
    { email: 'chudautu@cong-truong-360.vn', role: 'chu_dau_tu' },
    { email: 'ketoan@cong-truong-360.vn', role: 'ke_toan' }
  ];

  accounts.forEach(acc => {
    // Project role only

    // Fix project role in all projects they belong to
    pgm.sql(`
      UPDATE project_members 
      SET role = '${acc.role}' 
      WHERE user_id IN (SELECT id FROM users WHERE email ILIKE '${acc.email}');
    `);
  });
};

exports.down = (pgm) => {
  // no-op
};
