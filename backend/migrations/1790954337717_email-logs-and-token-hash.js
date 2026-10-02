/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Băm token: Xoá cột token cũ (lưu raw), thay bằng token_hash
  // Lưu ý: trong thực tế nếu có dữ liệu cũ cần migrate cẩn thận,
  // nhưng ở đây coi như ta xoá hết data rác hoặc xoá cột token đi rồi tạo token_hash.
  pgm.dropColumn('invitations', 'token');
  pgm.addColumn('invitations', {
    token_hash: { type: 'varchar(255)', notNull: true, unique: true }
  });

  // Bảng email_logs
  pgm.createTable('email_logs', {
    id: 'id',
    invitation_id: { type: 'integer', references: '"invitations"', onDelete: 'CASCADE' },
    email_masked: { type: 'varchar(255)', notNull: true },
    status: { type: 'varchar(50)', notNull: true, default: 'pending' }, // pending, sent, error
    retry_count: { type: 'integer', notNull: true, default: 0 },
    message_id: { type: 'varchar(255)' },
    error_reason: { type: 'text' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    }
  });
};

exports.down = pgm => {
  pgm.dropTable('email_logs');
  
  pgm.dropColumn('invitations', 'token_hash');
  pgm.addColumn('invitations', {
    token: { type: 'varchar(255)', notNull: true, unique: true }
  });
};
