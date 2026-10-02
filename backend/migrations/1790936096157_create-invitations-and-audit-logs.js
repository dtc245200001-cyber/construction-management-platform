/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Bảng invitations
  pgm.createTable('invitations', {
    id: 'id',
    email: { type: 'varchar(255)', notNull: true },
    token: { type: 'varchar(255)', notNull: true, unique: true },
    invited_by: { type: 'integer', references: '"users"', notNull: true },
    expires_at: { type: 'timestamp', notNull: true },
    used_at: { type: 'timestamp' },
    project_id: { type: 'integer', references: '"projects"', onDelete: 'CASCADE' },
    project_role: { type: 'varchar(50)' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Bảng audit_logs
  pgm.createTable('audit_logs', {
    id: 'id',
    user_id: { type: 'integer', references: '"users"' },
    action: { type: 'varchar(100)', notNull: true },
    entity: { type: 'varchar(100)' },
    entity_id: { type: 'integer' },
    details: { type: 'jsonb' },
    ip_address: { type: 'varchar(45)' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
};

exports.down = pgm => {
  pgm.dropTable('audit_logs');
  pgm.dropTable('invitations');
};
