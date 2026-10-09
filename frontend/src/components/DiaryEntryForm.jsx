import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { X, Search, Check, AlertCircle, Save, RotateCcw } from 'lucide-react';
import { format, parseISO, isAfter, addMinutes } from 'date-fns';

const ALLOWED_ROLES = ['ky_su_giam_sat', 'chi_huy_truong', 'ban_quan_ly', 'doi_truong', 'system_admin'];

export default function DiaryEntryForm({ projectId, user, onClose, onSuccess }) {
  const canWrite = ALLOWED_ROLES.includes(user?.role);
  const draftKey = `diary_draft_${projectId}`;

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  
  const [clientId, setClientId] = useState('');
  const [workItemId, setWorkItemId] = useState('');
  const [entryAt, setEntryAt] = useState('');
  const [content, setContent] = useState('');
  
  const [search, setSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);

  useEffect(() => {
    if (!canWrite) return;
    
    api.get(`/categories/${projectId}/tree/all`)
      .then(res => {
        setCategories(res.data || []);
        setCategoriesLoading(false);
      })
      .catch(err => {
        console.error(err);
        setCategoriesLoading(false);
      });

    try {
      const draftStr = localStorage.getItem(draftKey);
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        setWorkItemId(draft.work_item_id || '');
        setEntryAt(draft.entry_at || format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setContent(draft.content || '');
        setClientId(draft.client_id || crypto.randomUUID());
        setSubmitMessage({ type: 'warning', text: 'Đang có bản nháp chưa gửi.' });
      } else {
        setEntryAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
        setClientId(crypto.randomUUID());
      }
    } catch (e) {
      setEntryAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      setClientId(crypto.randomUUID());
    }

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [projectId, canWrite, draftKey]);

  useEffect(() => {
    if (!canWrite) return;
    const draft = { work_item_id: workItemId, entry_at: entryAt, content, client_id: clientId };
    try {
      if (workItemId || content) {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } else {
        localStorage.removeItem(draftKey);
      }
    } catch (e) {
      // ignore
    }
  }, [workItemId, entryAt, content, clientId, draftKey, canWrite]);

  const validate = (field, value) => {
    let err = '';
    if (field === 'workItemId' && !value) err = 'Vui lòng chọn hạng mục';
    if (field === 'content') {
      const trimmed = value.trim();
      if (!trimmed) err = 'Vui lòng nhập nội dung';
      else if (trimmed.length > 5000) err = 'Nội dung tối đa 5000 ký tự';
    }
    if (field === 'entryAt') {
      if (!value) {
        err = 'Vui lòng chọn thời gian';
      } else {
        const dt = parseISO(value);
        if (isAfter(dt, addMinutes(new Date(), 10))) {
          err = 'Thời gian không vượt quá 10 phút trong tương lai';
        }
      }
    }
    return err;
  };

  const handleBlur = (field, value) => {
    const err = validate(field, value);
    setErrors(prev => ({ ...prev, [field]: err }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const wErr = validate('workItemId', workItemId);
    const cErr = validate('content', content);
    const dErr = validate('entryAt', entryAt);
    
    setErrors({ workItemId: wErr, content: cErr, entryAt: dErr });
    if (wErr || cErr || dErr) return;

    setIsSubmitting(true);
    setSubmitMessage(null);

    const payload = {
      work_item_id: parseInt(workItemId, 10),
      content: content.trim(),
      client_id: clientId,
      entry_at: new Date(entryAt).toISOString()
    };

    try {
      const res = await api.post(`/projects/${projectId}/diary-entries`, payload);
      try { localStorage.removeItem(draftKey); } catch (e) { /* ignore */ }
      onSuccess(res.data.entry || res.data);
    } catch (err) {
      if (!err.response) {
        setSubmitMessage({ type: 'warning', text: 'Chưa gửi được, nội dung vẫn được giữ. Vui lòng thử lại.' });
      } else {
        const status = err.response.status;
        const code = err.response.data?.code;
        if (status === 403) {
          setSubmitMessage({ type: 'error', text: 'Bạn không có quyền ghi nhật ký.' });
        } else if (status === 422 && code === 'INVALID_WORK_ITEM') {
          setSubmitMessage({ type: 'error', text: 'Hạng mục không hợp lệ hoặc không thuộc dự án.' });
        } else if (status === 400) {
          setSubmitMessage({ type: 'error', text: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.' });
        } else {
          setSubmitMessage({ type: 'error', text: err.response.data?.message || 'Có lỗi xảy ra khi lưu.' });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCategories = categories.filter(c => {
    const norm = (s) => (s||'').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(search);
    return norm(c.name).includes(q) || norm(c.code).includes(q);
  });

  const selectedCategory = categories.find(c => c.id.toString() === workItemId.toString());

  if (!canWrite) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm transition-all">
      <div className="bg-white w-full sm:w-[500px] sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Ghi nhật ký thi công</h2>
          <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          {submitMessage && (
            <div className={`p-4 rounded-xl flex items-start gap-3 text-sm font-medium ${submitMessage.type === 'warning' ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                {submitMessage.text}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-gray-700">Hạng mục <span className="text-red-500">*</span></label>
            <select
              value={workItemId}
              onChange={(e) => {
                setWorkItemId(e.target.value);
                setErrors(prev => ({ ...prev, workItemId: '' }));
              }}
              data-testid="category-dropdown"
              className={`w-full min-h-[44px] px-3.5 py-2.5 text-[15px] bg-white border rounded-xl outline-none transition-colors ${errors.workItemId ? 'border-red-500 ring-1 ring-red-500/20' : 'border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'}`}
            >
              <option value="">Chọn hạng mục...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id} data-testid={`category-option-${c.id}`}>
                  {c.code ? `${c.code} - ${c.name}` : c.name}
                </option>
              ))}
            </select>
            {errors.workItemId && <span className="text-[12px] text-red-500 font-medium">{errors.workItemId}</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-bold text-gray-700">Thời gian <span className="text-red-500">*</span></label>
            <input 
              type="datetime-local" 
              value={entryAt}
              onChange={e => {
                setEntryAt(e.target.value);
                setErrors(prev => ({ ...prev, entryAt: '' }));
              }}
              onBlur={e => handleBlur('entryAt', e.target.value)}
              className={`w-full min-h-[44px] px-3.5 py-2.5 border rounded-xl bg-white text-[15px] outline-none transition-colors ${errors.entryAt ? 'border-red-500 ring-1 ring-red-500/20' : 'border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'}`}
            />
            {errors.entryAt && <span className="text-[12px] text-red-500 font-medium">{errors.entryAt}</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-bold text-gray-700">Nội dung <span className="text-red-500">*</span></label>
              <span className={`text-[12px] font-medium ${content.length > 5000 ? 'text-red-500' : 'text-gray-400'}`}>
                {content.length}/5000
              </span>
            </div>
            <textarea 
              value={content}
              onChange={e => {
                setContent(e.target.value);
                setErrors(prev => ({ ...prev, content: '' }));
              }}
              onBlur={e => handleBlur('content', e.target.value)}
              placeholder="Nhập nội dung công việc đã thực hiện..."
              className={`w-full min-h-[120px] px-3.5 py-3 border rounded-xl bg-white text-[15px] resize-none outline-none transition-colors ${errors.content ? 'border-red-500 ring-1 ring-red-500/20' : 'border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'}`}
            />
            {errors.content && <span className="text-[12px] text-red-500 font-medium">{errors.content}</span>}
          </div>

          <div className="pt-2 pb-6 sm:pb-0 shrink-0">
            <button 
              type="submit"
              data-testid="submit-diary-btn"
              disabled={isSubmitting || !!errors.workItemId || !!errors.content || !!errors.entryAt}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-bold text-[15px] transition-colors shadow-sm"
            >
              {isSubmitting ? (
                <>Đang lưu...</>
              ) : submitMessage?.type === 'warning' ? (
                <><RotateCcw className="size-5" /> Gửi lại</>
              ) : (
                <><Save className="size-5" /> Lưu nhật ký</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
