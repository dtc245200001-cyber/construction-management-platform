"use strict";

exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Thêm các cột hợp đồng vào bảng work_items
  pgm.addColumns("work_items", {
    quantity: {
      type: "numeric(14,3)",
      notNull: false,
      default: null,
    },
    unit: {
      type: "varchar(30)",
      notNull: false,
      default: null,
    },
    unit_price: {
      type: "numeric(16,2)",
      notNull: false,
      default: null,
    },
  });

  // 2. Thêm cột sinh contract_value (NUMERIC(30,2) GENERATED ALWAYS AS STORED)
  pgm.sql(`
    ALTER TABLE "work_items"
    ADD COLUMN "contract_value" numeric(30,2)
    GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED;
  `);

  // 3. Thêm các ràng buộc CHECK
  pgm.addConstraint("work_items", "work_items_quantity_non_negative", {
    check: '"quantity" IS NULL OR "quantity" >= 0',
  });

  pgm.addConstraint("work_items", "work_items_unit_price_non_negative", {
    check: '"unit_price" IS NULL OR "unit_price" >= 0',
  });

  pgm.addConstraint("work_items", "work_items_unit_trimmed_not_empty", {
    check: '"unit" IS NULL OR ("unit" = btrim("unit") AND "unit" <> \'\')',
  });

  pgm.addConstraint("work_items", "work_items_contract_all_or_none", {
    check:
      '("quantity" IS NULL AND "unit" IS NULL AND "unit_price" IS NULL) OR ' +
      '("quantity" IS NOT NULL AND "unit" IS NOT NULL AND "unit_price" IS NOT NULL)',
  });

  // 4. COMMENT ON COLUMN cho cả 4 cột bằng tiếng Việt
  pgm.sql(`
    COMMENT ON COLUMN "work_items"."quantity" IS
      'Khối lượng HỢP ĐỒNG của hạng mục lá (S-35), khác tasks.planned_quantity là khối lượng kế hoạch của công việc';
    COMMENT ON COLUMN "work_items"."unit" IS
      'Đơn vị tính HỢP ĐỒNG của hạng mục lá (S-35), khác tasks.quantity_unit là đơn vị kế hoạch của công việc';
    COMMENT ON COLUMN "work_items"."unit_price" IS
      'Đơn giá HỢP ĐỒNG của hạng mục lá (S-35)';
    COMMENT ON COLUMN "work_items"."contract_value" IS
      'Giá trị HỢP ĐỒNG của hạng mục lá (S-35) = ROUND(quantity * unit_price, 2). Quy tắc làm tròn: ROUND của PostgreSQL (làm tròn nửa ra xa số 0), làm tròn TỪNG hạng mục lá. Hạng mục cha sau này = tổng các giá trị đã làm tròn của các lá nên luôn khớp tuyệt đối';
  `);
};

exports.down = (pgm) => {
  // Đảo ngược thứ tự up: xoá ràng buộc, xoá cột
  pgm.dropConstraint("work_items", "work_items_contract_all_or_none", { ifExists: true });
  pgm.dropConstraint("work_items", "work_items_unit_trimmed_not_empty", { ifExists: true });
  pgm.dropConstraint("work_items", "work_items_unit_price_non_negative", { ifExists: true });
  pgm.dropConstraint("work_items", "work_items_quantity_non_negative", { ifExists: true });

  // Xoá contract_value trước
  pgm.dropColumn("work_items", "contract_value", { ifExists: true });
  pgm.dropColumns("work_items", ["quantity", "unit", "unit_price"], { ifExists: true });
};
