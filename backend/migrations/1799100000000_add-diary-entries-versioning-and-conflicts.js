"use strict";

/**
 * Story S-32: T-76 & T-77
 * T-76: thêm version và updated_by cho diary_entries.
 * T-77: lưu hai phiên bản khi xảy ra xung đột.
 */

exports.up = (pgm) => {
  // T-76: thêm version và updated_by
  pgm.sql(`
    ALTER TABLE diary_entries
      ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN updated_by INTEGER REFERENCES users(id) ON DELETE RESTRICT;
  `);

  // Backfill dữ liệu cũ, nhưng giữ updated_by nullable để tương thích
  // với các INSERT cũ không truyền updated_by.
  pgm.sql(`
    UPDATE diary_entries
    SET updated_by = created_by
    WHERE updated_by IS NULL;
  `);

  // T-77: bảng lưu xung đột phiên bản
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
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'resolved')),
      resolution VARCHAR(20) NULL
        CHECK (resolution IS NULL OR resolution IN ('server', 'client')),
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