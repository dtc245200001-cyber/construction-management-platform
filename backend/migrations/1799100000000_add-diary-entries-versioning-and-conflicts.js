"use strict";

/**
 * Story S-32: T-76 & T-77
 * Thêm version và updated_by cho diary_entries để kiểm soát sửa đồng thời.
 * Tạo bảng diary_entry_conflicts để lưu trữ xung đột hai phiên bản.
 */

exports.up = (pgm) => {
  // 1. Thêm version và updated_by cho diary_entries
  pgm.sql(`
    ALTER TABLE diary_entries
      ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE RESTRICT;
  `);

  // 2. Backfill updated_by từ created_by cho các bản ghi cũ
  pgm.sql(`
    UPDATE diary_entries
    SET updated_by = created_by
    WHERE updated_by IS NULL;
  `);

  // 3. Đặt constraint NOT NULL cho updated_by sau khi đã backfill
  pgm.sql(`
    ALTER TABLE diary_entries
      ALTER COLUMN updated_by SET NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE diary_entries DROP COLUMN IF EXISTS updated_by;`);
  pgm.sql(`ALTER TABLE diary_entries DROP COLUMN IF EXISTS version;`);
};
