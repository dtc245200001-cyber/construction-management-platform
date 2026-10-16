"use strict";

// S-43 / T-111
// Tạo 3 bảng phục vụ đề nghị thanh toán từ phiếu nghiệm thu đã duyệt:
//   1. payment_requests              – đề nghị thanh toán (header)
//   2. payment_request_acceptances   – bảng liên kết đề nghị - phiếu nghiệm thu
//   3. payment_request_lines         – chi tiết từng dòng thanh toán của hạng mục
//
// Quy tắc nghiệp vụ tiền tệ:
//   - Mọi FK dùng ON DELETE RESTRICT (không CASCADE trên dữ liệu tiền).
//   - Tiền, khối lượng, đơn giá dùng NUMERIC (không dùng float).
//   - Mỗi phiếu nghiệm thu chỉ nằm trong tối đa 1 đề nghị đang có hiệu lực
//     (bảo đảm qua partial unique index trên acceptance_id WHERE released_at IS NULL).
//   - amount = ROUND(quantity * unit_price, 0) bảo đảm bằng CHECK constraint.
//   - FK ghép (payment_request_id, acceptance_id) bảo đảm không có dòng của phiếu
//     không thuộc đề nghị thanh toán.

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── 1. Bảng đề nghị thanh toán (header) ──────────────────────────────────
  pgm.createTable("payment_requests", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    // Thuộc dự án nào — ON DELETE RESTRICT
    project_id: {
      type: "integer",
      notNull: true,
      references: "projects",
      onDelete: "RESTRICT",
    },
    // Kỳ đề nghị thanh toán
    period_start: {
      type: "date",
      notNull: true,
    },
    period_end: {
      type: "date",
      notNull: true,
    },
    // Trạng thái: DRAFT | APPROVED | RETURNED
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "'DRAFT'",
    },
    // Tổng số tiền đề nghị (VND không âm)
    total_amount: {
      type: "numeric(18,2)",
      notNull: true,
      default: 0,
    },
    // Người lập đề nghị
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
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // Ràng buộc CHECK trạng thái hợp lệ
  pgm.addConstraint(
    "payment_requests",
    "payment_requests_status_check",
    {
      check: "\"status\" IN ('DRAFT', 'APPROVED', 'RETURNED')",
    }
  );

  // Ràng buộc CHECK ngày kết thúc >= ngày bắt đầu
  pgm.addConstraint(
    "payment_requests",
    "payment_requests_period_check",
    {
      check: '"period_end" >= "period_start"',
    }
  );

  // Ràng buộc CHECK tổng đề nghị không âm
  pgm.addConstraint(
    "payment_requests",
    "payment_requests_total_amount_check",
    {
      check: '"total_amount" >= 0',
    }
  );

  // Chỉ mục tra cứu
  pgm.createIndex("payment_requests", ["project_id", "status"]);
  pgm.createIndex("payment_requests", ["project_id", "created_at"]);
  pgm.createIndex("payment_requests", ["created_by"]);

  pgm.sql(`
    COMMENT ON TABLE "payment_requests" IS
      'Đề nghị thanh toán sinh từ phiếu nghiệm thu đã duyệt (S-43/T-111).';
    COMMENT ON COLUMN "payment_requests"."status" IS
      'DRAFT | APPROVED | RETURNED. Mặc định DRAFT.';
    COMMENT ON COLUMN "payment_requests"."total_amount" IS
      'Tổng tiền đề nghị thanh toán (VND) = tổng các dòng đã làm tròn. Không âm.';
  `);

  // ── 2. Bảng liên kết đề nghị - phiếu nghiệm thu ──────────────────────────
  pgm.createTable("payment_request_acceptances", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    payment_request_id: {
      type: "integer",
      notNull: true,
      references: "payment_requests",
      onDelete: "RESTRICT",
    },
    acceptance_id: {
      type: "integer",
      notNull: true,
      references: "acceptance_vouchers",
      onDelete: "RESTRICT",
    },
    // Khi đề nghị bị trả lại, released_at được ghi nhận để giải phóng phiếu
    released_at: {
      type: "timestamptz",
      notNull: false,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // UNIQUE cặp (payment_request_id, acceptance_id)
  pgm.addConstraint(
    "payment_request_acceptances",
    "payment_request_acceptances_request_acceptance_unique",
    {
      unique: ["payment_request_id", "acceptance_id"],
    }
  );

  // PARTIAL UNIQUE INDEX: mỗi phiếu nghiệm thu chỉ nằm trong tối đa 1 đề nghị ĐANG HIỆU LỰC
  pgm.createIndex("payment_request_acceptances", ["acceptance_id"], {
    name: "payment_request_acceptances_active_acceptance_unique",
    unique: true,
    where: '"released_at" IS NULL',
  });

  // Chỉ mục hỗ trợ truy vấn FK
  pgm.createIndex("payment_request_acceptances", ["payment_request_id"]);
  pgm.createIndex("payment_request_acceptances", ["acceptance_id"]);

  pgm.sql(`
    COMMENT ON TABLE "payment_request_acceptances" IS
      'Bảng liên kết giữa đề nghị thanh toán và phiếu nghiệm thu (S-43/T-111).';
    COMMENT ON COLUMN "payment_request_acceptances"."released_at" IS
      'Thời điểm giải phóng phiếu khi đề nghị bị trả lại. Khi NULL thì phiếu đang bị khóa trong đề nghị.';
  `);

  // ── 3. Bảng chi tiết từng dòng thanh toán ────────────────────────────────
  pgm.createTable("payment_request_lines", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    payment_request_id: {
      type: "integer",
      notNull: true,
    },
    acceptance_id: {
      type: "integer",
      notNull: true,
    },
    work_item_id: {
      type: "integer",
      notNull: true,
      references: "work_items",
      onDelete: "RESTRICT",
    },
    // Khối lượng đợt (có thể âm nếu có dòng giảm đợt âm theo quy tắc S-43)
    quantity: {
      type: "numeric(14,3)",
      notNull: true,
    },
    // Đơn giá snapshot tại thời điểm lập đề nghị
    unit_price: {
      type: "numeric(16,2)",
      notNull: true,
    },
    // Thành tiền = ROUND(quantity * unit_price, 0)
    amount: {
      type: "numeric(18,2)",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // FK ghép (payment_request_id, acceptance_id) tới payment_request_acceptances
  // Ngăn chặn dòng của phiếu không thuộc đề nghị
  pgm.addConstraint(
    "payment_request_lines",
    "payment_request_lines_request_acceptance_fk",
    {
      foreignKeys: {
        columns: ["payment_request_id", "acceptance_id"],
        references: "payment_request_acceptances(payment_request_id, acceptance_id)",
        onDelete: "RESTRICT",
      },
    }
  );

  // CHECK đơn giá không âm
  pgm.addConstraint(
    "payment_request_lines",
    "payment_request_lines_unit_price_check",
    {
      check: '"unit_price" >= 0',
    }
  );

  // CHECK thành tiền = ROUND(quantity * unit_price, 0)
  pgm.addConstraint(
    "payment_request_lines",
    "payment_request_lines_amount_round_check",
    {
      check: '"amount" = ROUND("quantity" * "unit_price", 0)',
    }
  );

  // Chỉ mục hỗ trợ truy vấn FK
  pgm.createIndex("payment_request_lines", ["payment_request_id", "acceptance_id"]);
  pgm.createIndex("payment_request_lines", ["work_item_id"]);

  pgm.sql(`
    COMMENT ON TABLE "payment_request_lines" IS
      'Chi tiết từng dòng thanh toán của hạng mục theo phiếu nghiệm thu (S-43/T-111).';
    COMMENT ON COLUMN "payment_request_lines"."unit_price" IS
      'Đơn giá snapshot tại thời điểm lập đề nghị thanh toán.';
    COMMENT ON COLUMN "payment_request_lines"."amount" IS
      'Thành tiền của dòng = ROUND(quantity * unit_price, 0) theo half-up.';
  `);
};

exports.down = (pgm) => {
  // Xóa theo thứ tự ngược lại để không vi phạm ràng buộc khóa ngoại
  pgm.dropTable("payment_request_lines", { ifExists: true, cascade: true });
  pgm.dropTable("payment_request_acceptances", { ifExists: true, cascade: true });
  pgm.dropTable("payment_requests", { ifExists: true, cascade: true });
};
