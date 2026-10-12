"use strict";

// S-39 / T-102: gia cố bảng audit_logs thành "chỉ ghi thêm".
//
// Bối cảnh: audit_logs đã tồn tại (luồng S-24 nhật ký dùng chung).
// Story S-39 yêu cầu nhật ký thao tác trên phiếu nghiệm thu / đề nghị
// thanh toán / báo khối lượng phải truy được "ai đã lập, sửa, duyệt"
// khi có tranh chấp — nên bảng này không được phép sửa/xóa.
//
// Migration làm 3 việc:
//   1. Thêm project_id để tra cứu lịch sử theo phạm vi dự án
//      (endpoint history lọc theo project, không join vòng).
//   2. Index (project_id, entity, entity_id) cho truy vấn history.
//   3. Trigger chặn UPDATE/DELETE ở tầng DB. Lưu ý:
//      - Trigger row-level KHÔNG chặn TRUNCATE, nên các test
//        integration vẫn TRUNCATE audit_logs để dọn dữ liệu bình thường.
//      - Code ứng dụng không có chỗ nào UPDATE/DELETE audit_logs
//        (đã rà soát), nên trigger chỉ chặn hành vi can thiệp thủ công.

module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    pgm.addColumns("audit_logs", {
      project_id: {
        type: "integer",
        references: "projects",
        onDelete: "CASCADE",
      },
    });

    pgm.createIndex("audit_logs", [
      "project_id",
      "entity",
      "entity_id",
    ]);

    pgm.sql(`
      CREATE OR REPLACE FUNCTION prevent_audit_logs_tamper()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION
          'audit_logs is append-only: % not allowed (id=%)',
          TG_OP,
          COALESCE(OLD.id::text, 'null');
      END;
      $$ LANGUAGE plpgsql;
    `);

    pgm.sql(`
      CREATE TRIGGER audit_logs_no_tamper
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_tamper();
    `);
  },

  down: (pgm) => {
    pgm.sql(
      "DROP TRIGGER IF EXISTS audit_logs_no_tamper ON audit_logs;"
    );
    pgm.sql(
      "DROP FUNCTION IF EXISTS prevent_audit_logs_tamper();"
    );
    pgm.dropIndex("audit_logs", [
      "project_id",
      "entity",
      "entity_id",
    ]);
    pgm.dropColumns("audit_logs", ["project_id"]);
  },
};
