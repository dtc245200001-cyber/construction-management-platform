// NGUỒN SỰ THẬT DUY NHẤT cho phân quyền hiển thị ở Frontend (menu, route, nút).
//
// Frontend CHỈ để UX: ẩn những gì vai trò không dùng được. Backend vẫn là nơi chặn
// thật (403) — không bỏ kiểm tra phía server, và các trang vẫn phải xử lý lỗi 403.
//
// Vai trò ở đây là vai trò TRONG DỰ ÁN ĐANG MỞ (GET /projects/:id -> membership),
// không phải user.role toàn cục. Quản trị hệ thống nhận membership "system_admin"
// từ backend và được bypass giống middleware phía server.
//
// Không viết `if (role === '...')` rải rác trong component: thêm/sửa quyền ở đây,
// còn component chỉ gọi can(role, action) / <Can action="..."> / usePermission().

import {
  Home,
  Network,
  TrendingUp,
  Camera,
  FileText,
  CheckSquare,
  Wallet,
  Users,
  Bell,
  CalendarDays,
  Calendar,
  Coins,
} from "lucide-react";

export const ROLES = {
  BAN_QUAN_LY: "ban_quan_ly",
  CHI_HUY_TRUONG: "chi_huy_truong",
  KY_SU_GIAM_SAT: "ky_su_giam_sat",
  DOI_TRUONG: "doi_truong",
  CHU_DAU_TU: "chu_dau_tu",
  KE_TOAN: "ke_toan",
};

// Membership backend trả cho quản trị hệ thống (middleware/projectAccess.js).
export const SYSTEM_ADMIN_ROLE = "system_admin";

const { BAN_QUAN_LY, CHI_HUY_TRUONG, KY_SU_GIAM_SAT, DOI_TRUONG, CHU_DAU_TU, KE_TOAN } = ROLES;
const ALL_ROLES = Object.values(ROLES);

export const ROLE_LABELS = {
  [BAN_QUAN_LY]: "Ban quản lý",
  [CHI_HUY_TRUONG]: "Chỉ huy trưởng",
  [KY_SU_GIAM_SAT]: "Kỹ sư giám sát",
  [DOI_TRUONG]: "Đội trưởng",
  [CHU_DAU_TU]: "Chủ đầu tư",
  [KE_TOAN]: "Kế toán",
  [SYSTEM_ADMIN_ROLE]: "Quản trị hệ thống",
};

// Thứ tự hiển thị của các nhóm menu. Nhóm không còn mục nào thì không hiện tiêu đề.
export const MENU_GROUPS = [
  { key: "overview", label: "Tổng quan" },
  { key: "planning", label: "Kế hoạch & tiến độ" },
  { key: "site", label: "Thi công" },
  { key: "manage", label: "Quản lý" },
];

// `paths` (tuỳ chọn): các route phụ thuộc cùng quyền với mục menu này.
// `implemented: false`: mục chưa có trang thật (menu vẫn hiện theo quyền, bấm báo "sắp có").
export const MENU_CONFIG = [
  {
    key: "dashboard",
    label: "Tổng quan",
    path: "/dashboard",
    icon: Home,
    group: "overview",
    roles: [BAN_QUAN_LY, CHI_HUY_TRUONG, KY_SU_GIAM_SAT, CHU_DAU_TU, KE_TOAN],
  },
  {
    key: "wbs",
    label: "Cơ cấu công việc (WBS)",
    path: "/wbs",
    paths: ["/wbs-diagram"],
    icon: Network,
    group: "planning",
    roles: [BAN_QUAN_LY, CHI_HUY_TRUONG, KY_SU_GIAM_SAT, CHU_DAU_TU, KE_TOAN],
  },
  {
    // Không có trong ma trận gốc: lấy theo WBS (cùng dữ liệu hạng mục). Cần xác nhận.
    key: "contract-quantities",
    label: "Khối lượng hợp đồng",
    path: "/contract-quantities",
    icon: Coins,
    group: "planning",
    roles: [BAN_QUAN_LY, CHI_HUY_TRUONG, KY_SU_GIAM_SAT, CHU_DAU_TU, KE_TOAN],
  },
  {
    key: "schedule",
    label: "Bảng đường găng (CPM)",
    path: "/schedule",
    icon: TrendingUp,
    group: "planning",
    roles: [BAN_QUAN_LY, CHI_HUY_TRUONG, CHU_DAU_TU],
  },
  {
    key: "gantt",
    label: "Tiến độ thi công",
    path: "/gantt",
    icon: CalendarDays,
    group: "planning",
    roles: [BAN_QUAN_LY, CHI_HUY_TRUONG, KY_SU_GIAM_SAT, CHU_DAU_TU, KE_TOAN],
  },
  {
    key: "warnings",
    label: "Cảnh báo tiến độ",
    path: "/warnings",
    icon: Bell,
    group: "planning",
    roles: [CHU_DAU_TU],
  },
  {
    key: "calendar",
    label: "Lịch & Ngày nghỉ",
    path: "/calendar",
    icon: Calendar,
    group: "planning",
    roles: [BAN_QUAN_LY, CHI_HUY_TRUONG, CHU_DAU_TU],
  },
  {
    // Kế toán không có trong ma trận gốc cho mục này — giả định không truy cập. Cần xác nhận.
    key: "field",
    label: "Hiện trường & Giao việc",
    path: "/field",
    icon: Camera,
    group: "site",
    roles: [BAN_QUAN_LY, CHI_HUY_TRUONG, KY_SU_GIAM_SAT, DOI_TRUONG, CHU_DAU_TU],
  },
  {
    key: "diary",
    label: "Nhật ký thi công",
    path: "/diary",
    icon: FileText,
    group: "site",
    roles: ALL_ROLES,
  },
  {
    // Không có trong ma trận gốc: lấy theo vai trò có quyền nghiệm thu ở backend. Cần xác nhận.
    key: "acceptance",
    label: "Nghiệm thu khối lượng",
    path: "/acceptance",
    icon: CheckSquare,
    group: "site",
    roles: [BAN_QUAN_LY, CHI_HUY_TRUONG, KY_SU_GIAM_SAT, CHU_DAU_TU],
  },
  {
    // Chưa có trang thật. Cần xác nhận vai trò.
    key: "finance",
    label: "Thanh toán & Chi phí",
    path: "/finance",
    icon: Wallet,
    group: "manage",
    implemented: false,
    roles: [BAN_QUAN_LY, CHU_DAU_TU, KE_TOAN],
  },
  {
    key: "members",
    label: "Thành viên & Tổ đội",
    path: "/members",
    icon: Users,
    group: "manage",
    roles: [BAN_QUAN_LY, CHI_HUY_TRUONG, CHU_DAU_TU],
  },
];

