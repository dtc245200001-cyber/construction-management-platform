import React, { useMemo } from "react";
import { PermissionContext } from "../contexts/permissionContext";
import { useProjectRole } from "../hooks/useProjectRole";

// Tải vai trò trong dự án một lần cho cả khu vực dashboard rồi chia sẻ cho
// sidebar, route guard, Topbar và mọi trang con (qua usePermission / <Can>).
export default function PermissionProvider({ projectId, children }) {
  const { role, loading } = useProjectRole(projectId);
  const value = useMemo(() => ({ role, loading }), [role, loading]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}
