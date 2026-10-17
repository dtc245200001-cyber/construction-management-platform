/* eslint-disable camelcase */

exports.shorthands = undefined;

// Bảng lưu token đặt lại mật khẩu.
// Token thật chỉ tồn tại trong email — DB chỉ giữ token_hash (sha256).
exports.up = pgm => {
  pgm.createTable('password_reset_tokens', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'varchar(64)', notNull: true, unique: true },
    expires_at: { type: 'timestamp', notNull: true },
    used_at: { type: 'timestamp' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('password_reset_tokens', ['user_id']);
  pgm.createIndex('password_reset_tokens', ['token_hash'], { unique: true });
  pgm.createIndex('password_reset_tokens', ['expires_at']);
};

exports.down = pgm => {
  pgm.dropTable('password_reset_tokens');
};
