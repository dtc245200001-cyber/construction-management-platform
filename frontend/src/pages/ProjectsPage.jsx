import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../lib/api";
import {
  Home,
  MessageSquare,
  Bell,
  ChevronDown,
  ChevronRight,
  LogOut,
  FolderOpen,
  Building2,
  CalendarDays,
  UsersRound,
  LayoutGrid,
  Plus,
  Shield,
  Trash2
} from "lucide-react";

export default function ProjectsPage({ user, setUser }) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Modal Create
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createData, setCreateData] = useState({ name: '', code: '', location: '', start_date: '', sprint_length_weeks: 1 });
  const [createError, setCreateError] = useState('');

  // Modal Edit
  const [editProjectData, setEditProjectData] = useState(null);
  const [editError, setEditError] = useState('');

  const isSystemAdmin = user?.is_system_admin === true;

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/projects');
      setProjects(res.data.projects || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Lỗi tải dự án");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      setUser(null);
      navigate('/login', { replace: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenProject = async (id) => {
    try {
      await api.post(`/projects/${id}/open`);
      // Update global context/localStorage for current project
      localStorage.setItem('currentProjectId', id);
      navigate(`/dashboard`);
    } catch (err) {
      alert("Lỗi khi mở dự án: " + (err.response?.data?.message || err.message));
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError('');
    try {
      const res = await api.post('/projects', createData);
      setShowCreateModal(false);
      setCreateData({ name: '', code: '', location: '', start_date: '', sprint_length_weeks: 1 });
      // Tự động chuyển người dùng vào không gian làm việc của dự án vừa tạo
      handleOpenProject(res.data.project.id);
    } catch (err) {
      setCreateError(err.response?.data?.message || err.message || "Lỗi tạo dự án");
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError('');
    try {
      const res = await api.put(`/projects/${editProjectData.id}`, editProjectData);
      setProjects(projects.map(p => p.id === editProjectData.id ? { ...p, ...res.data.project } : p));
      setEditProjectData(null);
    } catch (error) {
      setEditError(error.response?.data?.message || error.message || 'Lỗi cập nhật dự án');
    }
  };


  const handleDeleteProject = async (e, id, name) => {
    e.stopPropagation(); // Ngăn sự kiện click lan ra card
    if (!window.confirm(`Bạn có chắc chắn muốn xoá dự án "${name}" không? Hành động này không thể hoàn tác!`)) {
      return;
    }
    
    try {
      await api.delete(`/projects/${id}`);
      fetchProjects();
    } catch (err) {
      alert("Lỗi khi xoá dự án: " + (err.response?.data?.message || err.message));
    }
  };

  const statusColors = {
    "Đang thi công": "bg-blue-100 text-blue-700 border border-blue-200 shadow-sm font-semibold",
    "Chuẩn bị": "bg-amber-100 text-amber-700 border border-amber-300 shadow-sm font-semibold",
    "Hoàn thành": "bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm font-semibold",
    "Tạm dừng": "bg-rose-100 text-rose-700 border border-rose-200 shadow-sm font-semibold",
  };

  const formatDate = (d) => {
    if (!d) return '--/--/----';
    const date = new Date(d);
    return date.toLocaleDateString('en-GB');
  };

  return (
    <div className="min-h-screen bg-site-bg text-site-dark font-sans flex flex-col">
      {/* Header */}
      <header className="h-[70px] bg-site-dark px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-site-primary text-white">
            <Building2 className="size-6" />
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-white tracking-wide">CÔNG TRƯỜNG 360</h1>
            <div className="h-5 w-px bg-white/20"></div>
            <span className="text-sm text-white/70 hidden sm:block">Site Operations Platform</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm font-medium">
            <MessageSquare className="size-5" />
            <span className="hidden sm:inline">Chat</span>
          </button>
          <button className="relative text-white/70 hover:text-white transition-colors">
            <Bell className="size-5" />
            <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-site-critical text-[10px] font-bold text-white">
              2
            </span>
          </button>
          <div className="relative">
            <button 
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-2 outline-none hover:bg-white/5 p-1.5 rounded-xl transition-colors cursor-pointer"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-site-primary text-xs font-bold text-white">
                {user?.name?.substring(0,2).toUpperCase() || 'HL'}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-white">{user?.name || 'Hương Lan'}</p>
                <p className="text-xs text-white/60">{user?.role === 'ban_quan_ly' ? 'Ban quản lý' : user?.role === 'chi_huy_truong' ? 'Chỉ huy trưởng' : user?.role === 'doi_truong' ? 'Đội trưởng' : user?.role || 'Ban quản lý'}</p>
              </div>
              <ChevronDown className="size-4 text-white/60" />
            </button>
            {isUserMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-site-border bg-site-surface p-1 shadow-lg z-50">
                {isSystemAdmin && (
                  <button 
                    onClick={() => navigate('/admin')}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-site-dark hover:bg-site-bg transition-colors text-left font-medium mb-1"
                  >
                    <Shield className="size-4 text-site-primary" /> Quản trị hệ thống
                  </button>
                )}
                <button 
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-site-critical hover:bg-site-critical/10 transition-colors text-left font-medium"
                >
                  <LogOut className="size-4" /> Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="border-b border-site-border bg-site-surface px-6 py-3 flex items-center gap-2 text-sm text-site-baseline">
        <Link 
          to="/" 
          aria-label="Về trang chủ"
          className="cursor-pointer hover:text-site-dark transition-colors outline-none focus-visible:ring-2 focus-visible:ring-site-primary rounded"
        >
          <Home className="size-4" />
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-semibold text-site-dark" aria-current="page">Chọn dự án</span>
      </nav>

      {/* Main content */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-4 mb-8">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-site-primary/10 text-site-primary">
            <FolderOpen className="size-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#0A192F]">Chọn công trình</h2>
            <p className="text-sm text-site-baseline mt-0.5">Chỉ hiện dự án bạn tham gia.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="animate-pulse bg-site-surface rounded-2xl border border-site-border h-[220px]"></div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-site-critical mb-4">{error}</p>
            <button onClick={fetchProjects} className="px-4 py-2 bg-site-primary text-white rounded-lg">Thử lại</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((proj, idx) => {
              const actual = proj.actual_progress || 0;
              const planned = proj.planned_progress || 0;
              const diff = actual - planned;
              const isDiffNeg = diff < 0;

              return (
                <article 
                  key={proj.id} 
                  tabIndex={0}
                  onClick={() => handleOpenProject(proj.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleOpenProject(proj.id)}
                  className={`bg-site-surface rounded-2xl border ${idx === 0 ? 'border-site-primary' : 'border-site-border'} p-5 shadow-sm hover:shadow-md transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-site-primary`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-site-primary/10 text-site-primary">
                        <Building2 className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-site-dark truncate">{proj.name}</h3>
                        <p className="text-xs text-site-baseline truncate">{proj.code || 'No code'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[proj.status] || statusColors["Chuẩn bị"]}`}>
                        <span className="size-1.5 rounded-full bg-current"></span>
                        {proj.status || 'Chuẩn bị'}
                      </span>
                      {isSystemAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditProjectData(proj); }}
                            className="p-1.5 text-site-baseline hover:text-site-primary hover:bg-site-primary/10 rounded-lg transition-colors"
                            title="Sửa dự án"
                          >
                            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleDeleteProject(e, proj.id, proj.name)}
                            className="p-1.5 text-site-baseline hover:text-site-critical hover:bg-site-critical/10 rounded-lg transition-colors"
                            title="Xoá dự án"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 my-5 py-4 border-y border-site-border/60">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-site-baseline mb-1">
                        <CalendarDays className="size-3.5" /> Bắt đầu
                      </div>
                      <p className="text-sm font-semibold">{formatDate(proj.start_date)}</p>
                    </div>
                    <div className="border-l border-site-border/60 pl-3">
                      <div className="flex items-center gap-1.5 text-xs text-site-baseline mb-1">
                        <UsersRound className="size-3.5" /> Nhân sự
                      </div>
                      <p className="text-sm font-semibold">{proj.member_count || 1} người</p>
                    </div>
                    <div className="border-l border-site-border/60 pl-3">
                      <div className="flex items-center gap-1.5 text-xs text-site-baseline mb-1">
                        <LayoutGrid className="size-3.5" /> Sprint
                      </div>
                      <p className="text-sm font-semibold">{proj.sprint_length_weeks || 1} tuần</p>
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-site-dark">Tiến độ thực tế</span>
                        <span className="text-xs font-bold text-site-dark">{actual}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-site-border overflow-hidden">
                        <div className="h-full bg-site-primary rounded-full" style={{ width: `${Math.min(actual, 100)}%` }}></div>
                      </div>
                      <div className="mt-2 text-xs text-site-baseline flex gap-2">
                        <span>Kế hoạch {planned}%</span>
                        {diff !== 0 && (
                          <span className={isDiffNeg ? "text-site-critical font-medium" : "text-site-success font-medium"}>
                            {isDiffNeg ? '' : '+'}{diff}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-site-primary text-white shadow-sm hover:bg-site-primary/90 transition-colors group-hover:scale-110">
                      <ChevronRight className="size-4" />
                    </div>
                  </div>
                </article>
              );
            })}

            {isSystemAdmin && (
              <button 
                onClick={() => setShowCreateModal(true)}
                className="bg-site-bg rounded-2xl border-2 border-dashed border-site-border hover:border-site-primary/50 hover:bg-site-primary/5 transition-colors p-5 flex flex-col items-center justify-center min-h-[240px] gap-3 group outline-none focus-visible:ring-2 focus-visible:ring-site-primary"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-site-primary/10 text-site-primary group-hover:scale-110 transition-transform">
                  <Plus className="size-6" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-site-primary">+ Tạo dự án mới</p>
                  <p className="text-xs text-site-baseline mt-1">Thêm dự án mới vào hệ thống</p>
                </div>
              </button>
            )}

            {projects.length === 0 && !isSystemAdmin && (
              <div className="col-span-full text-center py-12">
                <p className="text-site-baseline">Bạn chưa tham gia dự án nào, hãy liên hệ Quản trị viên để được mời.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Create */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-site-dark/50 p-4">
          <form onSubmit={handleCreateSubmit} className="bg-site-surface rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-site-border flex items-center justify-between">
              <h3 className="text-lg font-bold">Tạo dự án mới</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-site-baseline hover:text-site-dark">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {createError && <div className="p-3 bg-site-critical/10 text-site-critical rounded-lg text-sm">{createError}</div>}
              <div>
                <label className="block text-sm font-medium mb-1.5">Tên dự án *</label>
                <input required type="text" value={createData.name} onChange={e => setCreateData({...createData, name: e.target.value})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" placeholder="Tên dự án" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Mã dự án *</label>
                <input required type="text" value={createData.code} onChange={e => setCreateData({...createData, code: e.target.value})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" placeholder="VD: APC-2026-01" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Địa điểm</label>
                <input type="text" value={createData.location} onChange={e => setCreateData({...createData, location: e.target.value})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" placeholder="Địa điểm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Ngày khởi công *</label>
                  <input required type="date" value={createData.start_date} onChange={e => setCreateData({...createData, start_date: e.target.value})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Sprint (tuần)</label>
                  <input type="number" min="1" value={createData.sprint_length_weeks} onChange={e => setCreateData({...createData, sprint_length_weeks: parseInt(e.target.value)})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-site-bg border-t border-site-border flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-site-border/50 transition-colors">Hủy</button>
              <button type="submit" className="px-4 py-2 text-sm font-medium bg-site-primary text-white rounded-lg hover:bg-site-primary/90 transition-colors">Tạo dự án</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Edit */}
      {editProjectData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-site-dark/50 p-4">
          <form onSubmit={handleEditSubmit} className="bg-site-surface rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-site-border flex items-center justify-between">
              <h3 className="text-lg font-bold">Chỉnh sửa dự án</h3>
              <button type="button" onClick={() => setEditProjectData(null)} className="text-site-baseline hover:text-site-dark">✕</button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {editError && <div className="p-3 bg-site-critical/10 text-site-critical rounded-lg text-sm">{editError}</div>}
              <div>
                <label className="block text-sm font-medium mb-1.5">Tên dự án *</label>
                <input required type="text" value={editProjectData.name} onChange={e => setEditProjectData({...editProjectData, name: e.target.value})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" placeholder="Tên dự án" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Mã dự án *</label>
                <input required type="text" value={editProjectData.code} onChange={e => setEditProjectData({...editProjectData, code: e.target.value})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" placeholder="VD: APC-2026-01" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Địa điểm</label>
                <input type="text" value={editProjectData.location || ''} onChange={e => setEditProjectData({...editProjectData, location: e.target.value})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" placeholder="Địa điểm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Trạng thái</label>
                  <select value={editProjectData.status || 'Chuẩn bị'} onChange={e => setEditProjectData({...editProjectData, status: e.target.value})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary bg-white">
                    <option value="Chuẩn bị">Chuẩn bị</option>
                    <option value="Đang thi công">Đang thi công</option>
                    <option value="Hoàn thành">Hoàn thành</option>
                    <option value="Tạm dừng">Tạm dừng</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Sprint (tuần)</label>
                  <input type="number" min="1" value={editProjectData.sprint_length_weeks} onChange={e => setEditProjectData({...editProjectData, sprint_length_weeks: parseInt(e.target.value)})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Ngày khởi công</label>
                <input type="date" value={editProjectData.start_date ? editProjectData.start_date.split('T')[0] : ''} onChange={e => setEditProjectData({...editProjectData, start_date: e.target.value})} className="w-full rounded-lg border border-site-border px-3 py-2 text-sm outline-none focus:border-site-primary" />
              </div>
            </div>
            <div className="px-6 py-4 bg-site-bg border-t border-site-border flex items-center justify-end gap-3">
              <button type="button" onClick={() => setEditProjectData(null)} className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-site-border/50 transition-colors">Hủy</button>
              <button type="submit" className="px-4 py-2 text-sm font-medium bg-site-primary text-white rounded-lg hover:bg-site-primary/90 transition-colors">Lưu thay đổi</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
