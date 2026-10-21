"use strict";

/**
 * T-04 / T-06 — Hoàn thiện bảng roles và project_members
 *
 * Thay đổi:
 *   1. Thêm cột `description` (varchar 255, nullable) vào bảng roles
 *      → Giúp UI hiển thị mô tả vai trò khi quản lý thành viên.
 *   2. Seed mô tả tiếng Việt cho 7 vai trò hiện có.
 *   3. Cập nhật CHECK constraint trên project_members.role để bao gồm 'khach'
 *      (vai trò đã được thêm ở migration 1800400000000 nhưng chưa vào chk_role).
 *   4. Thêm cột joined_at (timestamp, default now) và invited_by (integer FK → users)
 *      vào project_members — phục vụ audit trail và invitation flow (S-22).
 *
 * Idempotent: tất cả ALTER đều dùng IF NOT EXISTS / IF EXISTS.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── 1. Thêm cột description vào roles ──────────────────────────────
  pgm.sql(`
    ALTER TABLE roles
      ADD COLUMN IF NOT EXISTS description varchar(255);
  `);

  // ── 2. Seed mô tả vai trò (idempotent — chỉ cập nhật khi NULL) ─────
  pgm.sql(`
    UPDATE roles SET description = CASE name
      WHEN 'chu_dau_tu'      THEN 'Chủ đầu tư — Phê duyệt, giám sát tổng thể; xem tất cả, duyệt nghiệm thu và thanh toán chính thức.'
      WHEN 'ban_quan_ly'     THEN 'Ban quản lý — Điều phối kỹ thuật, quản lý thành viên, duyệt hồ sơ nội bộ và xuất dữ liệu.'
      WHEN 'ky_su_giam_sat'  THEN 'Kỹ sư giám sát — Lập nhật ký thi công, tạo hồ sơ nghiệm thu, chốt sổ cuối ngày.'
      WHEN 'chi_huy_truong'  THEN 'Chỉ huy trưởng — Phân công nhiệm vụ cho đội, quản lý tiến độ và lịch thi công.'
      WHEN 'doi_truong'      THEN 'Đội trưởng thi công — Báo cáo khối lượng và tiến độ của đội mình.'
      WHEN 'ke_toan'         THEN 'Kế toán — Ghi nhận chi phí thực tế, đối soát thanh toán, lập hồ sơ quyết toán.'
      WHEN 'khach'           THEN 'Khách — Tài khoản chưa được gán vai trò thật; mặc định từ chối mọi thao tác.'
      ELSE description
    END
    WHERE name IN ('chu_dau_tu','ban_quan_ly','ky_su_giam_sat','chi_huy_truong','doi_truong','ke_toan','khach')
      AND description IS NULL;
  `);

  // ── 3. Cập nhật CHECK constraint trên project_members.role ─────────
  // Migration cũ (1790220000000) đặt chk_role không có 'khach'.
  // Vai trò 'khach' được thêm sau (1800400000000) nhưng quên cập nhật constraint.
  // → Xóa và tạo lại để bao gồm 'khach'.
  pgm.dropConstraint("project_members", "chk_role", { ifExists: true });
  pgm.addConstraint("project_members", "chk_role", {
    check: `role IN ('chu_dau_tu','ban_quan_ly','ky_su_giam_sat','chi_huy_truong','doi_truong','ke_toan','khach')`,
  });

  // ── 4. Thêm cột joined_at và invited_by vào project_members ────────
  pgm.sql(`
    ALTER TABLE project_members
      ADD COLUMN IF NOT EXISTS joined_at timestamp NOT NULL DEFAULT current_timestamp,
      ADD COLUMN IF NOT EXISTS invited_by integer REFERENCES users(id) ON DELETE SET NULL;
  `);

  // Backfill joined_at = created_at cho dòng cũ (joined_at chưa có giá trị)
  pgm.sql(`
    UPDATE project_members
    SET joined_at = created_at
    WHERE joined_at = current_timestamp AND created_at < current_timestamp;
  `);
};

exports.down = (pgm) => {
  // Xóa lại các cột được thêm
  pgm.sql(`
    ALTER TABLE project_members
      DROP COLUMN IF EXISTS invited_by,
      DROP COLUMN IF EXISTS joined_at;
  `);

  // Phục hồi constraint về trạng thái cũ (không có 'khach')
  pgm.dropConstraint("project_members", "chk_role", { ifExists: true });
  pgm.addConstraint("project_members", "chk_role", {
    check: `role IN ('chu_dau_tu','ban_quan_ly','ky_su_giam_sat','chi_huy_truong','doi_truong','ke_toan')`,
  });

  // Xóa cột description
  pgm.sql(`ALTER TABLE roles DROP COLUMN IF EXISTS description;`);
};
