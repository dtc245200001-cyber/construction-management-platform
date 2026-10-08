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
  Calendar,
  Building2,
  ShieldCheck,
  Pencil,
  Menu,
  Check,
  ChevronsUpDown
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "../components/ui/command";

const navItems = [
  { label: "Tổng quan", icon: Home, path: "/dashboard" },
  { label: "Cơ cấu công việc (WBS)", icon: Network, path: "/wbs" },
  { label: "Bảng đường găng (CPM)", icon: TrendingUp, path: "/schedule" },
  { label: "Tiến độ thi công", icon: CalendarDays, path: "/gantt" },
  { label: "Cảnh báo tiến độ", icon: Bell, path: "/warnings" },
  { label: "Lịch & Ngày nghỉ", icon: Calendar, path: "/calendar" },
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
  const [projects, setProjects] = useState([]);
  const [openSwitcher, setOpenSwitcher] = useState(false);

  React.useEffect(() => {
    // Fetch all projects for the switcher
    api.get('/projects').then(res => setProjects(res.data.projects || [])).catch(console.error);

    if (currentProjectId) {
      api.get(`/projects/${currentProjectId}`)
        .then(res => setCurrentProject(res.data.project))
        .catch(err => console.error(err));
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
      localStorage.setItem('currentProjectId', id);
      setOpenSwitcher(false);
      window.location.reload();
    } catch (err) {
      alert("Không thể chuyển dự án: " + (err.response?.data?.message || err.message));
    }
  };

  const currentNav = navItems.find(item => item.path === location.pathname) || navItems[0];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 flex-col bg-sidebar py-6 text-sidebar-foreground transition-all duration-300 h-screen overflow-hidden lg:static lg:flex shrink-0
          ${isMobileMenuOpen ? 'translate-x-0 w-[280px] px-5 flex' : '-translate-x-full lg:translate-x-0'}
          ${isSidebarCollapsed ? 'lg:w-[80px] lg:items-center lg:px-2' : 'lg:w-[280px] lg:px-5'}
          ${!isMobileMenuOpen ? 'hidden lg:flex' : ''}
        `}
      >
        <div className={`flex items-center gap-3 w-full shrink-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
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
          <div className="mt-6 w-full rounded-xl">
            <Popover open={openSwitcher} onOpenChange={setOpenSwitcher}>
              <PopoverTrigger asChild>
                <button
                  role="combobox"
                  aria-expanded={openSwitcher}
                  className="flex w-full items-center justify-between rounded-xl bg-sidebar-accent p-3 text-left transition-colors hover:bg-sidebar-accent/80 outline-none border border-transparent hover:border-sidebar-border"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/10 text-sidebar-primary">
                      <Building2 className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-sidebar-muted uppercase tracking-wider mb-0.5">Dự án đang làm việc</p>
                      <p className="truncate text-sm font-bold text-sidebar-foreground">
                        {currentProject ? currentProject.name : 'Đang tải...'}
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
                      onClick={() => { setOpenSwitcher(false); navigate('/projects'); }}
                      className="w-full text-center text-xs font-medium text-muted-foreground hover:text-primary transition-colors py-1.5 rounded hover:bg-accent"
                    >
                      Xem tất cả dự án →
                    </button>
                  </div>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="mt-6 flex-1 w-full" style={{ overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <nav className="flex flex-col gap-1 w-full">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.label}
                  title={item.label}
                  onClick={() => {
                    if (item.path === '/dashboard' || item.path === '/wbs' || item.path === '/members' || item.path === '/schedule' || item.path === '/gantt' || item.path === '/warnings' || item.path === '/calendar') {
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
        </div>



        <button 
          title="Đăng xuất"
          onClick={handleLogout} 
          className={`mt-5 shrink-0 flex items-center gap-3 py-2 text-sm text-sidebar-foreground/85 hover:text-red-500 outline-none cursor-pointer relative z-10 pointer-events-auto w-full ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'}`}
        >
          <Settings className="size-5 shrink-0" /> 
          {!isSidebarCollapsed && "Đăng xuất"}
        </button>
      </aside>

      {/* Main Container */}
      <div className="flex min-w-0 flex-1 flex-col h-screen overflow-hidden">
        {/* Topbar */}
        <header className="sticky top-0 z-50 flex flex-wrap items-center gap-4 border-b border-border bg-card px-6 py-4">
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

          <button 
            className="relative text-muted-foreground outline-none cursor-pointer hover:bg-accent/50 p-2 rounded-xl transition-colors"
            onClick={() => navigate('/warnings')}
          >
            <Bell className="size-5" />
            <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-primary-foreground">
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
        <main className="flex-1 overflow-y-auto bg-background">
          <Outlet context={{ currentProject }} />
        </main>
      </div>
    </div>
  );
}
