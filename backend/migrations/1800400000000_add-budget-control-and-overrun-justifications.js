"use strict";

/**
 * S-46: Migration bổ sung Kiểm soát ngân sách & Giải trình vượt dự toán 3 tác nhân độc lập:
 *   1. Bổ sung cột `status` ('DRAFT', 'APPROVED', 'EFFECTIVE', 'ARCHIVED') vào bảng `budget_versions`
 *      để thanh kiểm soát ngân sách luôn lấy phiên bản đã được duyệt/đang hiệu lực thay vì bản nháp mới nhất.
 *   2. Tạo bảng `budget_overrun_justifications` lưu hồ sơ giải trình vượt dự toán với kiểm soát 3 tác nhân:
 *      - Tác nhân 1: Người lập giải trình (`submitted_by`) + Số văn bản pháp lý (`legal_document_ref`)
 *      - Tác nhân 2: Kế toán đối chiếu & xác nhận số liệu (`accountant_verified_by`, `accountant_verified_at`, `accountant_note`)
 *      - Tác nhân 3: Chủ đầu tư độc lập phê duyệt (`reviewed_by`, ràng buộc DB `reviewed_by <> submitted_by`)
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── 1. Bổ sung cột status cho budget_versions (idempotent) ──────────────
  pgm.sql(`
    ALTER TABLE budget_versions
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'APPROVED';

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'budget_versions_status_valid'
      ) THEN
        ALTER TABLE budget_versions
        ADD CONSTRAINT budget_versions_status_valid
        CHECK (status IN ('DRAFT', 'APPROVED', 'EFFECTIVE', 'ARCHIVED'));
      END IF;
    END $$;
  `);

  // ── 2. Bảng budget_overrun_justifications (Giải trình vượt dự toán 3 tác nhân) ──
  pgm.createTable(
    "budget_overrun_justifications",
    {
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
      budget_version_id: {
        type: "integer",
        notNull: false,
        references: "budget_versions",
        onDelete: "SET NULL",
      },
      reason_type: {
        type: "text",
        notNull: true,
      },
      explanation: {
        type: "text",
        notNull: true,
      },
      legal_document_ref: {
        type: "text",
        notNull: false,
      },
      status: {
        type: "varchar(30)",
        notNull: true,
        default: "PENDING_APPROVAL",
      },
      submitted_by: {
        type: "integer",
        notNull: true,
        references: "users",
        onDelete: "RESTRICT",
      },
      submitted_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("now()"),
      },
      accountant_verified_by: {
        type: "integer",
        notNull: false,
        references: "users",
        onDelete: "RESTRICT",
      },
      accountant_verified_at: {
        type: "timestamptz",
        notNull: false,
      },
      accountant_note: {
        type: "text",
        notNull: false,
      },
      reviewed_by: {
        type: "integer",
        notNull: false,
        references: "users",
        onDelete: "RESTRICT",
      },
      reviewed_at: {
        type: "timestamptz",
        notNull: false,
      },
      review_note: {
        type: "text",
        notNull: false,
      },
    },
    { ifNotExists: true }
  );

  // Đảm bảo các cột và ràng buộc tồn tại an toàn ngay cả khi bảng đã được tạo trước đó
  pgm.sql(`
    ALTER TABLE budget_overrun_justifications
      ADD COLUMN IF NOT EXISTS legal_document_ref TEXT,
      ADD COLUMN IF NOT EXISTS accountant_verified_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      ADD COLUMN IF NOT EXISTS accountant_verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS accountant_note TEXT;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'budget_justifications_status_valid'
      ) THEN
        ALTER TABLE budget_overrun_justifications
        ADD CONSTRAINT budget_justifications_status_valid
        CHECK (status IN ('PENDING_APPROVAL', 'PENDING_ASSIGNMENT', 'APPROVED', 'REJECTED'));
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'budget_justifications_no_self_review'
      ) THEN
        ALTER TABLE budget_overrun_justifications
        ADD CONSTRAINT budget_justifications_no_self_review
        CHECK (reviewed_by IS NULL OR reviewed_by <> submitted_by);
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS budget_overrun_justifications_project_id_idx
      ON budget_overrun_justifications (project_id);
    CREATE INDEX IF NOT EXISTS budget_overrun_justifications_project_work_item_idx
      ON budget_overrun_justifications (project_id, work_item_id);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable("budget_overrun_justifications", { ifExists: true, cascade: true });
  pgm.sql(`
    ALTER TABLE budget_versions DROP CONSTRAINT IF EXISTS budget_versions_status_valid;
    ALTER TABLE budget_versions DROP COLUMN IF EXISTS status;
  `);
};
