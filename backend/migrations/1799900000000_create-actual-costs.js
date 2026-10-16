"use strict";

exports.up = (pgm) => {
  pgm.createTable("actual_costs", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    project_id: {
      type: "integer",
      notNull: true,
      references: "projects",
      onDelete: "RESTRICT",
    },
    work_item_id: {
      type: "integer",
      notNull: true,
      references: "work_items",
      onDelete: "RESTRICT",
    },
    amount: {
      type: "numeric(16,2)",
      notNull: true,
    },
    description: {
      type: "text",
      notNull: true,
    },
    expense_date: {
      type: "date",
      notNull: true,
    },
    created_by: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "RESTRICT",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint(
    "actual_costs",
    "actual_costs_amount_positive",
    "CHECK (amount > 0)"
  );

  pgm.addConstraint(
    "actual_costs",
    "actual_costs_description_not_blank",
    "CHECK (length(btrim(description)) > 0)"
  );

  pgm.createIndex("actual_costs", ["project_id", "work_item_id"]);
  pgm.createIndex("actual_costs", ["project_id", "expense_date"]);

  // Đảm bảo hạng mục thuộc đúng dự án ngay tại database.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION validate_actual_cost_work_item()
    RETURNS trigger AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM work_items
        WHERE id = NEW.work_item_id
          AND project_id = NEW.project_id
      ) THEN
        RAISE EXCEPTION 'Work item does not belong to project'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_validate_actual_cost_work_item
    BEFORE INSERT OR UPDATE OF project_id, work_item_id
    ON actual_costs
    FOR EACH ROW
    EXECUTE FUNCTION validate_actual_cost_work_item();
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("actual_costs", { ifExists: true });
  pgm.sql("DROP FUNCTION IF EXISTS validate_actual_cost_work_item()");
};
