/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createIndex('work_items', ['project_id', 'parent_id', 'id'], {
    name: 'work_items_proj_parent_id_idx'
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('work_items', [], { name: 'work_items_proj_parent_id_idx' });
};
