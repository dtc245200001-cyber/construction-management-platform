exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('task_logs', {
    id: { type: 'serial', primaryKey: true },
    task_id: {
      type: 'integer',
      notNull: true,
      references: 'tasks',
      onDelete: 'CASCADE'
    },
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    content: {
      type: 'text',
      notNull: false
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  });

  pgm.createIndex('task_logs', 'task_id');

  pgm.createTable('task_attachments', {
    id: { type: 'serial', primaryKey: true },
    task_log_id: {
      type: 'integer',
      notNull: true,
      references: 'task_logs',
      onDelete: 'CASCADE'
    },
    file_path: {
      type: 'varchar(500)',
      notNull: true
    },
    file_name: {
      type: 'varchar(255)',
      notNull: true
    },
    file_size: {
      type: 'integer',
      notNull: true
    },
    mime_type: {
      type: 'varchar(50)',
      notNull: true
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  });

  pgm.createIndex('task_attachments', 'task_log_id');
};

exports.down = (pgm) => {
  pgm.dropTable('task_attachments');
  pgm.dropTable('task_logs');
};
