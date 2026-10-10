"use strict";

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    // ---------- 1. Đội thi công, thuộc một dự án ----------
    pgm.createTable("teams", {
      id: { type: "serial", primaryKey: true },
      project_id: {
        type: "integer",
        notNull: true,
        references: "projects",
        onDelete: "CASCADE",
      },
      name: { type: "varchar(100)", notNull: true },
      created_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
    });

    // Cho phép bảng con tham chiếu cặp (id, project_id)
    pgm.addConstraint("teams", "teams_id_project_unique", {
      unique: ["id", "project_id"],
    });

    // Một dự án không có hai đội trùng tên (không phân biệt hoa thường)
    pgm.sql(
      "CREATE UNIQUE INDEX teams_project_name_unique ON teams (project_id, lower(name));"
    );

    // ---------- 2. Thành viên đội ----------
    pgm.createTable("team_members", {
      id: { type: "serial", primaryKey: true },
      team_id: { type: "integer", notNull: true },
      project_id: { type: "integer", notNull: true },
      user_id: { type: "integer", notNull: true },
      created_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
    });

    pgm.addConstraint("team_members", "team_members_team_user_unique", {
      unique: ["team_id", "user_id"],
    });

    // Đội và thành viên phải cùng dự án (DB tự chặn, không chỉ dựa vào code)
    pgm.sql(`
      ALTER TABLE team_members
        ADD CONSTRAINT team_members_team_project_fk
        FOREIGN KEY (team_id, project_id)
        REFERENCES teams (id, project_id)
        ON DELETE CASCADE;
    `);

    // Người được thêm phải đang là thành viên của chính dự án đó
    pgm.sql(`
      ALTER TABLE team_members
        ADD CONSTRAINT team_members_project_user_fk
        FOREIGN KEY (project_id, user_id)
        REFERENCES project_members (project_id, user_id)
        ON DELETE CASCADE;
    `);

    // ---------- 3. Giao việc: mỗi task thuộc tối đa một đội ----------
    pgm.createTable("task_assignments", {
      task_id: {
        type: "integer",
        primaryKey: true,
        references: "tasks",
        onDelete: "CASCADE",
      },
      team_id: {
        type: "integer",
        notNull: true,
        references: "teams",
        onDelete: "CASCADE",
      },
      assigned_by: {
        type: "integer",
        references: "users",
        onDelete: "SET NULL",
      },
      assigned_at: {
        type: "timestamp",
        notNull: true,
        default: pgm.func("current_timestamp"),
      },
    });

    // Tăng tốc truy vấn "việc của đội A"
    pgm.createIndex("task_assignments", "team_id");
  },

  down: (pgm) => {
    pgm.dropTable("task_assignments");
    pgm.dropTable("team_members");
    pgm.dropTable("teams");
  },
};