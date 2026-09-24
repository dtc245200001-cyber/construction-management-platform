/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql("UPDATE project_members SET role = UPPER(role);");
  pgm.addConstraint('project_members', 'chk_role', {
    check: "role IN ('OWNER', 'MANAGER', 'MEMBER')"
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('project_members', 'chk_role');
};
