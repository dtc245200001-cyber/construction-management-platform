module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable('milestones', {
      id: { type: 'serial', primaryKey: true },
      work_item_id: {
        type: 'integer',
        notNull: true,
        references: 'work_items',
        onDelete: 'CASCADE',
      },
      required_date: {
        type: 'timestamp',
        notNull: true,
      },
      created_by: {
        type: 'integer',
        notNull: true,
        references: 'users',
      },
      is_active: {
        type: 'boolean',
        notNull: true,
        default: true,
      },
      created_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
      updated_at: {
        type: 'timestamp',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    });

    pgm.createIndex('milestones', 'work_item_id', {
      name: 'milestones_active_work_item_idx',
      unique: true,
      where: 'is_active = true',
    });
  },

  down: (pgm) => {
    pgm.dropIndex('milestones', 'work_item_id', { name: 'milestones_active_work_item_idx' });
    pgm.dropTable('milestones');
  },
};
