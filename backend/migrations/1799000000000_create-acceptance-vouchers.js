"use strict";

// S-36 / T-89
// Tạo 3 bảng phục vụ nghiệm thu khối lượng đợt:
//   1. acceptance_vouchers        – phiếu nghiệm thu (header)
//   2. acceptance_voucher_items   – chi tiết từng hạng mục lá
//   3. acceptance_voucher_photos  – ảnh hiện trường đính kèm phiếu
//
// Thiết kế chủ động để S-37 (chặn vượt hợp đồng), S-38 (duyệt/trả lại),
// S-39 (audit log) có thể gắn thêm mà KHÔNG cần ALTER TABLE phá vỡ schema.
//
// Giả định (ghi vào PR):
//   - Chưa có bảng "acceptance_batch" riêng; trường batch_name VARCHAR tự do
//     đủ cho MVP. Batch có thể nâng lên bảng riêng sau khi có đặc tả S-37+.
//   - Ảnh lưu bytea (giống diary_entry_attachments), chưa dùng Cloudinary.
//   - Trạng thái phiếu: draft | pending_review | approved | returned.
//     approved/returned để S-38 dùng; S-36 chỉ dùng draft.
//   - Phiếu có dòng âm (has_negative_delta=true) bị chặn gửi duyệt
//     cho đến khi có quy tắc điều chỉnh (TODO — không tự bịa).

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── 1. Bảng phiếu nghiệm thu (header) ──────────────────────────────────────
  pgm.createTable("acceptance_vouchers", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    // Khoá vào dự án — dữ liệu phiếu gắn theo dự án (AC: T-89)
    project_id: {
      type: "integer",
      notNull: true,
      references: "projects",
      onDelete: "CASCADE",
    },
    // Tên / mã đợt nghiệm thu (tự do, ví dụ "Đợt 1", "Tháng 10/2026")
    batch_name: {
      type: "varchar(200)",
      notNull: true,
    },
    // Trạng thái vòng đời: draft | pending_review | approved | returned
    status: {
      type: "varchar(20)",
      notNull: true,
      default: "'draft'",
    },
    // Cờ cảnh báo: phiếu có ít nhất 1 dòng khối lượng đợt âm.
    // TODO (quy tắc điều chỉnh đợt âm S-36/T-91): khi có quyết định chính thức,
    //   cập nhật acceptanceService.js#computeVoucherItems và route submit
    //   để cho phép hoặc block theo quy tắc mới.
    has_negative_delta: {
      type: "boolean",
      notNull: true,
      default: false,
    },
    // Người lập phiếu
    created_by: {
      type: "integer",
      notNull: true,
      references: "users",
      onDelete: "RESTRICT",
    },
    // Người duyệt — S-38 sẽ điền
    reviewed_by: {
      type: "integer",
      notNull: false,
      references: "users",
      onDelete: "RESTRICT",
    },
    // Thời điểm duyệt / trả lại — S-38 sẽ điền
    reviewed_at: {
      type: "timestamptz",
      notNull: false,
    },
    // Ghi chú duyệt / trả lại — S-38 sẽ điền
    review_note: {
      type: "text",
      notNull: false,
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
    "acceptance_vouchers",
    "acceptance_vouchers_status_check",
    {
      check: "\"status\" IN ('draft', 'pending_review', 'approved', 'returned')",
    }
  );

  // Chỉ mục theo dự án
  pgm.createIndex("acceptance_vouchers", ["project_id", "status"]);
  pgm.createIndex("acceptance_vouchers", ["project_id", "created_at"]);

  pgm.sql(`
    COMMENT ON TABLE "acceptance_vouchers" IS
      'Phiếu nghiệm thu khối lượng đợt (S-36). Mỗi phiếu = 1 đợt nghiệm thu.';
    COMMENT ON COLUMN "acceptance_vouchers"."has_negative_delta" IS
      'true khi có ít nhất 1 hạng mục có delta_quantity < 0.
       Phiếu này bị chặn gửi duyệt — TODO: quy tắc điều chỉnh (S-36/T-91).';
    COMMENT ON COLUMN "acceptance_vouchers"."status" IS
      'draft | pending_review | approved | returned.
       approved/returned chỉ S-38 ghi; S-36 chỉ dùng draft.';
  `);

  // ── 2. Bảng chi tiết từng hạng mục lá ─────────────────────────────────────
  pgm.createTable("acceptance_voucher_items", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    voucher_id: {
      type: "integer",
      notNull: true,
      references: "acceptance_vouchers",
      onDelete: "CASCADE",
    },
    // Hạng mục lá (kiểm tra is_leaf ở tầng ứng dụng)
    work_item_id: {
      type: "integer",
      notNull: true,
      references: "work_items",
      onDelete: "RESTRICT",
    },
    // Luỹ kế tại thời điểm lập phiếu — NUMERIC(14,3) đồng kiểu work_items.quantity (S-35)
    cumulative_quantity: {
      type: "numeric(14,3)",
      notNull: true,
    },
    // Luỹ kế đã duyệt của phiếu approved gần nhất (= 0 nếu chưa có phiếu nào)
    prev_approved_cumulative: {
      type: "numeric(14,3)",
      notNull: true,
      default: 0,
    },
    // Khối lượng phát sinh đợt = cumulative_quantity - prev_approved_cumulative
    // Được ứng dụng tính và lưu để đảm bảo audit trail; có thể âm (quyết định A)
    delta_quantity: {
      type: "numeric(14,3)",
      notNull: true,
    },
    // Snapshot đơn vị tính tại thời điểm lập phiếu (tham khảo)
    unit: {
      type: "varchar(30)",
      notNull: false,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  // Mỗi hạng mục chỉ xuất hiện 1 lần trong 1 phiếu
  pgm.addConstraint(
    "acceptance_voucher_items",
    "acceptance_voucher_items_voucher_work_item_unique",
    { unique: ["voucher_id", "work_item_id"] }
  );

  // Luỹ kế không âm (phòng thủ DB)
  pgm.addConstraint(
    "acceptance_voucher_items",
    "acceptance_voucher_items_cumulative_non_negative",
    { check: '"cumulative_quantity" >= 0' }
  );

  // prev_approved_cumulative không âm
  pgm.addConstraint(
    "acceptance_voucher_items",
    "acceptance_voucher_items_prev_non_negative",
    { check: '"prev_approved_cumulative" >= 0' }
  );

  // Chỉ mục hỗ trợ truy vấn luỹ kế đã duyệt gần nhất theo hạng mục
  pgm.createIndex("acceptance_voucher_items", ["work_item_id", "voucher_id"]);

  pgm.sql(`
    COMMENT ON TABLE "acceptance_voucher_items" IS
      'Chi tiết từng hạng mục lá trong phiếu nghiệm thu (S-36/T-89).';
    COMMENT ON COLUMN "acceptance_voucher_items"."delta_quantity" IS
      'Khối lượng phát sinh đợt = cumulative_quantity - prev_approved_cumulative.
       Có thể âm — xem has_negative_delta trên acceptance_vouchers và TODO T-91.';
    COMMENT ON COLUMN "acceptance_voucher_items"."prev_approved_cumulative" IS
      'Luỹ kế của phiếu APPROVED gần nhất, snapshot tại thời điểm tạo.
       KHÔNG lấy từ phiếu draft/pending_review.';
  `);

  // ── 3. Bảng ảnh hiện trường đính kèm phiếu ─────────────────────────────────
  pgm.createTable("acceptance_voucher_photos", {
    id: {
      type: "serial",
      primaryKey: true,
    },
    voucher_id: {
      type: "integer",
      notNull: true,
      references: "acceptance_vouchers",
      onDelete: "CASCADE",
    },
    // Tên file gốc
    file_name: {
      type: "varchar(500)",
      notNull: true,
    },
    // Dung lượng byte
    file_size: {
      type: "integer",
      notNull: true,
    },
    // MIME type thật (kiểm tra magic bytes ở ứng dụng)
    mime_type: {
      type: "varchar(100)",
      notNull: true,
    },
    // Dữ liệu nhị phân (giữ nhất quán với diary_entry_attachments)
    file_data: {
      type: "bytea",
      notNull: true,
    },
    // Siêu dữ liệu EXIF/GPS gốc (thời gian, toạ độ) — E-07 sẽ dùng
    // KHÔNG log toạ độ thô ra file log
    exif_metadata: {
      type: "jsonb",
      notNull: false,
    },
    // Chú thích tuỳ chọn
    caption: {
      type: "varchar(500)",
      notNull: false,
    },
    uploaded_by: {
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

  // Dung lượng: > 0 và <= 50 MB (DB hard limit; ứng dụng dùng ACCEPTANCE_MAX_PHOTO_SIZE_MB)
  pgm.addConstraint(
    "acceptance_voucher_photos",
    "acceptance_voucher_photos_file_size_check",
    { check: '"file_size" > 0 AND "file_size" <= 52428800' }
  );

  // Chỉ MIME type hợp lệ ở DB (ứng dụng còn kiểm tra magic bytes)
  pgm.addConstraint(
    "acceptance_voucher_photos",
    "acceptance_voucher_photos_mime_check",
    {
      check:
        "\"mime_type\" IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic')",
    }
  );

  pgm.createIndex("acceptance_voucher_photos", ["voucher_id"]);

  pgm.sql(`
    COMMENT ON TABLE "acceptance_voucher_photos" IS
      'Ảnh hiện trường đính kèm phiếu nghiệm thu (S-36/T-89).
       Không giới hạn số lượng cứng (dùng hằng số ACCEPTANCE_MAX_PHOTOS_PER_VOUCHER nếu cần).
       Ảnh KHÔNG bắt buộc hiện tại (cờ ACCEPTANCE_PHOTO_REQUIRED để đổi sau).';
    COMMENT ON COLUMN "acceptance_voucher_photos"."exif_metadata" IS
      'Siêu dữ liệu EXIF gốc (thời gian chụp, toạ độ GPS).
       KHÔNG log toạ độ thô ra file log — E-07 sẽ đọc qua API riêng có kiểm quyền.';
    COMMENT ON COLUMN "acceptance_voucher_photos"."mime_type" IS
      'Chỉ chấp nhận: image/jpeg, image/png, image/webp, image/heic.
       Kiểm tra magic bytes (không tin đuôi file) ở tầng ứng dụng.';
  `);
};

exports.down = (pgm) => {
  // Xoá ngược thứ tự để không vi phạm khoá ngoại
  pgm.dropTable("acceptance_voucher_photos", { ifExists: true, cascade: true });
  pgm.dropTable("acceptance_voucher_items", { ifExists: true, cascade: true });
  pgm.dropTable("acceptance_vouchers", { ifExists: true, cascade: true });
};

