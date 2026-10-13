import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import api from "../lib/api";
import DiarySyncStatus from "../components/DiarySyncStatus";
import useDiarySyncStatus from "../hooks/useDiarySyncStatus";
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
  Bell,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Calendar,
  Building2,
  ShieldCheck,
  Menu,
  Check,
  ChevronsUpDown,
  Coins,
  Wifi,
  WifiOff,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "../components/ui/command";

// Danh mục điều hướng nguyên bản với phân quyền theo vai trò
const navItems = [
  {
    label: "Tổng quan",
    icon: Home,
    path: "/dashboard",
    roles: ["ALL"],
  },
  {
    label: "Cơ cấu công việc (WBS)",
    icon: Network,
    path: "/wbs",
    roles: ["ban_quan_ly", "chi_huy_truong", "chu_dau_tu", "ky_su_giam_sat"],
  },
  {
    label: "Khối lượng hợp đồng",
    icon: Coins,
    path: "/contract-quantities",
    roles: ["chu_dau_tu", "ban_quan_ly", "ke_toan", "chi_huy_truong", "ky_su_giam_sat"],
  },
  {
    label: "Tiến độ thi công",
    icon: CalendarDays,
    path: "/gantt",
    hasChildren: true,
    roles: ["ban_quan_ly", "chi_huy_truong", "chu_dau_tu", "ky_su_giam_sat", "doi_truong"],
    children: [
      {
        label: "Bảng đường găng (CPM)",
        icon: TrendingUp,
        path: "/schedule",
        roles: ["ban_quan_ly", "chi_huy_truong", "chu_dau_tu", "ky_su_giam_sat", "doi_truong"],
      },
      {
        label: "Cảnh báo tiến độ",
        icon: Bell,
        path: "/warnings",
        roles: ["ban_quan_ly", "chi_huy_truong", "chu_dau_tu", "ky_su_giam_sat"],
      },
      {
        label: "Lịch & Ngày nghỉ",
        icon: Calendar,
        path: "/calendar",
        roles: ["ban_quan_ly", "chi_huy_truong", "chu_dau_tu", "ky_su_giam_sat"],
      },
    ],
  },
  {
    label: "Hiện trường & Giao việc",
    icon: Camera,
    path: "/field",
    roles: ["chi_huy_truong", "ban_quan_ly", "doi_truong", "ky_su_giam_sat", "chu_dau_tu"],
  },
  {
    label: "Nhật ký thi công",
    icon: FileText,
    path: "/diary",
    roles: ["ky_su_giam_sat", "chi_huy_truong", "ban_quan_ly", "doi_truong", "chu_dau_tu"],
  },
  {
    label: "Nghiệm thu khối lượng",
    icon: CheckSquare,
    path: "/acceptance",
    roles: ["ky_su_giam_sat", "ban_quan_ly", "chu_dau_tu", "ke_toan", "chi_huy_truong"],
  },
  {
    label: "Thanh toán & Chi phí",
    icon: Wallet,
    path: "/finance",
    roles: ["ke_toan", "chu_dau_tu", "ban_quan_ly"],
  },
  {
    label: "Thành viên & Tổ đội",
    icon: Users,
    path: "/members",
    roles: ["ban_quan_ly", "chu_dau_tu", "chi_huy_truong"],
  },
  {
    label: "Quản trị hệ thống",
    icon: Settings,
    path: "/admin",
    adminOnly: true,
  },
];

// Danh sách phẳng tra cứu tên trang cho Topbar breadcrumb
const allNavItems = [
  { label: "Tổng quan", icon: Home, path: "/dashboard" },
  { label: "Cơ cấu công việc (WBS)", icon: Network, path: "/wbs" },
  { label: "Khối lượng hợp đồng", icon: Coins, path: "/contract-quantities" },
  { label: "Tiến độ thi công", icon: CalendarDays, path: "/gantt" },
  { label: "Bảng đường găng (CPM)", icon: TrendingUp, path: "/schedule" },
  { label: "Cảnh báo tiến độ", icon: Bell, path: "/warnings" },
  { label: "Lịch & Ngày nghỉ", icon: Calendar, path: "/calendar" },
  { label: "Hiện trường & Giao việc", icon: Camera, path: "/field" },
  { label: "Nhật ký thi công", icon: FileText, path: "/diary" },
  { label: "Nghiệm thu khối lượng", icon: CheckSquare, path: "/acceptance" },
  { label: "Thanh toán & Chi phí", icon: Wallet, path: "/finance" },
  { label: "Thành viên & Tổ đội", icon: Users, path: "/members" },
  { label: "Quản trị hệ thống", icon: Settings, path: "/admin" },
];

