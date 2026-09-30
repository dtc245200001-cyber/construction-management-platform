import React, { useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import api from "../lib/api";
import {
  Home,
  Network,
  TrendingUp,
  Camera,
  FileText,
  CheckSquare,
  Wallet,
  Users,
  Settings,
  LogOut,
  RefreshCw,
  Bell,
  Plus,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Building2,
  ShieldCheck,
  Pencil
} from "lucide-react";

const navItems = [
  { label: "Tổng quan", icon: Home, path: "/dashboard" },
  { label: "Cơ cấu công việc (WBS)", icon: Network, path: "/wbs" },
  { label: "Tiến độ & Đường găng", icon: TrendingUp, path: "/schedule" },
  { label: "Hiện trường & Giao việc", icon: Camera, path: "/field" },
  { label: "Nhật ký thi công", icon: FileText, path: "/diary" },
  { label: "Nghiệm thu khối lượng", icon: CheckSquare, path: "/acceptance" },
  { label: "Thanh toán & Chi phí", icon: Wallet, path: "/finance" },
  { label: "Thành viên & Tổ đội", icon: Users, path: "/members" },
];

export default function DashboardLayout({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // In a real app, this should come from context or API based on localStorage.getItem('currentProjectId')
  const currentProjectId = localStorage.getItem('currentProjectId') || 1; 

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      setUser(null);
      navigate('/login');
    } catch (err) {
      console.error(err);
    }
  };

  const currentNav = navItems.find(item => item.path === location.pathname) || navItems[0];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col bg-sidebar px-5 py-6 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <p className="text-base font-bold tracking-tight">CÔNG TRƯỜNG 360</p>
            <p className="text-xs text-sidebar-muted">Site Operations Platform</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-sidebar-accent p-4">
          <div className="flex items-start gap-3 [&>div]:min-w-0">
            <Building2 className="mt-0.5 size-5 text-sidebar-muted" />
            <div className="min-w-0">
              <p className="text-xs text-sidebar-muted">Dự án đang làm việc</p>
              <p className="truncate text-sm font-semibold">Tổ hợp thương mại An Phú</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-sidebar-muted">
                APC-2026-01 ·
                <span 
                  onClick={() => navigate('/projects')}
                  className="inline-flex items-center gap-1 underline cursor-pointer hover:text-sidebar-foreground transition-colors"
                >
                  <Pencil className="size-3" /> Đổi dự án
                </span>
              </p>
            </div>
          </div>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.label}
                onClick={() => {
                  if (item.path === '/dashboard' || item.path === '/wbs') {
                    navigate(item.path);
                  } else {
                    alert("Tính năng này sẽ được phát triển trong các Sprint tiếp theo.");
                  }
                }}
                className={[
                  "flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm font-medium transition-colors cursor-pointer outline-none",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent",
                ].join(" ")}
              >
                <item.icon className="size-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mt-6 rounded-xl bg-sidebar-accent p-4">
          <p className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full bg-success" />
            Đang chờ đồng bộ 3 mục
          </p>
          <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-sidebar-border/60 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-border outline-none">
            <RefreshCw className="size-4" /> Đồng bộ ngay
          </button>
        </div>

        <button onClick={handleLogout} className="mt-5 flex items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground/85 hover:text-red-500 outline-none">
          <Settings className="size-5" /> Đăng xuất
        </button>
      </aside>

      {/* Main Container */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-border bg-card px-6 py-4">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            Dự án An Phú <ChevronRight className="size-4" />
            <span className="font-semibold text-foreground">{currentNav.label}</span>
          </p>

          <p className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" />
            Thứ Sáu, 25/09/2026 · Tuần 14
          </p>

          <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 outline-none">
            <Plus className="size-4" /> Ghi nhật ký nhanh
          </button>

          <button className="relative text-muted-foreground outline-none">
            <Bell className="size-5" />
            <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-primary-foreground">
              2
            </span>
          </button>

          <div className="relative">
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 outline-none hover:bg-accent/50 p-1.5 rounded-xl transition-colors cursor-pointer"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {user?.name?.substring(0,2).toUpperCase() || 'HL'}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold">{user?.name || 'Hương Lan'}</p>
                <p className="text-xs text-muted-foreground">{user?.role === 'ban_quan_ly' ? 'Ban quản lý' : user?.role === 'chi_huy_truong' ? 'Chỉ huy trưởng' : user?.role === 'doi_truong' ? 'Đội trưởng' : user?.role || 'Ban quản lý'}</p>
              </div>
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-card p-1 shadow-lg z-50">
                <button 
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft transition-colors text-left font-medium outline-none"
                >
                  <LogOut className="size-4" /> Đăng xuất
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Dynamic Page Content */}
        <Outlet />
      </div>
    </div>
  );
}
