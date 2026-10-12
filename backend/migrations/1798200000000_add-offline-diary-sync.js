"use strict";

exports.up = (pgm) => {
  pgm.addColumn("task_logs", {
    client_id: { type: "uuid" },
  });
  pgm.createIndex("task_logs", ["task_id", "client_id"], {
    unique: true,
    where: "client_id IS NOT NULL",
    name: "task_logs_task_client_id_idx",
  });

  pgm.createTable("diary_entry_attachments", {
    id: "id",
    diary_entry_id: {
      type: "integer",
      notNull: true,
      references: "diary_entries",
      onDelete: "CASCADE",
    },
    client_id: { type: "uuid", notNull: true },
    file_name: { type: "varchar(255)", notNull: true },
    file_size: { type: "integer", notNull: true },
    mime_type: { type: "varchar(50)", notNull: true },
    file_data: { type: "bytea", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });
  pgm.createIndex("diary_entry_attachments", ["diary_entry_id", "client_id"], {
    unique: true,
    name: "diary_entry_attachments_entry_client_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("diary_entry_attachments");
  pgm.dropIndex("task_logs", ["task_id", "client_id"], {
    name: "task_logs_task_client_id_idx",
  });
  pgm.dropColumn("task_logs", "client_id");
};
