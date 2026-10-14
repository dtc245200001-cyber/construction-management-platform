import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Camera,
  FileText,
  TrendingUp,
  CheckSquare,
  Network,
  Menu,
  Building2,
  Plus,
} from "lucide-react";
import { can, ROLES } from "../config/permissions";

export default function MobileBottomNav({ role, onOpenMenu }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Xác định các mục phù hợp nhất cho từng vai trò trên màn hình điện thoại
  const getNavItems = () => {
    switch (role) {
      case ROLES.DOI_TRUONG:
        return [
          { label: "Hiện trường", path: "/field", icon: Camera },
          { label: "Nhật ký", path: "/diary", icon: FileText },
        ];
      case ROLES.CHI_HUY_TRUONG:
        return [
          { label: "Tổng quan", path: "/dashboard", icon: Home },
          { label: "Hiện trường", path: "/field", icon: Camera },
          { label: "Tiến độ", path: "/schedule", icon: TrendingUp },
          { label: "Nhật ký", path: "/diary", icon: FileText },
        ];
      case ROLES.KY_SU_GIAM_SAT:
        return [
          { label: "Tổng quan", path: "/dashboard", icon: Home },
          { label: "Hiện trường", path: "/field", icon: Camera },
          { label: "Nghiệm thu", path: "/acceptance", icon: CheckSquare },
          { label: "Nhật ký", path: "/diary", icon: FileText },
        ];
      case ROLES.BAN_QUAN_LY:
      case ROLES.CHU_DAU_TU:
        return [
          { label: "Tổng quan", path: "/dashboard", icon: Home },
          { label: "WBS", path: "/wbs", icon: Network },
          { label: "Tiến độ", path: "/schedule", icon: TrendingUp },
          { label: "Nghiệm thu", path: "/acceptance", icon: CheckSquare },
        ];
      default:
        return [
          { label: "Tổng quan", path: "/dashboard", icon: Home },
          { label: "Dự án", path: "/projects", icon: Building2 },
        ];
    }
  };

  const navItems = getNavItems();
  const canCreateDiary = can(role, "diary.create");

  return (
    <>
      {/* Floating Action Button (FAB) cho Nhật ký nhanh trên điện thoại */}
      {canCreateDiary && (
        <button
          type="button"
          onClick={() => navigate("/diary", { state: { openForm: true } })}
          aria-label="Ghi nhật ký nhanh"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 flex size-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition-transform lg:hidden cursor-pointer"
        >
          <Plus className="size-6" />
        </button>
      )}

      {/* Thanh điều hướng đáy cố định (Mobile Bottom Navigation) */}
      <nav
        aria-label="Điều hướng chính di động"
        className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-border bg-card/95 backdrop-blur-md px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:hidden"
      >
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex flex-1 flex-col items-center justify-center py-1 text-[11px] font-medium transition-colors outline-none cursor-pointer touch-target ${
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div
                className={`relative flex items-center justify-center p-1 rounded-xl transition-all ${
                  isActive ? "bg-primary/10" : ""
                }`}
              >
                <Icon className={`size-5 ${isActive ? "text-primary" : ""}`} />
              </div>
              <span className="truncate max-w-[72px] mt-0.5">{item.label}</span>
            </button>
          );
        })}

        {/* Nút Menu để mở đầy đủ Drawer */}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex flex-1 flex-col items-center justify-center py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors outline-none cursor-pointer touch-target"
        >
          <div className="flex items-center justify-center p-1 rounded-xl">
            <Menu className="size-5" />
          </div>
          <span className="truncate mt-0.5">Tất cả menu</span>
        </button>
      </nav>
    </>
  );
}
