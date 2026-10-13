import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../lib/api';
import { format, parseISO } from 'date-fns';

import { FileText, Search, Plus, Filter, X, Clock, User, Hash, Lock, Unlock, History, AlertCircle, AlertTriangle, CloudOff, Image as ImageIcon, Trash2 } from 'lucide-react';
import { can } from '../lib/permissions';
import { getDiaryLogsByProject, getDiaryAttachmentsByLog, isBlob, deleteDiaryEntry } from '../lib/diaryDb';
import DiaryEntryForm from '../components/DiaryEntryForm';
import { resolveWorkItemId } from '../utils/diaryUtils';
import DiaryWeekStrip from '../components/DiaryWeekStrip';
import DiaryDayCard from '../components/DiaryDayCard';
import DiaryConflictDialog from '../components/DiaryConflictDialog';


export default function DiaryPage({ user }) {
  const location = useLocation();
  const projectId = localStorage.getItem('currentProjectId') || 1;

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

  // S-32: Quản lý xung đột phiên bản (T-77 / T-78)
  const [conflicts, setConflicts] = useState([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  const [projectRole, setProjectRole] = useState(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true
  );

  const fetchConflicts = async () => {
    try {
      const res = await api.get(`/projects/${projectId}/diary-conflicts?status=pending`);
      setConflicts(res.data?.data || []);
    } catch (err) {
      console.warn("Không thể tải danh sách xung đột nhật ký:", err?.message || err);
    }
  };

  useEffect(() => {
    fetchConflicts();
    const handleSyncUpdated = () => {
      fetchConflicts();
    };
    window.addEventListener("diary-sync-updated", handleSyncUpdated);
    return () => {
      window.removeEventListener("diary-sync-updated", handleSyncUpdated);
    };
  }, [projectId]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      fetchEntries();
      fetchLockStatus();
      fetchConflicts();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Quản lý các Object URL ảnh offline để thu hồi khi unmount
  const pageCreatedUrlsRef = useRef(new Set());
  const fetchRequestIdRef = useRef(0);

  useEffect(() => {
    const urls = pageCreatedUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      });
      urls.clear();
    };
  }, []);

  // S-27: chốt/mở sổ nhật ký là quyền của Chỉ huy trưởng (đồng bộ backend
  // site_log.close_daily / site_log.correct_locked qua ma trận dùng chung).
  const canLock = user && (user.is_system_admin || can(projectRole, 'site_log.close_daily'));
  const canUnlock = user && (user.is_system_admin || can(projectRole, 'site_log.correct_locked'));
  const canResolveConflict = user && (user.is_system_admin || can(projectRole, 'site_log.create'));
  const isPastDate = dateFilter && dateFilter < todayVN;
  useEffect(() => {
    if (location.state?.openForm) {
      setShowForm(true);
    }
  }, [location.state]);

  useEffect(() => {
    // Fetch project to get membership role (có cache)
    try {
      const cachedRole = localStorage.getItem(`project_role_${projectId}`);
      if (cachedRole) setProjectRole(cachedRole);
    } catch {
      /* ignore */
    }

    api.get(`/projects/${projectId}`)
      .then(res => {
        const role = res.data?.membership;
        setProjectRole(role);
        try {
          if (role) localStorage.setItem(`project_role_${projectId}`, role);
        } catch {
          /* ignore */
        }
      })
      .catch(console.error);

    // Fetch categories for filter (có cache cho ngoại tuyến)
    try {
      const cached = JSON.parse(
        localStorage.getItem(`categories_${projectId}`) || "[]"
      );
      if (Array.isArray(cached) && cached.length > 0) {
        setCategories(cached);
      }
    } catch {
      /* ignore */
    }

    api.get(`/categories/${projectId}/tree/all`)
      .then(res => {
        const data = res.data || [];
        setCategories(data);
        try {
          localStorage.setItem(`categories_${projectId}`, JSON.stringify(data));
        } catch {
          /* ignore */
        }
      })
      .catch((err) => {
        console.warn('Không thể tải danh sách hạng mục (có thể đang ngoại tuyến):', err?.message || err);
        try {
          const cached = JSON.parse(
            localStorage.getItem(`categories_${projectId}`) || "[]"
          );
          if (Array.isArray(cached) && cached.length > 0) {
            setCategories(cached);
          }
        } catch {
          /* ignore */
        }
      });
  }, [projectId]);

  const fetchEntries = async () => {
    const requestId = ++fetchRequestIdRef.current;
    setLoading(true);
    setError(null);
    let serverEntries = [];
    let serverTotal = 0;
    let fetchError = null;

    const cacheKey = `diary_entries_cache_${projectId}_${dateFilter}_${workItemFilter}`;

    // Đọc trước từ cache để hiển thị tức thời nếu có
    try {
      let cachedRaw = localStorage.getItem(cacheKey);
      if (!cachedRaw) {
        const prefix = `diary_entries_cache_${projectId}_`;
        const candidates = Object.keys(localStorage)
          .filter((key) => key.startsWith(prefix))
          .sort()
          .reverse();
        cachedRaw = candidates.length ? localStorage.getItem(candidates[0]) : null;
      }
      const cached = JSON.parse(cachedRaw || 'null');
      if (cached && Array.isArray(cached.data)) {
        serverEntries = cached.data;
        serverTotal = cached.total ?? cached.data.length;
      }
    } catch {
      /* ignore */
    }

    try {
      const params = new URLSearchParams();
      if (dateFilter) params.append('date', dateFilter);
      if (workItemFilter) {
        const resolvedFilterId = resolveWorkItemId(workItemFilter, categories);
        if (resolvedFilterId) {
          params.append('work_item_id', String(resolvedFilterId));
        }
      }
      params.append('limit', 50);

      const res = await api.get(`/projects/${projectId}/diary-entries?${params.toString()}`);
      serverEntries = res.data.data || [];
      serverTotal = res.data.total || 0;
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ data: serverEntries, total: serverTotal }));
      } catch {
        /* ignore */
      }
    } catch (err) {
      fetchError = err.response?.data?.message || err.message || 'Lỗi khi tải danh sách nhật ký';
      // Nếu lỗi mạng, phục hồi từ cache nếu trước đó chưa có
      if (serverEntries.length === 0) {
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
          if (cached && Array.isArray(cached.data)) {
            serverEntries = cached.data;
            serverTotal = cached.total ?? cached.data.length;
          }
        } catch {
          /* ignore */
        }
      }
    }

    try {
      // Dọn dẹp các Object URL đã tạo trước đó trong trang để tránh rò rỉ bộ nhớ
      pageCreatedUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      });
      pageCreatedUrlsRef.current.clear();

      // Đọc các nhật ký lưu ngoại tuyến trong IndexedDB
      const offlineLogs = await getDiaryLogsByProject(Number(projectId));
      const resolvedFilterId = workItemFilter ? resolveWorkItemId(workItemFilter, categories) : null;
      const pendingLogs = (offlineLogs || [])
        .filter(l => ['pending', 'syncing', 'failed'].includes(l.syncStatus))
        .filter(l => {
          if (dateFilter) {
            const entryDate = l.entry_date || (l.entry_at ? format(parseISO(l.entry_at), 'yyyy-MM-dd') : '');
            if (entryDate !== dateFilter) return false;
          }
          if (workItemFilter) {
            const wid = l.work_item_id !== undefined ? l.work_item_id : l.workItemId;
            if (resolvedFilterId && String(wid) !== String(resolvedFilterId)) return false;
          }
          return true;
        });

      const enrichedPendingLogs = [];
      for (const l of pendingLogs) {
        let attachments = [];
        try {
          const rawAtts = await getDiaryAttachmentsByLog(l.id || l.client_id || l.clientId);
          for (const att of rawAtts || []) {
            let objectUrl = "";
            if (isBlob(att.blob)) {
              objectUrl = URL.createObjectURL(att.blob);
              pageCreatedUrlsRef.current.add(objectUrl);
            }
            attachments.push({
              ...att,
              id: att.id,
              url: objectUrl || att.url || "",
              fileName: att.fileName || att.file_name || "anh-hien-truong.jpg",
              file_name: att.fileName || att.file_name || "anh-hien-truong.jpg",
              fileSize: att.size || att.file_size || 0,
              file_size: att.size || att.file_size || 0,
              isOffline: true,
            });
          }
        } catch (attErr) {
          console.warn("Không thể tải ảnh offline cho nhật ký:", attErr);
        }

        enrichedPendingLogs.push({
          ...l,
          id: l.id || l.client_id,
          client_id: l.client_id || l.id,
          syncStatus: l.syncStatus || 'pending',
          isOffline: true,
          created_by_name: l.created_by_name || l.createdBy || 'Tôi (Cục bộ)',
          attachments,
        });
      }

      const serverClientIds = new Set(
        serverEntries.map((entry) => entry.client_id).filter(Boolean),
      );
      const uniquePending = enrichedPendingLogs.filter(
        (entry) => !serverClientIds.has(entry.client_id),
      );
      const pendingByClientId = new Map(
        enrichedPendingLogs.map((entry) => [entry.client_id, entry]),
      );
      const mergedServerEntries = serverEntries.map((entry) => {
        const localEntry = pendingByClientId.get(entry.client_id);
        if (!localEntry) return entry;
        return {
          ...localEntry,
          ...entry,
          id: entry.id,
          client_id: entry.client_id,
          syncStatus: localEntry.syncStatus,
          isOffline: true,
          attachments: localEntry.attachments,
        };
      });

      const mergedEntries = [...uniquePending, ...mergedServerEntries];
      if (requestId === fetchRequestIdRef.current) {
        setEntries(mergedEntries);
        setTotal(serverTotal + uniquePending.length);

        const isNetworkErr = !navigator.onLine || 
          (fetchError && (
            fetchError.toLowerCase().includes('network') ||
            fetchError.toLowerCase().includes('mạng') ||
            fetchError.toLowerCase().includes('failed to fetch') ||
            fetchError.toLowerCase().includes('econnaborted')
          ));

        if (fetchError && !isNetworkErr && mergedEntries.length === 0) {
          setError(fetchError);
        } else {
          setError(null);
        }
      }
    } catch (dbErr) {
      console.error("Lỗi khi đọc nhật ký offline:", dbErr);
      if (requestId === fetchRequestIdRef.current) {
        setEntries(serverEntries);
        setTotal(serverTotal);
        const isNetworkErr = !navigator.onLine || 
          (fetchError && (
            fetchError.toLowerCase().includes('network') ||
            fetchError.toLowerCase().includes('mạng')
          ));
        if (fetchError && !isNetworkErr && serverEntries.length === 0) {
          setError(fetchError);
        } else {
          setError(null);
        }
      }
    } finally {
      if (requestId === fetchRequestIdRef.current) setLoading(false);
    }
  };

  const fetchLockStatus = async () => {
    if (!dateFilter) return;
    const lockKey = `diary_lock_${projectId}_${dateFilter}`;
    try {
      const res = await api.get(`/projects/${projectId}/diary-locks/${dateFilter}`);
      setLockInfo(res.data || { is_locked: false });
      try {
        localStorage.setItem(lockKey, JSON.stringify(res.data));
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.warn("Lỗi lấy trạng thái khóa (có thể đang ngoại tuyến):", err?.message || err);
      try {
        const cached = JSON.parse(localStorage.getItem(lockKey) || 'null');
        if (cached) {
          setLockInfo(cached);
          return;
        }
      } catch {
        /* ignore */
      }
      setLockInfo({ is_locked: false });
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
  }, [projectId, dateFilter, workItemFilter, refreshKey]);

  useEffect(() => {
    const refreshAfterSync = () => setRefreshKey((key) => key + 1);
    window.addEventListener('diary-sync-updated', refreshAfterSync);
    return () => window.removeEventListener('diary-sync-updated', refreshAfterSync);
  }, []);

  const getAttachmentUrl = (url) => {
    if (!url) return '';
    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('blob:') ||
      url.startsWith('data:')
    ) {
      return url;
    }
    // Giữ nguyên đường dẫn tương đối (/api/...) để gọi cùng origin
    // qua Vite proxy (ở local) hoặc Render rewrite (ở production), đảm bảo session cookie luôn được gửi.
    return url;
  };

  const clearFilters = () => {
    setDateFilter('');
    setWorkItemFilter('');
  };

  const handleSuccess = (newEntry) => {
    setShowForm(false);
    
    // Check if new entry matches current filters
    let matchesDate = true;
    if (dateFilter) {
      const entryDate = newEntry.entry_date || (newEntry.entry_at ? format(parseISO(newEntry.entry_at), 'yyyy-MM-dd') : '');
      matchesDate = entryDate === dateFilter;
    }
    
    let matchesWorkItem = true;
    if (workItemFilter && (newEntry.work_item_id !== undefined || newEntry.workItemId !== undefined)) {
      const wid = newEntry.work_item_id !== undefined ? newEntry.work_item_id : newEntry.workItemId;
      const resolvedFilterId = resolveWorkItemId(workItemFilter, categories);
      const resolvedWid = resolveWorkItemId(wid, categories);
      matchesWorkItem =
        wid.toString() === workItemFilter.toString() ||
        Boolean(resolvedFilterId && (String(wid) === String(resolvedFilterId) || String(resolvedWid) === String(resolvedFilterId)));
    }

    if (matchesDate && matchesWorkItem) {
      fetchRequestIdRef.current += 1;
      setLoading(false);
      setEntries(prev => {
        const exists = prev.some(e => (e.client_id && e.client_id === newEntry.client_id) || (e.id && e.id === newEntry.id));
        if (exists) return prev;
        return [newEntry, ...prev];
      });
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

  const [deletingId, setDeletingId] = useState(null);

  const handleDeleteEntry = async (entry) => {
    const entryId = entry.id;
    const clientId = entry.client_id || entry.clientId;

    if (!window.confirm("Bạn có chắc chắn muốn xóa nhật ký này không?")) {
      return;
    }

    const currentKey = entryId || clientId;
    setDeletingId(currentKey);

    try {
      // 1. Xóa trong IndexedDB nếu có lưu offline
      if (clientId) {
        try {
          await deleteDiaryEntry(clientId);
        } catch (dbErr) {
          console.warn("Lỗi khi xóa khỏi IndexedDB:", dbErr);
        }
      }

      // 2. Nếu đã đồng bộ lên máy chủ thì gọi API DELETE
      if (entryId && typeof entryId === 'number') {
        await api.delete(`/projects/${projectId}/diary-entries/${entryId}`);
      }

      // 3. Cập nhật state
      setEntries(prev => prev.filter(e => (e.id !== entryId && (!clientId || e.client_id !== clientId))));
      setTotal(prev => Math.max(0, prev - 1));

      // 4. Cập nhật cache localStorage
      const cacheKey = `diary_entries_cache_${projectId}_${dateFilter}_${workItemFilter}`;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && Array.isArray(cached.data)) {
          const updated = cached.data.filter(e => e.id !== entryId && (!clientId || e.client_id !== clientId));
          localStorage.setItem(cacheKey, JSON.stringify({
            data: updated,
            total: Math.max(0, (cached.total || updated.length) - 1)
          }));
        }
      } catch {
        /* ignore */
      }

      // 5. Cập nhật dải tuần
      setRefreshKey(k => k + 1);
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Lỗi khi xóa nhật ký");
    } finally {
      setDeletingId(null);
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

        {conflicts.length > 0 && (
          <div
            role="alert"
            className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <span className="font-semibold">
                  Phát hiện {conflicts.length} xung đột phiên bản nhật ký cần xử lý.
                </span>
                <p className="text-xs text-amber-800">
                  Có bản ghi bị sửa đồng thời hoặc không khớp phiên bản giữa máy chủ và thiết bị.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowConflictDialog(true)}
              className="min-h-[38px] px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              Xem và giải quyết xung đột
            </button>
          </div>
        )}

        {!isOnline && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-xs shrink-0">
            <div className="size-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <CloudOff className="size-5 text-amber-700" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">Chế độ ngoại tuyến (Không có mạng)</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Đang hiển thị dữ liệu lưu trên thiết bị. Bạn vẫn có thể ghi nhật ký bình thường, hệ thống sẽ tự động đồng bộ khi có kết nối mạng.
              </p>
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
            {categories.map(c => {
              const isTask = c.type === "task" || String(c.id).startsWith("task-");
              const label = isTask
                ? `[Công việc] ${c.name}`
                : (c.code ? `${c.code} - ${c.name}` : c.name);
              return (
                <option key={c.id} value={c.id}>
                  {label}
                </option>
              );
            })}
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
              <div className="text-center text-gray-500 py-12 flex flex-col items-center justify-center">
                <FileText className="size-10 text-gray-300 mb-2" />
                <p className="font-medium text-gray-600">Chưa có nhật ký nào cho bộ lọc này.</p>
                {!isOnline && (
                  <p className="text-xs text-amber-600 mt-1 max-w-md">
                    (Đang ở chế độ ngoại tuyến — bạn vẫn có thể bấm nút &quot;Ghi nhật ký&quot; để tạo nhật ký lưu vào thiết bị)
                  </p>
                )}
              </div>
            ) : (
              entries.map(entry => (
                <div key={entry.id} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm hover:border-blue-200 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg w-fit">
                      <Hash className="size-4 text-gray-500" />
                      {entry.work_item_code ? `${entry.work_item_code} - ${entry.work_item_name}` : entry.work_item_name}
                      {lockInfo?.is_locked && <Lock className="size-3.5 text-orange-600 ml-1" title="Đã khóa" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[13px] text-gray-500 shrink-0">
                      {entry.syncStatus && entry.syncStatus !== 'synced' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <CloudOff className="size-3.5 text-amber-500" />
                          {entry.syncStatus === 'syncing'
                            ? 'Đang đồng bộ...'
                            : entry.syncStatus === 'failed'
                              ? 'Đồng bộ thất bại — sẽ tự thử lại'
                              : 'Đã lưu trên thiết bị — chờ đồng bộ'}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-4" />
                        {format(parseISO(entry.entry_at), 'HH:mm - dd/MM/yyyy')}
                      </div>
                      <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-medium">
                        <User className="size-4" />
                        {entry.created_by_name}
                      </div>

                      {(() => {
                        const isCreator = entry.created_by && user && Number(entry.created_by) === Number(user.id);
                        const isAdmin = Boolean(user?.is_system_admin);
                        const isManager = ["chi_huy_truong", "ban_quan_ly"].includes(projectRole);
                        const canDelete = !lockInfo?.is_locked && (isAdmin || isCreator || isManager);
                        if (!canDelete) return null;

                        return (
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry)}
                            disabled={deletingId === (entry.id || entry.client_id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Xóa nhật ký này"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap pl-1">
                    {entry.content}
                  </div>

                  {/* Danh sách ảnh đính kèm (T67) */}
                  {entry.attachments && entry.attachments.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                        <ImageIcon className="size-3.5 text-blue-500" />
                        <span>Hình ảnh đính kèm ({entry.attachments.length}):</span>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {entry.attachments.map((att) => {
                          const displayUrl = getAttachmentUrl(att.url);
                          return (
                            <button
                              type="button"
                              key={att.id}
                              onClick={() => {
                                if (displayUrl) {
                                  window.open(displayUrl, '_blank');
                                }
                              }}
                              className="relative group size-20 sm:size-24 rounded-xl overflow-hidden border border-gray-200 bg-gray-50 shadow-sm cursor-pointer hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              title={`Bấm để xem ảnh: ${att.file_name || att.fileName}`}
                            >
                              <img
                                src={displayUrl}
                                alt={att.file_name || att.fileName}
                                crossOrigin="use-credentials"
                                className="size-full object-cover group-hover:scale-105 transition-transform"
                                loading="lazy"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  if (e.target.nextSibling) {
                                    e.target.nextSibling.style.display = 'flex';
                                  }
                                }}
                              />
                            <div className="hidden size-full items-center justify-center bg-gray-100 text-gray-400 text-[10px] p-1 text-center font-medium">
                              Lỗi tải ảnh
                            </div>
                            {att.isOffline && (
                              <span className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-xs text-white text-[9px] px-1 py-0.5 rounded font-medium">
                                Offline
                              </span>
                            )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
          initialCategories={categories}
          onClose={() => {
            setShowForm(false);
            fetchEntries();
          }} 
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

      <DiaryConflictDialog
        isOpen={showConflictDialog}
        onClose={() => setShowConflictDialog(false)}
        conflicts={conflicts}
        projectId={projectId}
        canResolve={canResolveConflict}
        onResolved={() => {
          fetchConflicts();
          fetchEntries();
        }}
      />
    </div>
  );
}
