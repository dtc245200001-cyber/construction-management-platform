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
  Pencil,
  Menu
} from "lucide-react";

const navItems = [
  { label: "Tổng quan", icon: Home, path: "/dashboard" },
  { label: "Cơ cấu công việc (WBS)", icon: Network, path: "/wbs" },
  { label: "Bảng đường găng (CPM)", icon: TrendingUp, path: "/schedule" },
  { label: "Tiến độ thi công", icon: CalendarDays, path: "/gantt" },
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

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

  const [currentProject, setCurrentProject] = useState(null);

  React.useEffect(() => {
    if (currentProjectId) {
      api.get(`/projects/${currentProjectId}`)
        .then(res => setCurrentProject(res.data.project))
        .catch(err => console.error(err));
    }
  }, [currentProjectId]);

  const currentNav = navItems.find(item => item.path === location.pathname) || navItems[0];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 flex-col bg-sidebar py-6 text-sidebar-foreground transition-all duration-300 lg:sticky lg:top-0 lg:h-screen lg:flex shrink-0
          ${isMobileMenuOpen ? 'translate-x-0 w-[280px] px-5 flex' : '-translate-x-full lg:translate-x-0'}
          ${isSidebarCollapsed ? 'lg:w-[80px] lg:items-center lg:px-2' : 'lg:w-[280px] lg:px-5'}
          ${!isMobileMenuOpen ? 'hidden lg:flex' : ''}
        `}
      >
        <div className={`flex items-center gap-3 w-full ${isSidebarCollapsed ? 'justify-center' : ''}`}>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <ShieldCheck className="size-6" />
          </div>
          {!isSidebarCollapsed && (
            <div className="overflow-hidden whitespace-nowrap">
              <p className="text-[15px] font-bold tracking-tight">Construction Management</p>
              <p className="text-[11px] text-sidebar-muted">Site Operations Platform</p>
            </div>
          )}
        </div>

        {!isSidebarCollapsed && (
          <div className="mt-6 rounded-xl bg-sidebar-accent p-4 w-full">
            <div className="flex items-start gap-3 [&>div]:min-w-0">
              <Building2 className="mt-0.5 size-5 shrink-0 text-sidebar-muted" />
              <div className="min-w-0">
                <p className="text-xs text-sidebar-muted">Dự án đang làm việc</p>
                <p className="truncate text-sm font-semibold">{currentProject ? currentProject.name : 'Đang tải...'}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-sidebar-muted">
                  {currentProject ? currentProject.code : '...'} ·
                  <span 
                    onClick={() => navigate('/projects')}
                    className="inline-flex items-center gap-1 underline cursor-pointer hover:text-sidebar-foreground transition-colors shrink-0"
                  >
                    <Pencil className="size-3" /> Đổi dự án
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

        <nav className="mt-6 flex flex-1 flex-col gap-1 w-full">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.label}
                title={item.label}
                onClick={() => {
                  if (item.path === '/dashboard' || item.path === '/wbs' || item.path === '/members' || item.path === '/schedule' || item.path === '/gantt') {
                    navigate(item.path);
                  } else {
                    alert("Tính năng này sẽ được phát triển trong các Sprint tiếp theo.");
                  }
                }}
                className={[
                  "flex items-center gap-3 rounded-xl py-3 text-left text-sm font-medium transition-colors cursor-pointer outline-none",
                  isSidebarCollapsed ? "justify-center px-0" : "px-3.5",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent",
                ].join(" ")}
              >
                <item.icon className="size-5 shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {!isSidebarCollapsed && (
          <div className="mt-6 rounded-xl bg-sidebar-accent p-4 w-full">
            <p className="flex items-center gap-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-full bg-success" />
              Đang chờ đồng bộ 3 mục
            </p>
            <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-sidebar-border/60 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-border outline-none">
              <RefreshCw className="size-4 shrink-0" /> Đồng bộ ngay
            </button>
          </div>
        )}

        <button 
          title="Đăng xuất"
          onClick={handleLogout} 
          className={`mt-5 flex items-center gap-3 py-2 text-sm text-sidebar-foreground/85 hover:text-red-500 outline-none w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'}`}
        >
          <Settings className="size-5 shrink-0" /> 
          {!isSidebarCollapsed && "Đăng xuất"}
        </button>
      </aside>

      {/* Main Container */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-border bg-card px-6 py-4">
          <button 
            onClick={() => {
              if (window.innerWidth < 1024) {
                setIsMobileMenuOpen(!isMobileMenuOpen);
              } else {
                setIsSidebarCollapsed(!isSidebarCollapsed);
              }
            }} 
            className="p-2 -ml-2 text-muted-foreground hover:bg-accent/50 rounded-xl transition-colors outline-none cursor-pointer"
          >
            <Menu className="size-5 shrink-0" />
          </button>
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {currentProject ? `Dự án ${currentProject.name}` : 'Đang tải...'} <ChevronRight className="size-4 shrink-0" />
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
