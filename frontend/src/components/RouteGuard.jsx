import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { usePermission } from "../hooks/usePermission";
import { canAccessRoute } from "../config/permissions";
import ForbiddenPage from "../pages/ForbiddenPage";

// Chặn truy cập trực tiếp bằng URL (UX; backend vẫn là nơi chặn thật):
//  - đang tải vai trò: chưa render trang con (tránh chớp trang cấm / redirect nhầm)
//  - vai trò hợp lệ nhưng không có quyền với route: chuyển về trang mặc định của vai trò
//    (nếu chính trang mặc định cũng bị cấm thì hiện trang 403)
//  - vai trò không hợp lệ: trang 403, không có đường về
export default function RouteGuard({ children }) {
  const { role, loading, defaultRoute } = usePermission();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="p-8 text-sm text-slate-500" role="status">
        Đang kiểm tra quyền truy cập...
      </div>
    );
  }

  if (canAccessRoute(role, pathname)) return children;

  return <ForbiddenPage homePath={defaultRoute || "/projects"} />;
}
