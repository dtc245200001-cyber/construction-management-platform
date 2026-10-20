"use strict";

// S-46 / T-118
// Tạo schema lưu dự toán theo hạng mục lá và phiên bản:
//   1. budget_versions – Quản lý phiên bản dự toán của dự án (hỗ trợ lưu lịch sử nhiều phiên bản)
//   2. budget_items    – Chi tiết dự toán theo từng hạng mục lá trong mỗi phiên bản
//
// Quy tắc nghiệp vụ tiền tệ & toàn vẹn:
//   - Số tiền dùng kiểu NUMERIC(16,2), chuẩn định dạng số chính xác.
//   - Số tiền không âm (amount >= 0) bằng CHECK constraint.
//   - Version number >= 1 bằng CHECK constraint.
//   - Mỗi dự án có các phiên bản độc lập (UNIQUE trên project_id, version_number).
//   - Trong mỗi phiên bản, mỗi hạng mục chỉ có một dòng dự toán (UNIQUE trên budget_version_id, work_item_id).
//   - Chỉ cho phép nhập dự toán ở hạng mục lá (leaf work item), chặn hạng mục cha bằng trigger.
//   - Hạng mục dự toán phải thuộc đúng dự án của phiên bản dự toán.
//   - Mọi khoá ngoại tiền tệ dùng ON DELETE RESTRICT (hoặc CASCADE khi xoá phiên bản).

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── 1. Bảng budget_versions ─────────────────────────────────────────────
  pgm.createTable("budget_versions", {
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
    version_number: {
      type: "integer",
      notNull: true,
    },
    description: {
      type: "text",
      notNull: false,
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
    "budget_versions",
    "budget_versions_version_positive",
    "CHECK (version_number >= 1)"
  );

  pgm.addConstraint(
    "budget_versions",
    "budget_versions_project_version_unique",
    {
      unique: ["project_id", "version_number"],
    }
  );

  pgm.createIndex("budget_versions", ["project_id"]);
  pgm.createIndex("budget_versions", ["project_id", "version_number"]);

  // ── 2. Bảng budget_items ────────────────────────────────────────────────
  pgm.createTable("budget_items", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    budget_version_id: {
      type: "integer",
      notNull: true,
      references: "budget_versions",
      onDelete: "CASCADE",
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
    note: {
      type: "text",
      notNull: false,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint(
    "budget_items",
    "budget_items_amount_non_negative",
    "CHECK (amount >= 0)"
  );

  pgm.addConstraint(
    "budget_items",
    "budget_items_version_work_item_unique",
    {
      unique: ["budget_version_id", "work_item_id"],
    }
  );

  pgm.createIndex("budget_items", ["budget_version_id"]);
  pgm.createIndex("budget_items", ["work_item_id"]);
  pgm.createIndex("budget_items", ["budget_version_id", "work_item_id"]);

  // ── 3. Trigger kiểm tra hạng mục lá và cùng dự án ───────────────────────
  pgm.sql(`
    CREATE OR REPLACE FUNCTION validate_budget_item()
    RETURNS trigger AS $$
    DECLARE
      v_version_project_id integer;
      v_item_project_id integer;
      v_has_child boolean;
    BEGIN
      -- Lấy project_id của phiên bản dự toán
      SELECT project_id INTO v_version_project_id
      FROM budget_versions
      WHERE id = NEW.budget_version_id;

      IF v_version_project_id IS NULL THEN
        RAISE EXCEPTION 'Phiên bản dự toán không tồn tại'
          USING ERRCODE = '23503';
      END IF;

      -- Lấy project_id và kiểm tra xem hạng mục có con (hạng mục cha) hay không
      SELECT project_id, EXISTS (
        SELECT 1 FROM work_items WHERE parent_id = NEW.work_item_id
      ) INTO v_item_project_id, v_has_child
      FROM work_items
      WHERE id = NEW.work_item_id;

      IF v_item_project_id IS NULL THEN
        RAISE EXCEPTION 'Hạng mục không tồn tại'
          USING ERRCODE = '23503';
      END IF;

      -- 1. Hạng mục phải thuộc đúng dự án của phiên bản dự toán
      IF v_version_project_id <> v_item_project_id THEN
        RAISE EXCEPTION 'Hạng mục không thuộc dự án của phiên bản dự toán'
          USING ERRCODE = '23514',
                CONSTRAINT = 'budget_items_project_match';
      END IF;

      -- 2. Chỉ hạng mục lá mới được nhập dự toán (không có hạng mục con)
      IF v_has_child THEN
        RAISE EXCEPTION 'Chỉ được nhập dự toán cho hạng mục lá, không nhập trực tiếp ở hạng mục cha'
          USING ERRCODE = '23514',
                CONSTRAINT = 'budget_items_leaf_only';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_validate_budget_item
    BEFORE INSERT OR UPDATE OF budget_version_id, work_item_id
    ON budget_items
    FOR EACH ROW
    EXECUTE FUNCTION validate_budget_item();
  `);

  // ── 4. Comment tài liệu tiếng Việt ──────────────────────────────────────
  pgm.sql(`
    COMMENT ON TABLE "budget_versions" IS
      'Quản lý phiên bản dự toán theo dự án (T-118, S-46), lưu lịch sử dự toán khi điều chỉnh';
    COMMENT ON COLUMN "budget_versions"."version_number" IS
      'Số thứ tự phiên bản (1, 2, 3...) tăng dần cho mỗi lần điều chỉnh dự toán của dự án';
    COMMENT ON TABLE "budget_items" IS
      'Chi tiết số tiền dự toán phân bổ cho từng hạng mục lá trong mỗi phiên bản (T-118, S-46)';
    COMMENT ON COLUMN "budget_items"."amount" IS
      'Số tiền dự toán của hạng mục lá, kiểu numeric(16,2), không âm';
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP TRIGGER IF EXISTS trg_validate_budget_item ON budget_items;");
  pgm.sql("DROP FUNCTION IF EXISTS validate_budget_item();");
  pgm.dropTable("budget_items", { ifExists: true, cascade: true });
  pgm.dropTable("budget_versions", { ifExists: true, cascade: true });
};
