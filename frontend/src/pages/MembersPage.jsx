import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { Users, Mail, Shield, Plus, X, Search, LockOpen, Lock } from "lucide-react";

const roleLabels = {
  chu_dau_tu: "Chủ đầu tư",
  ban_quan_ly: "Ban quản lý",
  ky_su_giam_sat: "Kỹ sư giám sát",
  chi_huy_truong: "Chỉ huy trưởng",
  doi_truong: "Đội trưởng thi công",
  ke_toan: "Kế toán"
};

export default function MembersPage({ user }) {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState({ email: "", role: "doi_truong" });
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  const currentProjectId = localStorage.getItem("currentProjectId");
  const canInvite = user?.role === "ban_quan_ly" || user?.role === "chu_dau_tu";

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/projects/${currentProjectId}/members`);
      setMembers(res.data.members || []);
      setInvitations(res.data.invitations || []);
    } catch (err) {
      setError(err.response?.data?.message || "Không thể tải danh sách thành viên");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentProjectId) {
      fetchMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");
    try {
      await api.post(`/projects/${currentProjectId}/members`, inviteData);
      setInviteSuccess("Đã mời thành viên thành công!");
      setInviteData({ email: "", role: "doi_truong" });
      fetchMembers();
      setTimeout(() => setShowInviteModal(false), 1500);
    } catch (err) {
      setInviteError(err.response?.data?.message || "Lỗi khi mời thành viên");
    }
  };

  const handleUnlock = async (memberId) => {
    try {
      await api.post(`/projects/${currentProjectId}/members/${memberId}/unlock`);
      fetchMembers();
    } catch (err) {
      alert(err.response?.data?.message || "Lỗi khi mở khóa tài khoản");
    }
  };

  const isLocked = (member) => member.locked_until && new Date(member.locked_until) > new Date();
  const hasFailedAttempts = (member) => Number(member.failed_login_attempts || 0) > 0;

  return (
    <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-site-dark flex items-center gap-2">
            <Users className="size-6 text-site-primary" />
            Thành viên & Tổ đội
          </h2>
          <p className="text-sm text-site-baseline mt-1">
            Quản lý những người tham gia và cấp quyền trong dự án này.
          </p>
        </div>
        
        {canInvite && (
          <button 
            onClick={() => { setShowInviteModal(true); setInviteSuccess(""); setInviteError(""); }}
            className="flex items-center gap-2 bg-site-primary text-white px-4 py-2 rounded-lg font-medium hover:bg-site-primary/90 transition-colors shadow-sm"
          >
            <Plus className="size-4" /> Mời thành viên
          </button>
        )}
      </div>

      {loading ? (
        <div className="animate-pulse bg-site-surface rounded-2xl border border-site-border h-[400px]"></div>
      ) : error ? (
        <div className="bg-site-critical/10 text-site-critical p-4 rounded-xl text-center font-medium">
          {error}
        </div>
      ) : (
        <div className="bg-site-surface rounded-2xl border border-site-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-site-border flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-site-baseline" />
              <input 
                type="text" 
                placeholder="Tìm kiếm theo tên hoặc email..." 
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-site-border bg-site-bg text-sm outline-none focus:border-site-primary transition-colors"
              />
            </div>
            <div className="text-sm font-medium text-site-baseline px-4 border-l border-site-border">
              Tổng cộng: <span className="text-site-dark">{members.length + invitations.length}</span> người
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-site-bg/50 border-b border-site-border text-site-baseline font-semibold">
                <tr>
                  <th className="px-6 py-4">Thành viên</th>
                  <th className="px-6 py-4">Vai trò</th>
                  <th className="px-6 py-4 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-site-border">
                {members.map((member) => {
                  const locked = isLocked(member);
                  return (
                    <tr key={member.id} className={`hover:bg-site-bg/30 transition-colors ${locked ? 'bg-site-critical/5' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex size-9 shrink-0 items-center justify-center rounded-full font-bold ${locked ? 'bg-site-critical/10 text-site-critical' : 'bg-site-primary/10 text-site-primary'}`}>
                            {locked ? <Lock className="size-4" /> : member.name.substring(0,2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-site-dark">{member.name}</p>
                            <p className="text-xs text-site-baseline flex items-center gap-1 mt-0.5">
                              <Mail className="size-3" /> {member.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-medium text-site-dark">
                          <Shield className="size-4 text-site-baseline" /> 
                          {roleLabels[member.role] || member.role}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {locked ? (
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-critical/10 text-site-critical">
                              <Lock className="size-3" /> Đang bị khóa
                            </span>
                            {canInvite && (
                              <button
                                onClick={() => handleUnlock(member.id)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-primary/10 text-site-primary hover:bg-site-primary hover:text-white transition-colors"
                              >
                                <LockOpen className="size-3" /> Mở khóa
                              </button>
                            )}
                          </div>
                        ) : hasFailedAttempts(member) ? (
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              <span className="size-1.5 rounded-full bg-current"></span>
                              Sai {member.failed_login_attempts}/5 lần
                            </span>
                            {canInvite && (
                              <button
                                onClick={() => handleUnlock(member.id)}
                                title="Reset số lần nhập sai về 0"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-baseline/10 text-site-baseline hover:bg-site-primary hover:text-white transition-colors"
                              >
                                <LockOpen className="size-3" /> Reset
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-success/10 text-site-success">
                            <span className="size-1.5 rounded-full bg-current"></span>
                            Đã tham gia
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {invitations.map((inv) => (
                  <tr key={`inv-${inv.id}`} className="hover:bg-site-bg/30 transition-colors opacity-75 border-l-4 border-site-alert">
                    <td className="px-6 py-4 pl-5">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full font-bold bg-site-alert/10 text-site-alert">
                          <Mail className="size-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-site-dark italic">Chưa đăng ký</p>
                          <p className="text-xs text-site-baseline flex items-center gap-1 mt-0.5">
                            <Mail className="size-3" /> {inv.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-medium text-site-dark">
                        <Shield className="size-4 text-site-baseline" /> 
                        {roleLabels[inv.role] || inv.role}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-site-alert/10 text-site-alert">
                        <span className="size-1.5 rounded-full bg-current"></span>
                        Đã gửi thư mời
                      </span>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && invitations.length === 0 && (
                  <tr>
                    <td colSpan="3" className="px-6 py-12 text-center text-site-baseline">
                      Chưa có thành viên nào trong dự án này.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-site-dark/50 p-4">
          <form onSubmit={handleInvite} className="bg-site-surface rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-site-border flex items-center justify-between">
              <h3 className="text-lg font-bold">Mời thành viên mới</h3>
              <button type="button" onClick={() => setShowInviteModal(false)} className="text-site-baseline hover:text-site-dark transition-colors">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {inviteError && <div className="p-3 bg-site-critical/10 text-site-critical rounded-lg text-sm">{inviteError}</div>}
              {inviteSuccess && <div className="p-3 bg-site-success/10 text-site-success rounded-lg text-sm">{inviteSuccess}</div>}
              
              <div>
                <label className="block text-sm font-medium mb-1.5 text-site-dark">Email người dùng *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-site-baseline" />
                  <input 
                    required 
                    type="email" 
                    value={inviteData.email} 
                    onChange={e => setInviteData({...inviteData, email: e.target.value})} 
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-site-border bg-site-bg text-sm outline-none focus:border-site-primary" 
                    placeholder="VD: nv.a@cong-truong-360.vn" 
                  />
                </div>
                <p className="text-xs text-site-baseline mt-1.5">Nếu người dùng chưa có tài khoản, hệ thống sẽ gửi một đường dẫn đăng ký kèm thư mời.</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1.5 text-site-dark">Phân quyền (Vai trò) *</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-site-baseline" />
                  <select 
                    value={inviteData.role} 
                    onChange={e => setInviteData({...inviteData, role: e.target.value})} 
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-site-border bg-site-bg text-sm outline-none focus:border-site-primary appearance-none cursor-pointer"
                  >
                    <option value="ban_quan_ly">Ban quản lý (Toàn quyền dự án)</option>
                    <option value="ky_su_giam_sat">Kỹ sư giám sát</option>
                    <option value="chi_huy_truong">Chỉ huy trưởng</option>
                    <option value="doi_truong">Đội trưởng thi công</option>
                    <option value="ke_toan">Kế toán dự án</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-site-bg/50 border-t border-site-border flex items-center justify-end gap-3">
              <button type="button" onClick={() => setShowInviteModal(false)} className="px-4 py-2 text-sm font-medium text-site-dark rounded-lg hover:bg-site-border/50 transition-colors">Hủy</button>
              <button type="submit" className="px-4 py-2 text-sm font-medium bg-site-primary text-white rounded-lg hover:bg-site-primary/90 transition-colors shadow-sm">Gửi lời mời</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
