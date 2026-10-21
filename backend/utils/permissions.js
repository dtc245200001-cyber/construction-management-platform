"use strict";

// Ma trận phân quyền trung tâm — 1 chỗ duy nhất định nghĩa "role nào được làm gì".
// Thêm role mới / đổi quyền: chỉ sửa file này, không sửa từng route.
//
// Cách dùng ở route:
//   const { requirePermission } = require("../middleware/projectAccess");
//   router.post("/:projectId/members", requireAuth, checkProjectAccess,
//     requirePermission("member.manage"), handler);
//
// Các key "treo" (đã định nghĩa, chưa route nào dùng) dành cho tính năng tương lai
// (story S-21 → S-28, module nghiệm thu / thanh toán): route mới chỉ cần gọi
// requirePermission('<key>') là tự đúng, không phải nghĩ lại ai được phép làm gì.

const { ROLES } = require("./constants");

const {
  CHU_DAU_TU,
  BAN_QUAN_LY,
  KY_SU_GIAM_SAT,
  CHI_HUY_TRUONG,
  DOI_TRUONG,
  KE_TOAN,
} = ROLES;

// Mọi thành viên dự án (thay cho allow(Object.values(ROLES)) rải rác ở từng route).
const ALL_MEMBERS = [
  CHU_DAU_TU,
  BAN_QUAN_LY,
  KY_SU_GIAM_SAT,
  CHI_HUY_TRUONG,
  DOI_TRUONG,
  KE_TOAN,
];

