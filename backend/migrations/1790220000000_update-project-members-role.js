/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Drop constraint first to allow modifications
  pgm.dropConstraint('project_members', 'chk_role', { ifExists: true });

  // Update roles
  pgm.sql(`
    UPDATE project_members SET role = 
      CASE role
        WHEN 'OWNER' THEN 'ban_quan_ly'
        WHEN 'MANAGER' THEN 'ban_quan_ly'
        WHEN 'MEMBER' THEN 'ky_su_giam_sat'
        ELSE role
      END;
  `);

  // Add new constraint
  pgm.addConstraint('project_members', 'chk_role', {
    check: "role IN ('chu_dau_tu', 'ban_quan_ly', 'ky_su_giam_sat', 'chi_huy_truong', 'doi_truong', 'ke_toan')"
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('project_members', 'chk_role', { ifExists: true });

  pgm.sql(`
    UPDATE project_members SET role = 
      CASE role
        WHEN 'ban_quan_ly' THEN 'OWNER'
        WHEN 'ky_su_giam_sat' THEN 'MEMBER'
        ELSE 'MEMBER'
      END;
  `);

  pgm.addConstraint('project_members', 'chk_role', {
    check: "role IN ('OWNER', 'MANAGER', 'MEMBER')"
  });
};
