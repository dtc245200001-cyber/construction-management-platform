import React, { useMemo } from "react";
import { PermissionContext } from "../contexts/permissionContext";
import { useProjectRole } from "../hooks/useProjectRole";

// Tải vai trò trong dự án một lần cho cả khu vực dashboard rồi chia sẻ cho
// sidebar, route guard, Topbar và mọi trang con (qua usePermission / <Can>).
export default function PermissionProvider({ projectId, children }) {
  const { role, loading } = useProjectRole(projectId);
  // UX fallback: nếu user là system_admin nhưng GET /projects/:id trả 404 (stale id sau TRUNCATE)
  // thì DashboardLayout đang heal, nhưng trong lúc chờ reload, tránh hiện 403 cho system_admin.
  let effectiveRole = role;
  let effectiveLoading = loading;
  try {
    const cachedUser = JSON.parse(localStorage.getItem("cached_auth_user") || "null");
    if (!loading && !role && cachedUser?.is_system_admin) {
      effectiveRole = "system_admin";
    }
  } catch { /* ignore */ }
  const value = useMemo(() => ({ role: effectiveRole, loading: effectiveLoading }), [effectiveRole, effectiveLoading]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}
