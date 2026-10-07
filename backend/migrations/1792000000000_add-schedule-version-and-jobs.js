"use strict";

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    // 1. Add version and date to projects
    pgm.addColumns("projects", {
      last_schedule_calculated_date: {
        type: "date",
        notNull: false,
        default: null,
      },
      schedule_version: {
        type: "integer",
        notNull: true,
        default: 0,
      },
    });

    // 2. Create schedule_jobs table
    pgm.createTable("schedule_jobs", {
      id: {
        type: "uuid",
        primaryKey: true,
        default: pgm.func("gen_random_uuid()"),
      },
      project_id: {
        type: "integer",
        notNull: true,
        references: "projects(id)",
        onDelete: "CASCADE",
      },
      status: {
        type: "varchar(20)",
        notNull: true,
        default: "'queued'",
      },
      error_details: {
        type: "jsonb",
        notNull: false,
        default: null,
      },
      created_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
      updated_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
    });

    // Index on project_id and status for fast polling
    pgm.createIndex("schedule_jobs", ["project_id"]);
  },

  down: (pgm) => {
    pgm.dropTable("schedule_jobs", { ifExists: true });
    pgm.dropColumns("projects", ["last_schedule_calculated_date", "schedule_version"], { ifExists: true });
  },
};
