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

  // 4. Tạo bảng lưu trữ xung đột phiên bản diary_entry_conflicts
  pgm.sql(`
    CREATE TABLE diary_entry_conflicts (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      diary_entry_id INTEGER NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
      client_version INTEGER NOT NULL,
      server_version INTEGER NOT NULL,
      client_snapshot JSONB NOT NULL,
      server_snapshot JSONB NOT NULL,
      client_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      server_updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      client_updated_at TIMESTAMPTZ NULL,
      server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source VARCHAR(50) NOT NULL DEFAULT 'offline_sync',
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
      resolution VARCHAR(20) NULL CHECK (resolution IS NULL OR resolution IN ('server', 'client')),
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ NULL,
      resolved_version INTEGER NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX diary_entry_conflicts_project_status_idx
      ON diary_entry_conflicts (project_id, status);

    CREATE INDEX diary_entry_conflicts_entry_idx
      ON diary_entry_conflicts (diary_entry_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS diary_entry_conflicts CASCADE;`);
  pgm.sql(`ALTER TABLE diary_entries DROP COLUMN IF EXISTS updated_by;`);
  pgm.sql(`ALTER TABLE diary_entries DROP COLUMN IF EXISTS version;`);
};
