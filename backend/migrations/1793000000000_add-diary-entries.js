"use strict";

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE diary_entries (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      work_item_id INTEGER NOT NULL,
      entry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      entry_date DATE GENERATED ALWAYS AS ((entry_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) STORED,
      content TEXT NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 5000),
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      client_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      FOREIGN KEY (project_id, work_item_id) REFERENCES work_items(project_id, id) ON DELETE NO ACTION
    );
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX diary_entries_client_id_idx ON diary_entries (project_id, client_id) WHERE client_id IS NOT NULL;
  `);

  pgm.sql(`
    CREATE INDEX diary_entries_project_date_idx ON diary_entries (project_id, entry_date, entry_at DESC, id DESC);
  `);

  pgm.sql(`
    CREATE INDEX diary_entries_project_work_item_idx ON diary_entries (project_id, work_item_id, entry_at DESC, id DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE diary_entries CASCADE;`);
};
