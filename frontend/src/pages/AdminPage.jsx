import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { Home, Shield, Lock, Unlock, KeyRound, Search, ChevronRight, Activity } from "lucide-react";

export default function AdminPage({ user }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'logs', or 'projects'
  
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user || !user.is_system_admin) {
      navigate('/projects', { replace: true });
      return;
    }
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'logs') {
      fetchLogs();
    } else {
      fetchProjects();
    }
  }, [user, navigate, activeTab]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/users');
      setUsers(res.data.users || []);
    } catch (err) {
      setError(err.response?.data?.message || "Lỗi khi lấy danh sách người dùng");
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/audit-logs');
      setLogs(res.data.logs || []);
    } catch (err) {
      setError(err.response?.data?.message || "Lỗi khi lấy nhật ký hệ thống");
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/projects');
      setProjects(res.data.projects || []);
    } catch (err) {
      setError(err.response?.data?.message || "Lỗi khi lấy danh sách dự án");
    } finally {
      setLoading(false);
    }
  };

  const handleLockUser = async (userId, isLocked) => {
    if (!window.confirm(`Bạn có chắc muốn ${isLocked ? 'mở khóa' : 'khóa'} tài khoản này?`)) return;
    try {
      await api.post(`/admin/users/${userId}/${isLocked ? 'unlock' : 'lock'}`);
      alert(`${isLocked ? 'Mở khóa' : 'Khóa'} tài khoản thành công!`);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || "Lỗi thao tác");
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = window.prompt("Nhập mật khẩu mới cho tài khoản này (ít nhất 8 ký tự):");
    if (!newPassword) return;
    if (newPassword.length < 8) {
      alert("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    try {
      await api.post(`/admin/users/${userId}/reset-password`, { newPassword });
      alert("Đặt lại mật khẩu thành công!");
    } catch (err) {
      alert(err.response?.data?.message || "Lỗi thao tác");
    }
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();
    const email = window.prompt("Nhập email để gửi thư mời:");
    if (!email) return;
    try {
      await api.post('/admin/invite', { email });
      alert(`Đã tạo thư mời thành công cho ${email}!`);
      fetchUsers(); 
    } catch (err) {
      alert(err.response?.data?.message || "Lỗi tạo thư mời");
    }
  };

  const handleCreateProject = async () => {
    const name = window.prompt("Nhập tên dự án mới:");
    if (!name) return;
    const code = window.prompt("Nhập mã dự án:");
    if (!code) return;
    const pm_email = window.prompt("Nhập email của người quản lý (PM):");
    if (!pm_email) return;

    try {
      await api.post('/admin/projects', { name, code, pm_email });
      alert("Đã tạo dự án và cấp quyền PM thành công!");
      fetchProjects();
    } catch (err) {
      alert(err.response?.data?.message || "Lỗi tạo dự án");
    }
  };

  const handleAssignPM = async (projectId) => {
    const pm_email = window.prompt("Nhập email của người quản lý (PM) mới. (Lưu ý: Bạn chỉ nên dùng chức năng này nếu PM cũ nghỉ việc hoặc dự án mất quyền quản lý):");
    if (!pm_email) return;

    try {
      await api.post(`/admin/projects/${projectId}/assign-pm`, { pm_email });
      alert("Đã gán PM mới thành công!");
      fetchProjects();
    } catch (err) {
      alert(err.response?.data?.message || "Lỗi gán PM");
    }
  };

  const isLocked = (lockedUntil) => {
    return lockedUntil && new Date(lockedUntil) > new Date();
  };

  if (!user || !user.is_system_admin) return null;

  return (
    <div className="min-h-screen bg-site-bg text-site-dark flex flex-col font-sans">
      <header className="h-[70px] bg-site-dark px-6 flex items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-site-critical text-white">
            <Shield className="size-6" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-wide">SYSTEM ADMIN</h1>
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm font-medium text-white/70">
          <button onClick={() => navigate('/projects')} className="hover:text-white transition-colors flex items-center gap-1.5">
            <Home className="size-4" /> Về trang chủ
          </button>
        </div>
      </header>

      <div className="border-b border-site-border bg-site-surface px-6 py-3 flex items-center gap-2 text-sm text-site-baseline">
        <Shield className="size-4 text-site-critical" />
        <span className="font-semibold text-site-dark">Quản trị hệ thống</span>
      </div>

      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#0A192F] mb-1">Quản lý hệ thống</h2>
            <p className="text-sm text-site-baseline">Xem danh sách người dùng, dự án và nhật ký hoạt động.</p>
          </div>
          {activeTab === 'users' && (
            <button onClick={handleInviteUser} className="px-4 py-2 bg-site-primary text-white text-sm font-medium rounded-lg hover:bg-site-primary/90 transition-colors shadow-sm whitespace-nowrap">
              + Mời thành viên mới
            </button>
          )}
          {activeTab === 'projects' && (
            <button onClick={handleCreateProject} className="px-4 py-2 bg-site-primary text-white text-sm font-medium rounded-lg hover:bg-site-primary/90 transition-colors shadow-sm whitespace-nowrap">
              + Khởi tạo dự án
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 border-b border-site-border mb-6">
          <button 
            onClick={() => setActiveTab('users')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'users' ? 'border-site-primary text-site-primary' : 'border-transparent text-site-baseline hover:text-site-dark'}`}
          >
            Người dùng
          </button>
          <button 
            onClick={() => setActiveTab('projects')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'projects' ? 'border-site-primary text-site-primary' : 'border-transparent text-site-baseline hover:text-site-dark'}`}
          >
            Tất cả dự án
          </button>
          <button 
            onClick={() => setActiveTab('logs')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'logs' ? 'border-site-primary text-site-primary' : 'border-transparent text-site-baseline hover:text-site-dark'}`}
          >
            Nhật ký hệ thống
          </button>
        </div>

        {error && <div className="mb-6 p-4 bg-site-critical/10 text-site-critical rounded-xl">{error}</div>}

        <div className="bg-site-surface rounded-2xl border border-site-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {activeTab === 'users' ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-site-bg border-b border-site-border text-site-baseline">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Người dùng</th>
                    <th className="px-6 py-4 font-semibold">Tình trạng</th>
                    <th className="px-6 py-4 font-semibold">Admin</th>
                    <th className="px-6 py-4 font-semibold">Ngày tham gia</th>
                    <th className="px-6 py-4 font-semibold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-site-border">
                  {loading ? (
                    <tr><td colSpan="5" className="px-6 py-8 text-center text-site-baseline">Đang tải...</td></tr>
                  ) : users.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-8 text-center text-site-baseline">Chưa có dữ liệu</td></tr>
                  ) : (
                    users.map(u => {
                      const locked = isLocked(u.locked_until);
                      return (
                        <tr key={u.id} className="hover:bg-site-bg/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-site-dark">{u.name}</p>
                            <p className="text-xs text-site-baseline mt-0.5">{u.email}</p>
                          </td>
                          <td className="px-6 py-4">
                            {locked ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-critical/10 text-site-critical">
                                <span className="size-1.5 rounded-full bg-current"></span> Đang bị khóa
                              </span>
                            ) : !u.is_verified ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-alert/10 text-site-alert">
                                <span className="size-1.5 rounded-full bg-current"></span> Chưa xác thực
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-success/10 text-site-success">
                                <span className="size-1.5 rounded-full bg-current"></span> Hoạt động
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {u.is_system_admin ? (
                              <span className="inline-flex items-center gap-1 bg-site-primary/10 text-site-primary px-2 py-0.5 rounded text-xs font-bold">
                                <Shield className="size-3" /> YES
                              </span>
                            ) : (
                              <span className="text-site-baseline">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-site-baseline">
                            {new Date(u.created_at).toLocaleDateString('en-GB')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleResetPassword(u.id)}
                                className="p-1.5 rounded-lg text-site-baseline hover:bg-site-border hover:text-site-dark transition-colors"
                                title="Reset mật khẩu"
                              >
                                <KeyRound className="size-4" />
                              </button>
                              {!u.is_system_admin && (
                                <button
                                  onClick={() => handleLockUser(u.id, locked)}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    locked 
                                      ? 'text-site-success hover:bg-site-success/10' 
                                      : 'text-site-critical hover:bg-site-critical/10'
                                  }`}
                                  title={locked ? "Mở khóa" : "Khóa tài khoản"}
                                >
                                  {locked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : activeTab === 'projects' ? (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-site-bg border-b border-site-border text-site-baseline">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Mã dự án</th>
                    <th className="px-6 py-4 font-semibold">Tên dự án</th>
                    <th className="px-6 py-4 font-semibold">Ban quản lý (PM)</th>
                    <th className="px-6 py-4 font-semibold">Trạng thái</th>
                    <th className="px-6 py-4 font-semibold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-site-border">
                  {loading ? (
                    <tr><td colSpan="5" className="px-6 py-8 text-center text-site-baseline">Đang tải...</td></tr>
                  ) : projects.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-8 text-center text-site-baseline">Chưa có dự án nào</td></tr>
                  ) : (
                    projects.map(p => (
                      <tr key={p.id} className="hover:bg-site-bg/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-site-primary">{p.code}</td>
                        <td className="px-6 py-4 text-site-dark font-medium">{p.name}</td>
                        <td className="px-6 py-4 text-site-baseline">
                          {p.pm_email || <span className="text-site-critical text-xs">Chưa có PM</span>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-success/10 text-site-success">
                            <span className="size-1.5 rounded-full bg-current"></span> {p.status || 'Đang thực hiện'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleAssignPM(p.id)}
                            className="text-xs font-medium px-2 py-1 bg-site-alert/10 text-site-alert hover:bg-site-alert hover:text-white transition-colors rounded"
                          >
                            Gán lại PM
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-site-bg border-b border-site-border text-site-baseline">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Thời gian</th>
                    <th className="px-6 py-4 font-semibold">Hành động</th>
                    <th className="px-6 py-4 font-semibold">Người thực hiện</th>
                    <th className="px-6 py-4 font-semibold">IP</th>
                    <th className="px-6 py-4 font-semibold">Đối tượng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-site-border">
                  {loading ? (
                    <tr><td colSpan="5" className="px-6 py-8 text-center text-site-baseline">Đang tải...</td></tr>
                  ) : logs.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-8 text-center text-site-baseline">Chưa có nhật ký</td></tr>
                  ) : (
                    logs.map(log => (
                      <tr key={log.id} className="hover:bg-site-bg/50 transition-colors">
                        <td className="px-6 py-4 text-site-baseline">
                          {new Date(log.created_at).toLocaleString('en-GB')}
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-semibold text-site-primary bg-site-primary/10 px-2 py-0.5 rounded text-xs">{log.action}</span>
                        </td>
                        <td className="px-6 py-4 text-site-dark font-medium">
                          {log.user_email || 'System / Khách'}
                        </td>
                        <td className="px-6 py-4 text-site-baseline text-xs">
                          {log.ip_address}
                        </td>
                        <td className="px-6 py-4 text-site-baseline">
                          {log.entity ? `${log.entity} (#${log.entity_id || 'N/A'})` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