const PERMISSIONS = {
  // ── Ban quản lý dự án ──────────────────────────────────────────────
  // LỆCH đặc tả gốc (giữ theo quyết định): route POST/DELETE /members hiện cho
  // cả CHU_DAU_TU thao tác, nên giữ cả hai để không đổi hành vi đang chạy thật.
  // Điều chỉnh: bỏ CHU_DAU_TU (không quản lý thành viên, chỉ giám sát).
  "member.manage": [BAN_QUAN_LY],
  // Điều chỉnh: bổ sung CHI_HUY_TRUONG (tạo/sửa/xóa Hạng mục WBS).
  "work_item.manage": [BAN_QUAN_LY, CHI_HUY_TRUONG],
  // S-43 / T-112: Lập và xem đề nghị thanh toán từ phiếu nghiệm thu đã duyệt
  "payment_request.create": [BAN_QUAN_LY],
  "payment_request.view": [BAN_QUAN_LY, CHU_DAU_TU, KE_TOAN],
  // S-45 / T-116: cấu hình tạm giữ theo dự án/hợp đồng.
  "payment_retention.manage": [BAN_QUAN_LY, CHU_DAU_TU],
  // TREO: duyệt nghiệm thu NỘI BỘ — bước riêng, không gộp bảng/trạng thái với
  // acceptance.approve_official của Chủ đầu tư.
  "acceptance.review_internal": [BAN_QUAN_LY],
  // S-50 / T-127: Xuất hồ sơ nghiệm thu hạng mục ra PDF — chỉ dành riêng cho Ban quản lý
  "acceptance.export_dossier": [BAN_QUAN_LY],

  // ── Chỉ huy trưởng ─────────────────────────────────────────────────
  // TREO: chưa route nào dùng (route lịch/CPM hiện mở cho mọi thành viên — xem
  // schedule.recalculate và project.member bên dưới).
  "schedule.manage": [CHI_HUY_TRUONG],
  "task.assign": [CHI_HUY_TRUONG],
  // LỆCH đặc tả gốc (giữ theo quyết định): các route đọc nhật ký / nhật ký ngày
  // hiện mở cho mọi thành viên, nên giữ đọc mở để không đổi hành vi.
  "site_log.view": ALL_MEMBERS,
  // TREO.
  "schedule.view_delays": [CHI_HUY_TRUONG],

  // ── Kỹ sư giám sát ─────────────────────────────────────────────────
  // Điều chỉnh: bỏ DOI_TRUONG khỏi site_log.create (đội trưởng chỉ báo cáo
  // khối lượng tại /field, không ghi nhật ký). Bỏ CHI_HUY_TRUONG khỏi
  // site_log.close_daily / correct_locked (chuyển giao cho KGS và BQL).
  "site_log.create": [KY_SU_GIAM_SAT, CHI_HUY_TRUONG, BAN_QUAN_LY],
  // Chốt sổ nhật ký cuối ngày — chuyển từ CHI_HUY_TRUONG sang KY_SU_GIAM_SAT.
  "site_log.close_daily": [KY_SU_GIAM_SAT],
  // Mở khóa nhật ký để điều chỉnh (bắt buộc nhập lý do, validate trong route).
  // Chuyển từ CHI_HUY_TRUONG sang BAN_QUAN_LY.
  "site_log.correct_locked": [BAN_QUAN_LY],
  // TREO: tải ảnh thực tế công trường làm bằng chứng.
  "site_log.upload_photo": [KY_SU_GIAM_SAT],
  // TREO: đối chiếu khối lượng đội báo cáo với thực tế.
  "quantity.verify": [KY_SU_GIAM_SAT],
  // TREO: được TẠO / bổ sung hồ sơ nghiệm thu nhưng KHÔNG có quyền duyệt
  // (không gán acceptance.review_internal hay acceptance.approve_official).
  "acceptance.create_dossier": [KY_SU_GIAM_SAT],
  "acceptance.update_dossier": [KY_SU_GIAM_SAT],
  "acceptance.access": [KY_SU_GIAM_SAT, CHU_DAU_TU, BAN_QUAN_LY],

  // ── Đội trưởng thi công ────────────────────────────────────────────
  // TREO: route GET /my-team/tasks hiện phục vụ 4 role (đội trưởng bị ép về đúng
  // đội mình ngay trong handler), nên route đó dùng task.view_team bên dưới.
  // Key này dành cho route tương lai giới hạn chặt "chỉ đội mình".
  // Role này KHÔNG có task.assign và KHÔNG có bất kỳ acceptance.* nào.
  "task.view_own_team": [DOI_TRUONG],
  "quantity.report": [DOI_TRUONG],
  // TREO: báo cáo sự cố, khó khăn, vướng mắc.
  "issue.report": [DOI_TRUONG],
  // TREO: gửi ảnh chứng minh tiến độ/khối lượng.
  "task.upload_photo": [DOI_TRUONG],

  // ── Chủ đầu tư ─────────────────────────────────────────────────────
  // S-49 / T-124: Dashboard tổng hợp tiến độ chỉ dành riêng cho Chủ đầu tư
  "progress.view": [CHU_DAU_TU],
  // TREO: các route xem hiện mở cho mọi thành viên (dùng project.member), nên
  // key này để sẵn cho route tương lai cần siết "chỉ BQL + CĐT được xem".
  "project.view": [CHU_DAU_TU, BAN_QUAN_LY],
  // TREO: chỉ xem hồ sơ ĐÃ qua kiểm tra nội bộ (acceptance.review_internal).
  "acceptance.view_verified": [CHU_DAU_TU],
  // TREO: duyệt nghiệm thu CHÍNH THỨC — bước/trạng thái riêng, tách biệt hoàn
  // toàn với acceptance.review_internal của Ban quản lý.
  // TODO (uỷ quyền ký duyệt — CHƯA làm, chờ quyết định thiết kế): theo hợp đồng,
  // chỉ tài khoản được giao thẩm quyền mới được duyệt chính thức; nếu quyền ký
  // được giao cho Tư vấn giám sát đại diện Chủ đầu tư, hệ thống phải phân quyền
  // đúng NGƯỜI cụ thể được uỷ quyền chứ không gán cứng theo role chu_dau_tu.
  // S-38: Ban quản lý duyệt hoặc trả lại phiếu nghiệm thu kèm lý do
  "acceptance.approve_official": [BAN_QUAN_LY],
  "acceptance.return_official": [BAN_QUAN_LY],
  // TREO: duyệt hoặc trả lại đề nghị thanh toán.
  "payment.approve": [CHU_DAU_TU],
  // S-39: Chủ đầu tư / Ban quản lý xem toàn bộ nhật ký thao tác của dự án
  // (Audit Portal — màn hình tổng quan tra cứu "ai làm gì, khi nào").
  "audit.view_project": [CHU_DAU_TU, BAN_QUAN_LY],

  // ── Ngân sách & Kế toán (S-46 / T-119) ─────────────────────────────
  "budget.view": [BAN_QUAN_LY, CHU_DAU_TU, KE_TOAN, CHI_HUY_TRUONG],
  "budget.manage": [BAN_QUAN_LY, CHU_DAU_TU],
  "budget.verify_overrun": [KE_TOAN],
  "budget.approve_overrun": [CHU_DAU_TU],
  "cost.record": [KE_TOAN],
  "payment.reconcile": [KE_TOAN],
  "payment.prepare_dossier": [KE_TOAN],
  "finance.report": [KE_TOAN],

  // ── Key mở rộng cho route legacy (giữ đúng hành vi cũ) ─────────────
  // Mọi thành viên dự án — thay cho allow(Object.values(ROLES)).
  "project.member": ALL_MEMBERS,
  // Quản lý đội thi công (route teams CRUD + thêm thành viên vào đội).
  "team.manage": [CHU_DAU_TU, BAN_QUAN_LY, CHI_HUY_TRUONG],
  // Xem việc toàn bộ các đội (route GET /teams/all/tasks; đội trưởng không dùng
  // route này — họ chỉ xem đội mình qua task.view_team).
  "team.view_all": [CHI_HUY_TRUONG, BAN_QUAN_LY, CHU_DAU_TU],
  // Xem việc theo đội (route GET /my-team/tasks, GET quantity-reports): đội
  // trưởng bị ép về đúng đội mình ngay trong handler (findUserTeam).
  "task.view_team": [DOI_TRUONG, CHI_HUY_TRUONG, BAN_QUAN_LY, CHU_DAU_TU],
  // Quản lý mốc thi công (route milestones).
  "milestone.manage": [CHU_DAU_TU, BAN_QUAN_LY],
  // Quản lý lịch làm việc / ngày nghỉ (route calendar + holidays).
  "calendar.manage": [BAN_QUAN_LY, CHU_DAU_TU, CHI_HUY_TRUONG],
  // Chốt baseline tiến độ.
  "baseline.manage": [BAN_QUAN_LY],
  // Quản lý quan hệ phụ thuộc công việc.
  "dependency.manage": [BAN_QUAN_LY],
  // Quản lý thư mời vào dự án (gửi lại / xem trạng thái).
  "invitation.manage": [CHI_HUY_TRUONG, CHU_DAU_TU, BAN_QUAN_LY],
  // Tính lại tiến độ (route POST /schedule/recalculate): cố ý để mở cho mọi
  // thành viên để khớp hành vi legacy (allow tất cả role). Story tương lai có
  // thể siết về schedule.manage mà không cần sửa route.
  "schedule.recalculate": ALL_MEMBERS,
  // Ghi mục đầu ngày (nhân lực, thiết bị, thời tiết — route PUT /diary-days):
  // thay cho WRITE_ROLES, cố ý KHÔNG gồm doi_truong (giữ hành vi legacy).
  "site_log.create_daily": [KY_SU_GIAM_SAT, CHI_HUY_TRUONG, BAN_QUAN_LY],

  // ── S-40 / T-106: Siêu dữ liệu ảnh hiện trường và quyền riêng tư vị trí ──
  // Mọi thành viên dự án xem được thông tin thời điểm chụp và trạng thái GPS
  "photo.view_metadata": ALL_MEMBERS,
  // Bảo vệ vị trí người lao động: chỉ Chủ đầu tư và Ban quản lý được xem toạ độ thô
  "photo.view_gps": [CHU_DAU_TU, BAN_QUAN_LY],

  // ── S-41 / T-107: Cấu hình phạm vi công trường (geofence) ──
  // Chủ đầu tư và Ban quản lý được cấu hình tâm và bán kính công trường
  "site_geofence.manage": [CHU_DAU_TU, BAN_QUAN_LY],
};

// Tên tiếng Việt hiển thị trong message 403.
const ROLE_LABELS = {
  [ROLES.CHU_DAU_TU]: "Chủ đầu tư",
  [ROLES.BAN_QUAN_LY]: "Ban quản lý",
  [ROLES.KY_SU_GIAM_SAT]: "Kỹ sư giám sát",
  [ROLES.CHI_HUY_TRUONG]: "Chỉ huy trưởng",
  [ROLES.DOI_TRUONG]: "Đội trưởng",
  [ROLES.KE_TOAN]: "Kế toán",
  system_admin: "Quản trị hệ thống",
};

// Tra cứu 1 role có 1 quyền không. Pure — không bypass, không IO.
function can(role, permissionKey) {
  const allowed = PERMISSIONS[permissionKey];
  if (!Array.isArray(allowed)) return false;
  return allowed.map(String).includes(String(role));
}

module.exports = { PERMISSIONS, ROLE_LABELS, ALL_MEMBERS, can };
