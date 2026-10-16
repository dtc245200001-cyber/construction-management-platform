// Ma trận phân quyền dùng chung cho Frontend — MIRROR của backend/utils/permissions.js.
// Mục đích: nút/hành động nào backend không cho phép thì frontend ẨN ngay từ đầu,
// tránh "lệch pha" (hiện nút nhưng bấm dính 403).
//
// QUY TẮC ĐỒNG BỘ: mỗi khi sửa PERMISSIONS ở backend, copy tương ứng sang đây.
// Key nào backend chưa có route (key "treo") thì frontend cũng chưa cần dùng —
// cứ để sẵn, khi tính năng tương ứng lên giao diện chỉ cần gọi can(role, key).
//
// Cách dùng:
//   import { can } from '../lib/permissions';
//   const canLock = user?.is_system_admin || can(projectRole, 'site_log.close_daily');

export const ROLES = {
  CHU_DAU_TU: "chu_dau_tu",
  BAN_QUAN_LY: "ban_quan_ly",
  KY_SU_GIAM_SAT: "ky_su_giam_sat",
  CHI_HUY_TRUONG: "chi_huy_truong",
  DOI_TRUONG: "doi_truong",
  KE_TOAN: "ke_toan",
};

const ALL_MEMBERS = Object.values(ROLES);

export const PERMISSIONS = {
  // ── Ban quản lý dự án ──────────────────────────────────────────────
  "member.manage": [ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU],
  "work_item.manage": [ROLES.BAN_QUAN_LY],
  "acceptance.review_internal": [ROLES.BAN_QUAN_LY],

  // ── Chỉ huy trưởng ─────────────────────────────────────────────────
  "schedule.manage": [ROLES.CHI_HUY_TRUONG],
  "task.assign": [ROLES.CHI_HUY_TRUONG],
  "site_log.view": ALL_MEMBERS,
  // S-24: Kỹ sư giám sát chốt/khóa sổ nhật ký ngày đã qua.
  "site_log.close_daily": [ROLES.KY_SU_GIAM_SAT],
  // S-24: Ban quản lý mở khóa nhật ký đã khóa (kèm lý do và audit log).
  "site_log.correct_locked": [ROLES.BAN_QUAN_LY],
  "schedule.view_delays": [ROLES.CHI_HUY_TRUONG],

  // ── Kỹ sư giám sát ─────────────────────────────────────────────────
  "site_log.create": [ROLES.KY_SU_GIAM_SAT, ROLES.CHI_HUY_TRUONG, ROLES.BAN_QUAN_LY, ROLES.DOI_TRUONG],
  "site_log.upload_photo": [ROLES.KY_SU_GIAM_SAT],
  "quantity.verify": [ROLES.KY_SU_GIAM_SAT],
  "acceptance.create_dossier": [ROLES.KY_SU_GIAM_SAT],
  "acceptance.update_dossier": [ROLES.KY_SU_GIAM_SAT],
  "acceptance.access": [ROLES.KY_SU_GIAM_SAT, ROLES.CHU_DAU_TU],

  // ── Đội trưởng thi công ────────────────────────────────────────────
  "task.view_own_team": [ROLES.DOI_TRUONG],
  "quantity.report": [ROLES.DOI_TRUONG],
  "issue.report": [ROLES.DOI_TRUONG],
  "task.upload_photo": [ROLES.DOI_TRUONG],

  // ── Chủ đầu tư ─────────────────────────────────────────────────────
  "project.view": [ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY],
  "acceptance.view_verified": [ROLES.CHU_DAU_TU],
  "acceptance.approve_official": [ROLES.CHU_DAU_TU],
  "acceptance.return_official": [ROLES.CHU_DAU_TU],
  "payment.approve": [ROLES.CHU_DAU_TU],
  // S-39: Audit Portal cho Chủ đầu tư / Ban quản lý.
  "audit.view_project": [ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY],

  // ── Kế toán ────────────────────────────────────────────────────────
  "budget.view": [ROLES.KE_TOAN],
  "cost.record": [ROLES.KE_TOAN],
  "payment.reconcile": [ROLES.KE_TOAN],
  "payment.prepare_dossier": [ROLES.KE_TOAN],
  "finance.report": [ROLES.KE_TOAN],

  // ── Key mở rộng cho route legacy ───────────────────────────────────
  "project.member": ALL_MEMBERS,
  "team.manage": [ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY, ROLES.CHI_HUY_TRUONG],
  "team.view_all": [ROLES.CHI_HUY_TRUONG, ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU],
  "task.view_team": [ROLES.DOI_TRUONG, ROLES.CHI_HUY_TRUONG, ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU],
  "milestone.manage": [ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY],
  "calendar.manage": [ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU, ROLES.CHI_HUY_TRUONG],
  "baseline.manage": [ROLES.BAN_QUAN_LY],
  "dependency.manage": [ROLES.BAN_QUAN_LY],
  "invitation.manage": [ROLES.CHI_HUY_TRUONG, ROLES.CHU_DAU_TU, ROLES.BAN_QUAN_LY],
  "schedule.recalculate": ALL_MEMBERS,
  "site_log.create_daily": [ROLES.KY_SU_GIAM_SAT, ROLES.CHI_HUY_TRUONG, ROLES.BAN_QUAN_LY],

  // S-43: Đề nghị thanh toán (T-112 / T-113)
  "payment_request.create": [ROLES.BAN_QUAN_LY],
  "payment_request.view": [ROLES.BAN_QUAN_LY, ROLES.CHU_DAU_TU, ROLES.KE_TOAN],
};

// Tra cứu 1 role có 1 quyền không. Pure — không bypass, không IO.
// Lưu ý: system_admin bypass ở tầng gọi (component), không nằm trong ma trận,
// đúng như backend (middleware bypass riêng).
export function can(role, permissionKey) {
  const allowed = PERMISSIONS[permissionKey];
  if (!Array.isArray(allowed)) return false;
  return allowed.map(String).includes(String(role));
}