export const ROLE_NAMES = {
  ban_quan_ly: "Ban quản lý",
  chi_huy_truong: "Chỉ huy trưởng",
  ky_su_giam_sat: "Kỹ sư giám sát",
  doi_truong: "Đội trưởng",
  chu_dau_tu: "Chủ đầu tư",
  ke_toan: "Kế toán",
};

export const getRoleDisplay = (user, projectRole) => {
  if (user?.is_system_admin) {
    if (projectRole && ROLE_NAMES[projectRole]) {
      return `Quản trị viên · ${ROLE_NAMES[projectRole]}`;
    }
    return "Quản trị viên hệ thống";
  }
  const r = projectRole || user?.role;
  return ROLE_NAMES[r] || "Thành viên";
};

// Định dạng ngày hiện tại tiếng Việt động theo thời gian thực tế
function getFormattedCurrentDate() {
  const now = new Date();
  const daysOfWeek = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const dayName = daysOfWeek[now.getDay()];
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  // Tính số tuần trong năm (ISO 8601)
  const target = new Date(now.valueOf());
  const dayNr = (now.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);

  return `${dayName}, ${day}/${month}/${year} · Tuần ${weekNumber}`;
}

export default function DashboardLayout({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Lấy trạng thái đồng bộ ngoại tuyến từ hook
  const {
    isOnline,
    stats,
    isSyncing,
  } = useDiarySyncStatus();

  // Nhánh Tiến độ thi công: mở tự động nếu đang ở một trong các trang thuộc nhánh
  const schedulePaths = ["/gantt", "/schedule", "/warnings", "/calendar"];
  const [isScheduleExpanded, setIsScheduleExpanded] = useState(() => {
    return schedulePaths.includes(location.pathname);
  });

  useEffect(() => {
    if (schedulePaths.includes(location.pathname)) {
      setIsScheduleExpanded(true);
    }
  }, [location.pathname]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Điều hướng có kiểm soát cho các route
  const handleNavigate = (path) => {
    if (path === "/finance") {
      alert("Tính năng Quản lý Thanh toán & Chi phí đang được phát triển trong các Sprint tiếp theo.");
      return;
    }
    navigate(path);
  };

  const currentProjectId = localStorage.getItem("currentProjectId") || 1;

  const [currentProject, setCurrentProject] = useState(() => {
    try {
      const activeId = localStorage.getItem("currentProjectId") || 1;
      return JSON.parse(localStorage.getItem(`cached_project_${activeId}`) || "null");
    } catch {
      return null;
    }
  });

  const [projectRole, setProjectRole] = useState(() => {
    try {
      const activeId = localStorage.getItem("currentProjectId") || 1;
      return localStorage.getItem(`cached_role_${activeId}`) || null;
    } catch {
      return null;
    }
  });

  const [projects, setProjects] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cached_projects") || "[]");
    } catch {
      return [];
    }
  });
  const [openSwitcher, setOpenSwitcher] = useState(false);

  useEffect(() => {
    // Fetch all projects for the switcher
    api
      .get("/projects")
      .then((res) => {
        const projs = res.data.projects || [];
        setProjects(projs);
        try {
          localStorage.setItem("cached_projects", JSON.stringify(projs));
        } catch {
          /* ignore */
        }
        const stored = localStorage.getItem("currentProjectId");
        if (!stored && projs.length > 0) {
          localStorage.setItem("currentProjectId", projs[0].id);
          setCurrentProject(projs[0]);
        }
      })
      .catch(console.error);

    const activeProjectId = localStorage.getItem("currentProjectId") || currentProjectId;
    if (activeProjectId) {
      api
        .get(`/projects/${activeProjectId}`)
        .then((res) => {
          if (res.data?.project) {
            setCurrentProject(res.data.project);
            try {
              localStorage.setItem(`cached_project_${activeProjectId}`, JSON.stringify(res.data.project));
            } catch {
              /* ignore */
            }
          }
          if (res.data?.membership) {
            setProjectRole(res.data.membership);
            try {
              localStorage.setItem(`cached_role_${activeProjectId}`, res.data.membership);
            } catch {
              /* ignore */
            }
          }
        })
        .catch((err) => console.error(err));
    }
  }, [currentProjectId]);

  const handleSwitchProject = async (id) => {
    if (id.toString() === currentProjectId.toString()) {
      setOpenSwitcher(false);
      return;
    }

    if (!window.confirm("Chuyển sang dự án khác sẽ tải lại trang. Các thay đổi chưa lưu có thể bị mất. Tiếp tục?")) {
      return;
    }

    try {
      await api.post(`/projects/${id}/open`);
      localStorage.setItem("currentProjectId", id);
      setOpenSwitcher(false);
      window.location.reload();
    } catch (err) {
      alert("Không thể chuyển dự án: " + (err.response?.data?.message || err.message));
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error(err);
    } finally {
      try {
        localStorage.removeItem("cached_auth_user");
      } catch {
        /* ignore */
      }
      setUser(null);
      navigate("/login");
    }
  };

  const currentNav = allNavItems.find((item) => item.path === location.pathname) || allNavItems[0];

  // Chỉ hiển thị khối trạng thái đồng bộ đầy đủ trên trang Nhật ký hoặc Hiện trường
  const showFullSyncBanner = location.pathname === "/diary" || location.pathname === "/field";

  // Phân quyền hiển thị menu
  const effectiveRole = projectRole || user?.role;
  const isSystemAdmin = Boolean(user?.is_system_admin);

  const isItemAllowed = (item) => {
    if (item.adminOnly) {
      return isSystemAdmin;
    }
    if (isSystemAdmin) {
      return true; // System Admin có toàn quyền truy cập chức năng
    }
    if (!item.roles || item.roles.includes("ALL")) {
      return true;
    }
    return effectiveRole && item.roles.includes(effectiveRole);
  };

  const filteredNavItems = navItems
    .filter(isItemAllowed)
    .map((item) => {
      if (item.hasChildren && item.children) {
        const filteredChildren = item.children.filter(isItemAllowed);
        return {
          ...item,
          children: filteredChildren,
        };
      }
      return item;
    });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Bố cục nguyên bản */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex-col bg-sidebar py-5 text-sidebar-foreground transition-all duration-300 h-screen overflow-hidden lg:static lg:flex shrink-0
          ${isMobileMenuOpen ? "translate-x-0 w-[280px] px-4 flex" : "-translate-x-full lg:translate-x-0"}
          ${isSidebarCollapsed ? "lg:w-[72px] lg:items-center lg:px-2" : "lg:w-[280px] lg:px-4"}
          ${!isMobileMenuOpen ? "hidden lg:flex" : ""}
        `}
      >
        {/* Brand Header */}
        <div className={`flex items-center gap-3 w-full shrink-0 ${isSidebarCollapsed ? "justify-center" : "justify-between"}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <ShieldCheck className="size-6" />
            </div>
            {!isSidebarCollapsed && (
              <div className="overflow-hidden whitespace-nowrap">
                <p className="text-[15px] font-bold tracking-tight text-sidebar-foreground">Construction Management</p>
                <p className="text-[11px] text-sidebar-muted">Site Operations Platform</p>
              </div>
            )}
          </div>
          {/* Nút đóng drawer trên mobile */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Đóng menu"
            className="lg:hidden flex size-8 items-center justify-center rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        {/* Project Switcher Bar */}
        {!isSidebarCollapsed && (
          <div className="mt-5 w-full">
            <Popover open={openSwitcher} onOpenChange={setOpenSwitcher}>
              <PopoverTrigger asChild>
                <button
                  className="flex w-full items-center justify-between rounded-xl bg-sidebar-accent/70 px-3.5 py-2.5 text-left transition-all hover:bg-sidebar-accent outline-none cursor-pointer border border-sidebar-border/50 group"
                  title="Chuyển đổi dự án"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary shrink-0">
                      <Building2 className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-sidebar-muted uppercase tracking-wider mb-0.5">Dự án đang làm việc</p>
                      <p className="truncate text-sm font-bold text-sidebar-foreground">
                        {currentProject ? currentProject.name : "Đang tải..."}
                      </p>
                    </div>
                  </div>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 text-sidebar-muted" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Tìm dự án..." />
                  <CommandList>
                    <CommandEmpty>Không tìm thấy dự án.</CommandEmpty>
                    <CommandGroup heading="Dự án của bạn">
                      {projects.map((project) => (
                        <CommandItem
                          key={project.id}
                          value={project.name}
                          onSelect={() => handleSwitchProject(project.id)}
                          className="flex items-center justify-between cursor-pointer py-2"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="truncate font-medium">{project.name}</span>
                            {project.status && (
                              <span className="text-[11px] text-muted-foreground">{project.status}</span>
                            )}
                          </div>
                          {currentProjectId.toString() === project.id.toString() && (
                            <Check className="size-4 text-primary shrink-0 ml-2" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                  <div className="border-t p-2">
                    <button
                      onClick={() => { setOpenSwitcher(false); navigate("/projects"); }}
                      className="w-full text-center text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-1.5 rounded hover:bg-accent cursor-pointer"
                    >
                      Xem tất cả dự án →
                    </button>
                  </div>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Danh sách menu đơn nguyên bản */}
        <div
          className="mt-6 flex-1 w-full overflow-y-auto pr-0.5"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <nav className="flex flex-col gap-1 w-full">
            {filteredNavItems.map((item) => {
              if (item.hasChildren) {
                const isParentActive = location.pathname === item.path;
                const isAnyChildActive = item.children.some(
                  (c) => c.path === location.pathname
                );

                return (
                  <div key={item.label} className="flex flex-col w-full">
                    <div
                      className={[
                        "flex items-center rounded-xl transition-colors cursor-pointer outline-none group select-none py-3",
                        isParentActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm"
                          : isAnyChildActive
                          ? "text-sidebar-foreground bg-sidebar-accent/50"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent",
                        isSidebarCollapsed ? "justify-center px-0" : "px-3.5",
                      ].join(" ")}
                      title={isSidebarCollapsed ? item.label : undefined}
                      onClick={() => {
                        handleNavigate(item.path);
                        setIsScheduleExpanded(true);
                      }}
                    >
                      <item.icon className={`size-5 shrink-0 ${isParentActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/80 group-hover:text-sidebar-foreground"}`} />

                      {!isSidebarCollapsed && (
                        <>
                          <span className="ml-3 flex-1 text-sm font-medium tracking-tight truncate">
                            {item.label}
                          </span>
                          <button
                            type="button"
                            aria-label="Mở rộng menu con"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsScheduleExpanded(!isScheduleExpanded);
                            }}
                            className="p-1 -mr-1 rounded-md hover:bg-sidebar-accent/80 text-sidebar-muted hover:text-sidebar-foreground transition-transform"
                          >
                            <ChevronDown
                              className={`size-4 transition-transform duration-200 ${
                                isScheduleExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Menu con cho mục Tiến độ/Gantt */}
                    {!isSidebarCollapsed && isScheduleExpanded && item.children.length > 0 && (
                      <div className="mt-1 ml-4 pl-3.5 border-l border-sidebar-border/50 flex flex-col gap-1">
                        {item.children.map((child) => {
                          const isChildActive = location.pathname === child.path;
                          return (
                            <button
                              key={child.label}
                              onClick={() => handleNavigate(child.path)}
                              className={[
                                "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left w-full outline-none select-none",
                                isChildActive
                                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm"
                                  : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                              ].join(" ")}
                            >
                              <child.icon className="size-4 shrink-0" />
                              <span className="truncate">{child.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.label}
                  onClick={() => handleNavigate(item.path)}
                  title={isSidebarCollapsed ? item.label : undefined}
                  className={[
                    "flex items-center rounded-xl text-sm font-medium transition-colors cursor-pointer w-full text-left outline-none group select-none py-3",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-sm"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-accent",
                    isSidebarCollapsed ? "justify-center px-0" : "px-3.5",
                  ].join(" ")}
                >
                  <item.icon className={`size-5 shrink-0 ${isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/80 group-hover:text-sidebar-foreground"}`} />
                  {!isSidebarCollapsed && (
                    <span className="ml-3 tracking-tight truncate">{item.label}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Nút thu gọn / mở rộng Sidebar ở chân menu */}
        <div className="mt-auto pt-3 border-t border-sidebar-border/40 w-full hidden lg:block">
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Mở rộng Sidebar" : "Thu gọn Sidebar"}
            className={`flex items-center w-full rounded-xl py-2 text-xs font-medium text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer outline-none ${
              isSidebarCollapsed ? "justify-center px-1" : "px-3"
            }`}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="size-5 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="size-5 shrink-0" />
                <span className="ml-2.5 truncate">Thu gọn Sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Topbar / Header */}
        <header className="sticky top-0 z-50 flex items-center justify-between gap-x-4 border-b border-border bg-card px-4 py-3 sm:px-6">
          {/* Bên trái: Nút thu gọn Sidebar, Breadcrumb dự án & Tên trang */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setIsMobileMenuOpen(!isMobileMenuOpen);
                } else {
                  setIsSidebarCollapsed(!isSidebarCollapsed);
                }
              }}
              aria-label="Mở/Đóng menu"
              title={isSidebarCollapsed ? "Mở rộng Sidebar" : "Thu gọn Sidebar"}
              className="flex min-h-10 min-w-10 items-center justify-center -ml-2 text-muted-foreground hover:bg-accent/50 rounded-xl transition-colors outline-none cursor-pointer"
            >
              <Menu className="size-5 shrink-0" />
            </button>

            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground min-w-0">
              <span className="truncate max-w-[140px] sm:max-w-[200px]">
                {currentProject ? `Dự án ${currentProject.name}` : "Đang tải..."}
              </span>
              <ChevronRight className="size-4 shrink-0" />
              <span className="shrink-0 font-semibold text-foreground">
                {currentNav.label}
              </span>
            </div>
          </div>

          {/* Bên phải: Trạng thái đồng bộ gọn, Ngày hiện tại động, Chuông cảnh báo, Tài khoản duy nhất */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Trạng thái đồng bộ ngoại tuyến thu gọn */}
            <div
              className={`hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                isOnline
                  ? "border-emerald-200 bg-emerald-50/50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
              title={
                isOnline
                  ? `Đang trực tuyến${stats.totalPending > 0 ? ` (${stats.totalPending} mục đang chờ đồng bộ)` : " - Đã đồng bộ"}`
                  : `Ngoại tuyến${stats.totalPending > 0 ? ` (${stats.totalPending} mục lưu cục bộ)` : ""}`
              }
            >
              {isOnline ? (
                <Wifi className="size-3.5 text-emerald-600 shrink-0" />
              ) : (
                <WifiOff className="size-3.5 text-amber-600 shrink-0" />
              )}
              <span className="hidden md:inline">
                {isOnline ? "Trực tuyến" : "Ngoại tuyến"}
              </span>
              {isSyncing && (
                <RefreshCw className="size-3 text-emerald-600 animate-spin" />
              )}
              {stats.totalPending > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                  {stats.totalPending}
                </span>
              )}
            </div>

            {/* Ngày hiện tại động (không hardcode) */}
            <p className="hidden xl:flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CalendarDays className="size-4 text-muted-foreground/80 shrink-0" />
              {getFormattedCurrentDate()}
            </p>

            {/* Chuông thông báo cảnh báo */}
            <button
              aria-label="Cảnh báo tiến độ"
              title="Xem cảnh báo tiến độ"
              className="relative flex min-h-10 min-w-10 items-center justify-center text-muted-foreground outline-none cursor-pointer hover:bg-accent/50 rounded-xl transition-colors"
              onClick={() => navigate("/warnings")}
            >
              <Bell className="size-5" />
            </button>

            {/* Khu vực tài khoản chính & duy nhất */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                aria-label="Menu tài khoản"
                className="flex items-center gap-2.5 outline-none hover:bg-accent/50 p-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <div className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
                  {user?.name?.substring(0, 2).toUpperCase() || "HL"}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-semibold text-foreground leading-tight">{user?.name || "Người dùng"}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{getRoleDisplay(user, projectRole)}</p>
                </div>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>

              {/* Dropdown Menu tài khoản */}
              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-border bg-card p-2 shadow-lg z-50">
                  <div className="px-3 py-2 border-b border-border/70 mb-1">
                    <p className="text-sm font-semibold truncate text-foreground">{user?.name || "Người dùng"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email || ""}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {user?.is_system_admin && (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          Hệ thống: Quản trị viên
                        </span>
                      )}
                      {projectRole && (
                        <span className="rounded-md bg-info/10 px-1.5 py-0.5 text-[10px] font-bold text-info">
                          Dự án: {ROLE_NAMES[projectRole] || projectRole}
                        </span>
                      )}
                    </div>
                  </div>

                  {user?.is_system_admin && (
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        navigate("/admin");
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors text-left outline-none cursor-pointer"
                    >
                      <ShieldCheck className="size-4 text-primary" />
                      Quản trị hệ thống
                    </button>
                  )}

                  <div className="border-t border-border/70 mt-1 pt-1">
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors text-left outline-none cursor-pointer"
                    >
                      <LogOut className="size-4" />
                      Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Khối đồng bộ chi tiết (chỉ hiển thị khi đang ở trang Nhật ký hoặc Hiện trường) */}
        {showFullSyncBanner && <DiarySyncStatus />}

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <Outlet context={{ currentProject, projectRole, is_system_admin: isSystemAdmin }} />
        </main>
      </div>
    </div>
  );
}
