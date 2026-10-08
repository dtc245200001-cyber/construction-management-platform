import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../lib/api';
import { format, parseISO } from 'date-fns';

import { FileText, Search, Plus, Filter, X, Clock, User, Hash } from 'lucide-react';
import DiaryEntryForm from '../components/DiaryEntryForm';

const ALLOWED_ROLES = ['ky_su_giam_sat', 'chi_huy_truong', 'ban_quan_ly', 'doi_truong'];


export default function DiaryPage({ user }) {
  const location = useLocation();
  const projectId = localStorage.getItem('currentProjectId') || 13;
  const canWrite = ALLOWED_ROLES.includes(user?.role);

  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const todayVN = format(new Date(), 'yyyy-MM-dd');
  const [dateFilter, setDateFilter] = useState(todayVN);
  const [workItemFilter, setWorkItemFilter] = useState('');
  
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(location.state?.openForm || false);

  useEffect(() => {
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

  useEffect(() => {
    fetchEntries();
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
          {canWrite && (
            <button 
              onClick={() => setShowForm(true)}
              className="min-h-[44px] px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="size-5" /> Ghi nhật ký
            </button>
          )}
        </div>

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
    </div>
  );
}
