exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addConstraint('work_items', 'chk_no_self_parent', {
    check: 'parent_id <> id'
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('work_items', 'chk_no_self_parent');
};
