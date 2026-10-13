import { useContext, useMemo } from "react";
import { PermissionContext } from "../contexts/permissionContext";
import { useProjectRole } from "./useProjectRole";
import { can, canAccessRoute, defaultRouteForRole } from "../config/permissions";

// Cách dùng thống nhất cho mọi component:
//   const { can, loading } = usePermission();
//   {can("wbs.manage") && <button>...</button>}
// Khi đang tải vai trò thì can() = false và loading = true (không đoán quyền).
export function usePermission() {
  const shared = useContext(PermissionContext);
  const projectId =
    typeof localStorage !== "undefined" ? safeCurrentProjectId() : null;
  // Không có Provider (trang render độc lập) thì tự tải vai trò.
  const own = useProjectRole(projectId, shared === null);
  const { role, loading } = shared ?? own;

  return useMemo(
    () => ({
      role,
      loading,
      can: (action) => !loading && can(role, action),
      canRoute: (pathname) => !loading && canAccessRoute(role, pathname),
      defaultRoute: defaultRouteForRole(role),
    }),
    [role, loading]
  );
}

function safeCurrentProjectId() {
  try {
    return localStorage.getItem("currentProjectId");
  } catch {
    return null;
  }
}
