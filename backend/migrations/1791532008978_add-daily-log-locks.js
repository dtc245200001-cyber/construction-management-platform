"use strict";

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE daily_log_locks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      log_date DATE NOT NULL,
      locked_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      unlocked_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      unlocked_at TIMESTAMPTZ,
      unlock_reason TEXT,
      is_locked BOOLEAN NOT NULL DEFAULT TRUE,
      
      CONSTRAINT daily_log_locks_project_date_key UNIQUE (project_id, log_date)
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE daily_log_locks CASCADE;`);
};
