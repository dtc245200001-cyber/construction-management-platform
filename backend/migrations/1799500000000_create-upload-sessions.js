"use strict";

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS upload_sessions (
      id SERIAL PRIMARY KEY,
      session_id UUID NOT NULL UNIQUE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_log_id INTEGER NULL REFERENCES task_logs(id) ON DELETE CASCADE,
      diary_entry_id INTEGER NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      file_name VARCHAR(255) NOT NULL,
      file_size BIGINT NOT NULL CHECK (file_size > 0),
      mime_type VARCHAR(100) NOT NULL,
      checksum VARCHAR(64) NOT NULL CHECK (char_length(checksum) = 64),
      bytes_uploaded BIGINT NOT NULL DEFAULT 0,
      total_chunks INTEGER NOT NULL DEFAULT 1,
      chunk_size INTEGER NOT NULL DEFAULT 524288,
      chunks_received INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'aborted', 'expired')),
      temp_file_path VARCHAR(500) NULL,
      attachment_id INTEGER NULL REFERENCES task_attachments(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
      
      CONSTRAINT upload_sessions_target_check CHECK (task_log_id IS NOT NULL OR diary_entry_id IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS upload_sessions_session_id_idx ON upload_sessions (session_id);
    CREATE INDEX IF NOT EXISTS upload_sessions_project_idx ON upload_sessions (project_id);
    CREATE INDEX IF NOT EXISTS upload_sessions_task_log_idx ON upload_sessions (task_log_id);
    CREATE INDEX IF NOT EXISTS upload_sessions_attachment_idx ON upload_sessions (attachment_id);
    CREATE INDEX IF NOT EXISTS upload_sessions_status_idx ON upload_sessions (status);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS upload_sessions CASCADE;`);
};
