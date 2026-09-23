module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.createTable("work_items", {
      id: {
        type: "serial",
        primaryKey: true,
      },
      project_id: {
        type: "integer",
        notNull: true,
        references: "projects",
        onDelete: "CASCADE",
      },
      parent_id: {
        type: "integer",
        notNull: false,
        references: "work_items",
        onDelete: "CASCADE",
      },
      name: {
        type: "varchar(255)",
        notNull: true,
      },
      code: {
        type: "varchar(50)",
        notNull: false,
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

    pgm.addConstraint("work_items", "work_items_parent_not_self", {
      check: '"parent_id" IS NULL OR "parent_id" <> "id"',
    });

    pgm.createIndex("work_items", "parent_id");
    pgm.createIndex("work_items", "project_id");
  },

  down: (pgm) => {
    pgm.dropTable("work_items");
  },
};
