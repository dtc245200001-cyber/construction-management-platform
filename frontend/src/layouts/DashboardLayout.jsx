import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import api from "../lib/api";
import DiarySyncStatus from "../components/DiarySyncStatus";
import MobileBottomNav from "../components/MobileBottomNav";
import PermissionProvider from "../components/PermissionProvider";
import RouteGuard from "../components/RouteGuard";
import { usePermission } from "../hooks/usePermission";
import { getVisibleMenuGroups, findMenuItemByPath, ROLE_LABELS } from "../config/permissions";
import {
  Settings,
  LogOut,
  Bell,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Building2,
  ShieldCheck,
  Menu,
  X,
  Check,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "../components/ui/command";

export default function DashboardLayout(props) {
  const projectId = safeCurrentProjectId();
  return (
    <PermissionProvider key={projectId || "none"} projectId={projectId}>
      <DashboardShell {...props} />
    </PermissionProvider>
  );
}

function safeCurrentProjectId() {
  try {
    return localStorage.getItem("currentProjectId") || "1";
  } catch {
    return "1";
  }
}

function getCurrentDateTimeVN() {
  const now = new Date();
  const days = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ];
  const dayOfWeek = days[now.getDay()];
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${dayOfWeek}, ${day}/${month}/${year} · ${hours}:${minutes}`;
}

function DashboardShell({ user, setUser }) {
  const [currentDateTime, setCurrentDateTime] = useState(() => getCurrentDateTimeVN());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(getCurrentDateTimeVN());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const { role, loading: roleLoading } = usePermission();
  const menuGroups = useMemo(
    () => (roleLoading ? [] : getVisibleMenuGroups(role)),
    [role, roleLoading]
  );

  const navigate = useNavigate();
  const location = useLocation();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const activeItemRef = useRef(null);

  // Đóng drawer khi đổi trang
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Khóa cuộn toàn trang khi mở drawer trên mobile
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  // Phím Esc để đóng menu drawer / user menu
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsMobileMenuOpen(false);
        setIsUserMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Tự động cuộn menu đang active vào tầm nhìn khi mở trang
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [location.pathname]);

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_collapsed", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const currentProjectId = localStorage.getItem("currentProjectId") || 1;

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

  const [currentProject, setCurrentProject] = useState(() => {
    try {
      const activeId = localStorage.getItem("currentProjectId") || 1;
      return JSON.parse(localStorage.getItem(`cached_project_${activeId}`) || "null");
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
    let cancelled = false;
    api
      .get("/projects")
      .then((res) => {
        if (cancelled) return;
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
        // Healing stale currentProjectId sau TRUNCATE/RESTART IDENTITY: nếu stored id không còn tồn tại trong danh sách mới thì đổi sang project đầu tiên còn lại.
        if (stored && projs.length > 0 && !projs.some((p) => String(p.id) === String(stored))) {
          const healedId = String(projs[0].id);
          try {
            localStorage.removeItem(`project_role_${stored}`);
            localStorage.removeItem(`cached_project_${stored}`);
          } catch { /* ignore */ }
          localStorage.setItem("currentProjectId", healedId);
          setCurrentProject(projs[0]);
          try { localStorage.setItem(`cached_project_${healedId}`, JSON.stringify(projs[0])); } catch { /* ignore */ }
          if (!cancelled) window.location.reload();
          return;
        }
      })
      .catch(console.error);

    const activeProjectId = localStorage.getItem("currentProjectId") || currentProjectId;
    if (activeProjectId) {
      api
        .get(`/projects/${activeProjectId}`)
        .then((res) => {
          if (cancelled) return;
          if (res.data?.project) {
            setCurrentProject(res.data.project);
            try {
              localStorage.setItem(
                `cached_project_${activeProjectId}`,
                JSON.stringify(res.data.project)
              );
            } catch {
              /* ignore */
            }
          }
        })
        .catch((err) => {
          if (cancelled) return;
          const status = err?.response?.status;
          // Stale id sau TRUNCATE: project không còn tồn tại. Heal bằng cách chọn project đầu tiên còn lại.
          if (status === 404) {
            api.get("/projects").then((res2) => {
              if (cancelled) return;
              const projs2 = res2.data?.projects || [];
              if (projs2.length > 0) {
                const healedId = String(projs2[0].id);
                try {
                  localStorage.removeItem(`project_role_${activeProjectId}`);
                  localStorage.removeItem(`cached_project_${activeProjectId}`);
                } catch { /* ignore */ }
                localStorage.setItem("currentProjectId", healedId);
                setCurrentProject(projs2[0]);
                try { localStorage.setItem(`cached_project_${healedId}`, JSON.stringify(projs2[0])); } catch { /* ignore */ }
                window.location.reload();
              }
            }).catch(() => console.error(err));
            return;
          }
          console.error(err);
        });
    }
    return () => { cancelled = true; };
  }, [currentProjectId]);

  const handleSwitchProject = async (id) => {
    if (id.toString() === currentProjectId.toString()) {
      setOpenSwitcher(false);
      return;
    }

    if (
      !window.confirm(
        "Chuyển sang dự án khác sẽ tải lại trang. Các thay đổi chưa lưu có thể bị mất. Tiếp tục?"
      )
    ) {
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

  const currentNav = findMenuItemByPath(location.pathname);

  // Quản lý trạng thái thu gọn / mở rộng của từng nhóm menu (Accordion)
  const [collapsedGroups, setCollapsedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebar_collapsed_groups");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Tự động mở nhóm chứa trang hiện tại để người dùng không bị mất dấu
  useEffect(() => {
    if (currentNav?.group && collapsedGroups[currentNav.group]) {
      setCollapsedGroups((prev) => {
        const next = { ...prev, [currentNav.group]: false };
        try {
          localStorage.setItem("sidebar_collapsed_groups", JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    }
  }, [currentNav?.group]);

  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [groupKey]: !prev[groupKey] };
      try {
        localStorage.setItem("sidebar_collapsed_groups", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="flex h-screen max-h-[100dvh] bg-background overflow-hidden">
      {/* Mobile Backdrop Overlay */}
      {isMobileMenuOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ================= SIDEBAR CHUẨN 3 VÙNG ================= */}
      <aside
        aria-label="Thanh điều hướng chính"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 h-screen max-h-[100dvh] shrink-0 lg:static
          ${
            isMobileMenuOpen
              ? "translate-x-0 w-[290px] max-w-[85vw] shadow-2xl"
              : "-translate-x-full lg:translate-x-0"
          }
          ${
            isSidebarCollapsed
              ? "lg:w-[76px] lg:items-center"
              : "lg:w-[280px]"
          }
        `}
      >
        {/* VÙNG 1: HEADER DỰ ÁN & LOGO (CỐ ĐỊNH TRÊN) */}
        <div
          className={`shrink-0 flex flex-col gap-4 p-4 border-b border-sidebar-border/30 ${
            isSidebarCollapsed ? "lg:p-3 lg:items-center" : ""
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <div
              className={`flex items-center gap-3 min-w-0 ${
                isSidebarCollapsed ? "lg:justify-center" : ""
              }`}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
                <ShieldCheck className="size-5.5" />
              </div>
              {!isSidebarCollapsed && (
                <div className="overflow-hidden whitespace-nowrap">
                  <p className="text-[14px] font-bold tracking-tight text-white">
                    Site Operations
                  </p>
                  <p className="text-[10px] text-sidebar-muted font-medium">
                    Construction Management
                  </p>
                </div>
              )}
            </div>

            {/* Nút đóng trên mobile */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Đóng menu"
              className="flex size-9 items-center justify-center rounded-xl text-sidebar-muted hover:text-white hover:bg-sidebar-accent transition-colors lg:hidden"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Khối chọn dự án */}
          {!isSidebarCollapsed && (
            <div className="w-full">
              <Popover open={openSwitcher} onOpenChange={setOpenSwitcher}>
                <PopoverTrigger asChild>
                  <button
                    role="combobox"
                    aria-expanded={openSwitcher}
                    aria-label="Chọn dự án đang làm việc"
                    className="flex w-full items-center justify-between rounded-xl bg-sidebar-accent/80 p-2.5 text-left transition-colors hover:bg-sidebar-accent outline-none border border-sidebar-border/40 hover:border-sidebar-border cursor-pointer touch-target"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/20 text-sidebar-primary">
                        <Building2 className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold text-sidebar-muted uppercase tracking-wider">
                          Dự án đang mở
                        </p>
                        <p className="truncate text-xs font-bold text-white">
                          {currentProject ? currentProject.name : "Đang tải..."}
                        </p>
                      </div>
                    </div>
                    <ChevronsUpDown className="ml-1 size-3.5 shrink-0 text-sidebar-muted" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[260px] p-0 z-50 rounded-xl shadow-xl border-border bg-card"
                  align="start"
                  side="bottom"
                >
                  <Command>
                    <CommandInput placeholder="Tìm dự án..." />
                    <CommandList className="max-h-56">
                      <CommandEmpty>Không tìm thấy dự án.</CommandEmpty>
                      <CommandGroup heading="Dự án của bạn">
                        {projects.map((project) => (
                          <CommandItem
                            key={project.id}
                            value={project.name}
                            onSelect={() => handleSwitchProject(project.id)}
                            className="flex items-center justify-between cursor-pointer py-2 px-3 text-xs"
                          >
                            <span className="truncate font-medium">{project.name}</span>
                            {currentProjectId.toString() === project.id.toString() && (
                              <Check className="size-3.5 text-primary shrink-0 ml-2" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    <div className="border-t border-border p-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenSwitcher(false);
                          navigate("/projects");
                        }}
                        className="w-full text-center text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors py-1 rounded hover:bg-accent cursor-pointer"
                      >
                        Xem tất cả dự án →
                      </button>
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {/* VÙNG 2: DANH SÁCH MENU (CUỘN ĐỘC LẬP, KHÔNG BỊ TRÀN MẤT TỔNG QUAN) */}
        <div className="flex-1 min-h-0 w-full overflow-y-auto no-scrollbar p-3">
          <nav className="flex flex-col gap-1 w-full" aria-label="Menu chức năng">
            {roleLoading && (
              <p className="px-3 py-2 text-xs text-sidebar-muted" role="status">
                {!isSidebarCollapsed && "Đang tải quyền..."}
              </p>
            )}

            {menuGroups.map((group) => {
              const isGroupCollapsed = Boolean(collapsedGroups[group.key]);
              const hasActiveItem = group.items.some((item) => currentNav?.key === item.key);

              return (
                <div
                  key={group.key}
                  className="flex flex-col w-full"
                  role="group"
                  aria-label={group.label}
                >
                  {!isSidebarCollapsed && (
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(group.key)}
                      aria-expanded={!isGroupCollapsed}
                      className="mt-3 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-muted hover:text-white flex items-center justify-between w-full rounded-lg hover:bg-sidebar-accent/50 transition-colors cursor-pointer group select-none first:mt-1 outline-none"
                      title={isGroupCollapsed ? `Mở rộng ${group.label}` : `Thu gọn ${group.label}`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span>{group.label}</span>
                        {hasActiveItem && (
                          <span className="size-1.5 rounded-full bg-sidebar-primary shrink-0" />
                        )}
                      </span>
                      <ChevronDown
                        className={`size-3.5 text-sidebar-muted/70 group-hover:text-white transition-transform duration-200 shrink-0 ${
                          isGroupCollapsed ? "-rotate-90" : "rotate-0"
                        }`}
                      />
                    </button>
                  )}

                  {/* Vùng danh sách mục con với hiệu ứng Accordion mượt mà */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                      !isSidebarCollapsed && isGroupCollapsed
                        ? "grid-rows-[0fr]"
                        : "grid-rows-[1fr]"
                    }`}
                  >
                    <div className="overflow-hidden flex flex-col gap-1 pt-1">
                      {group.items.map((item) => {
                        const isActive = currentNav?.key === item.key;
                        const Icon = item.icon;

                        return (
                          <button
                            key={item.key}
                            ref={isActive ? activeItemRef : null}
                            title={item.label}
                            type="button"
                            onClick={() => {
                              if (item.implemented === false) {
                                alert(
                                  "Tính năng này sẽ được phát triển trong các Sprint tiếp theo."
                                );
                              } else {
                                navigate(item.path);
                                setIsMobileMenuOpen(false);
                              }
                            }}
                            className={`flex items-center gap-3 rounded-xl py-2.5 text-left text-xs font-semibold transition-all cursor-pointer outline-none touch-target ${
                              isSidebarCollapsed
                                ? "lg:justify-center lg:px-0 lg:py-3"
                                : "px-3"
                            } ${
                              isActive
                                ? "bg-sidebar-primary text-white shadow-sm font-bold"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
                            }`}
                          >
                            <Icon className="size-4.5 shrink-0" />
                            {!isSidebarCollapsed && (
                              <span className="truncate">{item.label}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* VÙNG 3: FOOTER ĐĂNG XUẤT (GHIM CỐ ĐỊNH ĐÁY) */}
        <div
          className={`shrink-0 p-3 border-t border-sidebar-border/30 flex flex-col gap-2 ${
            isSidebarCollapsed ? "lg:items-center lg:px-2" : ""
          }`}
        >
          {/* Nút thu gọn sidebar cho màn hình laptop */}
          <button
            type="button"
            title={isSidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
            onClick={toggleSidebarCollapse}
            className={`hidden lg:flex items-center gap-3 py-2 text-xs text-sidebar-muted hover:text-white hover:bg-sidebar-accent/60 rounded-xl transition-colors cursor-pointer w-full ${
              isSidebarCollapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="size-4.5 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="size-4.5 shrink-0" />
                <span>Thu gọn menu</span>
              </>
            )}
          </button>

          <button
            type="button"
            title="Đăng xuất"
            onClick={handleLogout}
            className={`flex items-center gap-3 py-2 text-xs text-sidebar-foreground/80 hover:text-rose-400 hover:bg-sidebar-accent/60 rounded-xl transition-colors outline-none cursor-pointer w-full touch-target ${
              isSidebarCollapsed ? "lg:justify-center lg:px-0" : "px-3"
            }`}
          >
            <LogOut className="size-4.5 shrink-0" />
            {!isSidebarCollapsed && <span>Đăng xuất</span>}
          </button>
        </div>
      </aside>

      {/* ================= KHUNG NỘI DUNG CHÍNH ================= */}
      <div className="flex min-w-0 flex-1 flex-col h-screen max-h-[100dvh] overflow-hidden">
        {/* TOPBAR CO GIÃN THÔNG MINH */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/95 backdrop-blur-md px-3 py-2.5 sm:px-6 sm:py-3.5 shadow-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Nút hamburger mở drawer trên mobile */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Mở menu điều hướng"
              className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/60 active:bg-accent transition-colors lg:hidden outline-none cursor-pointer touch-target -ml-1"
            >
              <Menu className="size-5 shrink-0" />
            </button>

            {/* Breadcrumb thích ứng */}
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted-foreground min-w-0">
              <span className="hidden sm:inline-block truncate max-w-[140px] md:max-w-[200px]">
                {currentProject ? `Dự án ${currentProject.name}` : "Đang tải..."}
              </span>
              <ChevronRight className="hidden sm:inline-block size-3.5 shrink-0 opacity-60" />
              {currentNav && (
                <span className="truncate font-bold text-foreground text-sm sm:text-base">
                  {currentNav.label}
                </span>
              )}
            </div>
          </div>

          {/* Phía phải Topbar: Ngày giờ thực tế + Đồng bộ + Chuông + Avatar */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
            {/* Đồng hồ ngày giờ thực tế */}
            <p className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <CalendarDays className="size-3.5 shrink-0" />
              <span>{currentDateTime}</span>
            </p>

            {/* Chip trạng thái đồng bộ nhật ký nhỏ gọn */}
            <DiarySyncStatus />

            {/* Chuông thông báo */}
            {menuGroups.some((g) => g.items.some((i) => i.key === "warnings")) && (
              <button
                type="button"
                className="relative flex size-9 sm:size-10 items-center justify-center text-muted-foreground hover:bg-accent/60 rounded-xl transition-colors outline-none cursor-pointer touch-target"
                onClick={() => navigate("/warnings")}
                aria-label="Cảnh báo tiến độ"
              >
                <Bell className="size-4.5" />
                <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-primary-foreground">
                  2
                </span>
              </button>
            )}

            {/* Avatar & Menu người dùng */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                aria-label="Menu tài khoản người dùng"
                className="flex items-center gap-2 outline-none hover:bg-accent/60 p-1 sm:p-1.5 rounded-xl transition-colors cursor-pointer touch-target"
              >
                <div className="flex size-8 sm:size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-xs">
                  {user?.name?.substring(0, 2).toUpperCase() || "HL"}
                </div>
                <div className="hidden lg:block text-left">
                  <p className="text-xs font-bold leading-tight">
                    {user?.name || "Hương Lan"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {roleLoading
                      ? "Đang tải..."
                      : ROLE_LABELS[role] || "Chưa có vai trò"}
                  </p>
                </div>
                <ChevronDown className="hidden sm:block size-3.5 text-muted-foreground" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-border bg-card p-2 shadow-xl z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3 py-2 border-b border-border/50 mb-1">
                    <p className="text-xs font-bold truncate text-foreground">{user?.name || "Hương Lan"}</p>
                    {user?.email && (
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {user?.is_system_admin && (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                          Quản trị hệ thống
                        </span>
                      )}
                      <span className="rounded-md bg-info/10 px-1.5 py-0.5 text-[9px] font-bold text-info">
                        {ROLE_LABELS[role] || "Chưa có vai trò"}
                      </span>
                    </div>
                  </div>

                  {user?.is_system_admin && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        navigate("/admin");
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors text-left outline-none cursor-pointer"
                    >
                      <ShieldCheck className="size-4 text-primary" />
                      Quản trị hệ thống
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      navigate("/system-status");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors text-left outline-none cursor-pointer"
                  >
                    <Activity className="size-4 text-emerald-600" />
                    Giám sát hệ thống
                  </button>

                  <div className="border-t border-border/50 mt-1 pt-1">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-danger hover:bg-danger-soft transition-colors text-left font-semibold outline-none cursor-pointer"
                    >
                      <LogOut className="size-4" /> Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* NỘI DUNG TRANG CHÍNH: CÓ CHỪA CHỖ CHO BOTTOM NAV TRÊN MOBILE */}
        <main className="flex-1 overflow-y-auto bg-background pb-20 lg:pb-0">
          <RouteGuard>
            <Outlet context={{ currentProject, projectRole: role, is_system_admin: Boolean(user?.is_system_admin) }} />
          </RouteGuard>
        </main>
      </div>

      {/* THANH ĐIỀU HƯỚNG ĐÁY DI ĐỘNG (MOBILE BOTTOM NAV) */}
      <MobileBottomNav role={role} onOpenMenu={() => setIsMobileMenuOpen(true)} />
    </div>
  );
}
