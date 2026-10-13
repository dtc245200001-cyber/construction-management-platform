import { usePermission } from "../hooks/usePermission";

// <Can action="wbs.manage">...</Can> — không đủ quyền (hoặc đang tải vai trò)
// thì KHÔNG render gì cả (không làm mờ). `fallback` dành cho trường hợp cần thay thế.
export default function Can({ action, fallback = null, children }) {
  const { can } = usePermission();
  return can(action) ? children : fallback;
}
