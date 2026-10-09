import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../lib/api';
import { format, parseISO } from 'date-fns';

import { FileText, Search, Plus, Filter, X, Clock, User, Hash, Lock, Unlock, History, AlertCircle } from 'lucide-react';
import DiaryEntryForm from '../components/DiaryEntryForm';
import DiaryWeekStrip from '../components/DiaryWeekStrip';
import DiaryDayCard from '../components/DiaryDayCard';

const ALLOWED_ROLES = ['ky_su_giam_sat', 'chi_huy_truong', 'ban_quan_ly', 'doi_truong', 'system_admin'];


export default function DiaryPage({ user }) {
  const location = useLocation();
  const projectId = localStorage.getItem('currentProjectId') || 13;

  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const todayVN = format(new Date(), 'yyyy-MM-dd');
  const [dateFilter, setDateFilter] = useState(todayVN);
  const [workItemFilter, setWorkItemFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(location.state?.openForm || false);

  // Lock status and history
  const [lockInfo, setLockInfo] = useState({ is_locked: false });
  const [lockHistory, setLockHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [projectRole, setProjectRole] = useState(null);

  const canLock = user && (user.is_system_admin || projectRole === 'ky_su_giam_sat');
  const canUnlock = user && (user.is_system_admin || projectRole === 'ban_quan_ly');
  const isPastDate = dateFilter && dateFilter < todayVN;
  useEffect(() => {
    if (location.state?.openForm) {
      setShowForm(true);
    }
  }, [location.state]);

  useEffect(() => {
    // Fetch project to get membership role
    api.get(`/projects/${projectId}`)
      .then(res => setProjectRole(res.data?.membership))
      .catch(console.error);

    // Fetch categories for filter
    api.get(`/categories/${projectId}/tree/all`)
      .then(res => setCategories(res.data || []))
      .catch(console.error);
  }, [projectId]);

  const fetchEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.append('date', dateFilter);
      if (workItemFilter) params.append('work_item_id', workItemFilter);
      params.append('limit', 50);

      const res = await api.get(`/projects/${projectId}/diary-entries?${params.toString()}`);
      setEntries(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Lỗi khi tải danh sách nhật ký');
    } finally {
      setLoading(false);
    }
  };

  const fetchLockStatus = async () => {
    if (!dateFilter) return;
    try {
      const res = await api.get(`/projects/${projectId}/diary-locks/${dateFilter}`);
      setLockInfo(res.data || { is_locked: false });
    } catch (err) {
      console.error("Lỗi lấy trạng thái khóa:", err);
    }
  };

  const fetchLockHistory = async () => {
    if (!dateFilter) return;
    try {
      const res = await api.get(`/projects/${projectId}/diary-locks/${dateFilter}/history`);
      setLockHistory(res.data || []);
    } catch (err) {
      console.error("Lỗi lấy lịch sử khóa:", err);
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchLockStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, dateFilter, workItemFilter]);

  const clearFilters = () => {
    setDateFilter('');
    setWorkItemFilter('');
  };

  const handleSuccess = (newEntry) => {
    setShowForm(false);
    
    // Check if new entry matches current filters
    let matchesDate = true;
    if (dateFilter) {
      // Both are 'yyyy-MM-dd' strings according to API
      matchesDate = newEntry.entry_date === dateFilter;
    }
    
    let matchesWorkItem = true;
    if (workItemFilter) {
      matchesWorkItem = newEntry.work_item_id.toString() === workItemFilter.toString();
    }

    if (matchesDate && matchesWorkItem) {
      setEntries(prev => [newEntry, ...prev]);
      setTotal(prev => prev + 1);
    } else {
      alert("Đã lưu (không nằm trong bộ lọc hiện tại)");
    }
  };

  const handleLock = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn CHỐT SỔ nhật ký ngày ${dateFilter}?\nSau khi chốt, không ai có thể thêm/sửa/xóa nhật ký của ngày này.`)) return;
    setActionLoading(true);
    try {
      const res = await api.post(`/projects/${projectId}/diary-locks/${dateFilter}/lock`);
      setLockInfo(res.data);
      alert('Đã chốt sổ thành công!');
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi khi chốt sổ');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlock = async () => {
    if (!unlockReason.trim()) {
      alert("Vui lòng nhập lý do mở khóa.");
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.post(`/projects/${projectId}/diary-locks/${dateFilter}/unlock`, { reason: unlockReason });
      setLockInfo(res.data);
      setShowUnlockModal(false);
      setUnlockReason('');
      alert('Mở khóa sổ thành công!');
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi khi mở khóa sổ');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 bg-[#F3F6FB] flex flex-col relative">
      <div className="flex-1 min-h-0 p-4 sm:p-6 max-w-[1200px] mx-auto w-full flex flex-col gap-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-[24px] font-bold text-[#0F1B3D] flex items-center gap-2">
              <div className="size-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                <FileText className="size-6" />
              </div>
              Nhật ký thi công
            </h1>
            <p className="text-gray-500 mt-1 text-sm">Ghi nhận và theo dõi các hoạt động trên công trường</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dateFilter && (
              lockInfo?.is_locked ? (
                canUnlock && (
                  <button 
                    onClick={() => setShowUnlockModal(true)}
                    disabled={actionLoading}
                    className="min-h-[44px] px-4 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-xl font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Unlock className="size-5" /> Mở khóa sổ
                  </button>
                )
              ) : (
                canLock && isPastDate && (
                  <button 
                    onClick={handleLock}
                    disabled={actionLoading}
                    className="min-h-[44px] px-4 bg-gray-800 text-white hover:bg-gray-900 rounded-xl font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Lock className="size-5" /> Chốt sổ
                  </button>
                )
              )
            )}
            
            {dateFilter && (
              <button 
                onClick={() => { fetchLockHistory(); setShowHistory(true); }}
                className="min-h-[44px] px-4 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold flex items-center gap-2 transition-colors shadow-sm"
              >
                <History className="size-5" /> Lịch sử chốt sổ
              </button>
            )}

            <button 
              onClick={() => setShowForm(true)}
              disabled={lockInfo?.is_locked}
              className={`min-h-[44px] px-5 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm ${lockInfo?.is_locked ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              title={lockInfo?.is_locked ? 'Đã chốt sổ, không thể ghi thêm' : ''}
            >
              <Plus className="size-5" /> Ghi nhật ký
            </button>
          </div>
        </div>

        {dateFilter && lockInfo?.is_locked && (
          <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-xl flex items-start sm:items-center gap-3 shrink-0">
            <Lock className="size-5 shrink-0 mt-0.5 sm:mt-0 text-orange-600" />
            <div className="flex-1">
              <span className="font-semibold">Nhật ký ngày {format(parseISO(dateFilter), 'dd/MM/yyyy')} đã được CHỐT SỔ.</span> 
              <span className="text-sm ml-1 text-orange-700">Không thể thêm, sửa, hoặc xóa dữ liệu.</span>
            </div>
          </div>
        )}

        <DiaryWeekStrip 
          projectId={projectId} 
          selectedDate={dateFilter} 
          onSelectDate={setDateFilter} 
          refreshKey={refreshKey}
        />

        {dateFilter && (
          <DiaryDayCard 
            projectId={projectId}
            date={dateFilter}
            onUpdated={() => setRefreshKey(k => k + 1)}
          />
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col sm:flex-row items-center gap-3 shrink-0 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 w-full sm:w-auto">
            <Filter className="size-4" /> Bộ lọc:
          </div>
          
          <input 
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="min-h-[44px] w-full sm:w-[160px] px-3.5 border border-gray-200 rounded-xl text-[14px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-gray-50 hover:bg-gray-100 transition-colors"
          />

          <select
            value={workItemFilter}
            onChange={e => setWorkItemFilter(e.target.value)}
            className="min-h-[44px] w-full sm:max-w-[300px] flex-1 px-3.5 border border-gray-200 rounded-xl text-[14px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <option value="">Tất cả hạng mục</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} - ${c.name}` : c.name}
              </option>
            ))}
          </select>

          {(dateFilter || workItemFilter) && (
            <button 
              onClick={clearFilters}
              className="min-h-[44px] px-4 w-full sm:w-auto flex items-center justify-center gap-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl font-medium transition-colors"
            >
              <X className="size-4" /> Xóa lọc
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
            <h3 className="font-semibold text-gray-700 text-sm">
              Danh sách nhật ký ({total})
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4">
            {loading ? (
              <div className="text-center text-gray-500 py-10">Đang tải nhật ký...</div>
            ) : error ? (
              <div className="text-center py-10">
                <p className="text-red-500 font-medium mb-4">{error}</p>
                <button onClick={fetchEntries} className="min-h-[44px] px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors">
                  Thử lại
                </button>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center text-gray-500 py-10">Chưa có nhật ký nào cho bộ lọc này.</div>
            ) : (
              entries.map(entry => (
                <div key={entry.id} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm hover:border-blue-200 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg w-fit">
                      <Hash className="size-4 text-gray-500" />
                      {entry.work_item_code ? `${entry.work_item_code} - ${entry.work_item_name}` : entry.work_item_name}
                      {lockInfo?.is_locked && <Lock className="size-3.5 text-orange-600 ml-1" title="Đã khóa" />}
                    </div>
                    <div className="flex items-center gap-4 text-[13px] text-gray-500 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-4" />
                        {format(parseISO(entry.entry_at), 'HH:mm - dd/MM/yyyy')}
                      </div>
                      <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-medium">
                        <User className="size-4" />
                        {entry.created_by_name}
                      </div>
                    </div>
                  </div>
                  <div className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap pl-1">
                    {entry.content}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {showForm && (
        <DiaryEntryForm 
          projectId={projectId} 
          user={user} 
          onClose={() => setShowForm(false)} 
          onSuccess={handleSuccess} 
        />
      )}

      {/* Unlock Modal */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <Unlock className="size-5 text-orange-500" />
                Mở khóa sổ ngày {format(parseISO(dateFilter), 'dd/MM/yyyy')}
              </h3>
              <button onClick={() => setShowUnlockModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4 bg-orange-50 text-orange-800 p-3 rounded-xl text-sm flex gap-2">
                <AlertCircle className="size-5 shrink-0" />
                <p>Hành động mở khóa sẽ được ghi lại vào lịch sử. Vui lòng nhập lý do hợp lệ.</p>
              </div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Lý do mở khóa <span className="text-red-500">*</span></label>
              <textarea 
                value={unlockReason}
                onChange={e => setUnlockReason(e.target.value)}
                placeholder="Ví dụ: Bổ sung nhân công theo yêu cầu CĐT..."
                className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none h-24"
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
              <button onClick={() => setShowUnlockModal(false)} className="px-4 py-2 font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50">
                Hủy
              </button>
              <button 
                onClick={handleUnlock}
                disabled={actionLoading || !unlockReason.trim()}
                className="px-4 py-2 font-medium text-white bg-orange-600 rounded-xl hover:bg-orange-700 disabled:opacity-50"
              >
                Xác nhận mở khóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <History className="size-5 text-blue-500" />
                Lịch sử chốt sổ ngày {format(parseISO(dateFilter), 'dd/MM/yyyy')}
              </h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600">
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {lockHistory.length === 0 ? (
                <div className="text-center text-gray-500 py-8">Chưa có lịch sử khóa/mở khóa nào.</div>
              ) : (
                <div className="space-y-4">
                  {lockHistory.map(log => (
                    <div key={log.id} className="border-l-2 border-gray-200 pl-4 py-1 relative">
                      <div className={`absolute -left-[5px] top-2 size-2 rounded-full ${log.action === 'LOCK_DIARY' ? 'bg-gray-800' : 'bg-orange-500'}`} />
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${log.action === 'LOCK_DIARY' ? 'bg-gray-100 text-gray-800' : 'bg-orange-100 text-orange-800'}`}>
                          {log.action === 'LOCK_DIARY' ? 'Chốt sổ' : 'Mở khóa'}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{log.user_name}</span>
                      </div>
                      <div className="text-[13px] text-gray-500 mb-1">
                        {format(parseISO(log.created_at), 'HH:mm - dd/MM/yyyy')}
                      </div>
                      {log.details?.reason && (
                        <div className="text-[14px] text-gray-700 bg-gray-50 p-2 rounded-lg border border-gray-100 mt-2">
                          <span className="font-medium">Lý do:</span> {log.details.reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