// action -> danh sách vai trò được phép.
export const PERMISSIONS = {
  "member.invite": [BAN_QUAN_LY, CHU_DAU_TU],
  "team.manage": [BAN_QUAN_LY, CHI_HUY_TRUONG, CHU_DAU_TU], // khu "Đội thi công"
  "work.assign": [CHI_HUY_TRUONG], // khu "Giao việc"

  "wbs.manage": [BAN_QUAN_LY],
  "contract_quantity.edit": [BAN_QUAN_LY, CHU_DAU_TU],

  "calendar.edit": [BAN_QUAN_LY, CHI_HUY_TRUONG, CHU_DAU_TU],

  "baseline.lock": [BAN_QUAN_LY],
  "cpm.recalculate": [CHI_HUY_TRUONG],
  // Cập nhật tiến độ công việc trên Gantt/CPM: các vai trò "toàn quyền" ở 2 trang này.
  "progress.update": [BAN_QUAN_LY, CHI_HUY_TRUONG, CHU_DAU_TU],

  "field.report": [DOI_TRUONG],
  "field.viewAll": ALL_ROLES.filter((r) => r !== DOI_TRUONG),

  "diary.create": [BAN_QUAN_LY, CHI_HUY_TRUONG, KY_SU_GIAM_SAT, DOI_TRUONG],
  "diary.lock": [KY_SU_GIAM_SAT],
  "diary.unlock": [BAN_QUAN_LY],
};

function isKnownRole(role) {
  return ALL_ROLES.includes(role);
}

export function isSystemAdmin(role) {
  return role === SYSTEM_ADMIN_ROLE;
}

// Vai trò hợp lệ (6 vai trò dự án hoặc system_admin). Vai trò lạ/rỗng => không có quyền gì.
export function isValidRole(role) {
  return isKnownRole(role) || isSystemAdmin(role);
}

export function can(role, action) {
  if (!isValidRole(role)) return false;
  if (isSystemAdmin(role)) return Object.hasOwn(PERMISSIONS, action);
  const allowed = PERMISSIONS[action];
  return Array.isArray(allowed) && allowed.includes(role);
}

function matchesPath(pathname, base) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function findMenuItemByPath(pathname) {
  return (
    MENU_CONFIG.find(
      (item) =>
        matchesPath(pathname, item.path) ||
        (item.paths || []).some((p) => matchesPath(pathname, p))
    ) || null
  );
}

export function canAccessMenuItem(role, item) {
  if (!isValidRole(role)) return false;
  if (isSystemAdmin(role)) return true;
  return item.roles.includes(role);
}

// Mặc định từ chối: route không nằm trong MENU_CONFIG thì không ai vào được.
export function canAccessRoute(role, pathname) {
  const item = findMenuItemByPath(pathname);
  return Boolean(item) && canAccessMenuItem(role, item);
}

export function getVisibleMenu(role) {
  return MENU_CONFIG.filter((item) => canAccessMenuItem(role, item));
}

// Menu đã gom nhóm; nhóm rỗng bị loại nên không hiện tiêu đề trống.
export function getVisibleMenuGroups(role) {
  const visible = getVisibleMenu(role);
  return MENU_GROUPS.map((group) => ({
    ...group,
    items: visible.filter((item) => item.group === group.key),
  })).filter((group) => group.items.length > 0);
}

// Trang mặc định sau đăng nhập / khi bị chặn route: đội trưởng -> /field, còn lại -> /dashboard.
// Vai trò không hợp lệ -> null (không có trang nào để về).
export function defaultRouteForRole(role) {
  if (!isValidRole(role)) return null;
  return role === DOI_TRUONG ? "/field" : "/dashboard";
}
