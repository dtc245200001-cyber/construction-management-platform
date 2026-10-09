import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import {
  CloudRain, CloudSun, AlertTriangle, Users, Wrench,
  PenLine, RefreshCw, Loader2, Info,
} from 'lucide-react';
import DiaryDayForm from './DiaryDayForm';

// S-22 / T-51 — Thẻ hiển thị mục đầu ngày (nhân lực, thiết bị, thời tiết).

export default function DiaryDayCard({ projectId, date, onUpdated }) {
  const [state, setState] = useState('loading'); // loading | error | empty | loaded
  const [data, setData] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!date || !projectId) return;
    setState('loading');
    try {
      const res = await api.get(`/projects/${projectId}/diary-days/${date}`);
      setData(res.data);
      setState(res.data.exists ? 'loaded' : 'empty');
    } catch (_) {
      setState('error');
    }
  }, [projectId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSuccess = (responseData) => {
    // Form trả cả wrapper { can_edit, day, entries_count } của PUT /diary-days/:date
    setData(responseData);
    setState(responseData?.exists === false ? 'empty' : 'loaded');
    setShowForm(false);
    if (onUpdated) onUpdated();
  };

  if (!date) return null;

  // ── Trạng thái: đang tải ───────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
      </div>
    );
  }

  // ── Trạng thái: lỗi ────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
        <p className="text-sm text-red-600 mb-2">Không thể tải mục đầu ngày.</p>
        <button
          onClick={load}
          className="text-sm text-red-700 underline flex items-center gap-1"
        >
          <RefreshCw size={14} /> Thử lại
        </button>
      </div>
    );
  }

  const { can_edit, day, entries_count } = data || {};

  // ── Trạng thái: chưa có bản ghi ────────────────────────────────────────
  if (state === 'empty') {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5">
        <div className="flex items-start gap-3">
          <Info size={18} className="text-gray-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600">Chưa ghi mục đầu ngày</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {entries_count > 0 ? `${entries_count} mục nhật ký đã ghi trong ngày này.` : 'Chưa có mục nhật ký nào trong ngày.'}
            </p>
          </div>
        </div>
        {can_edit && (
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 w-full min-h-[48px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            Ghi mục đầu ngày
          </button>
        )}
        {showForm && (
          <DiaryDayForm
            projectId={projectId}
            date={date}
            existing={null}
            onClose={() => setShowForm(false)}
            onSuccess={handleSuccess}
          />
        )}
      </div>
    );
  }

  // ── Trạng thái: đã có dữ liệu ──────────────────────────────────────────
  const isAdverse = day?.weather_is_adverse;

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${isAdverse ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <CloudSun size={16} className="text-blue-500" />
          Mục đầu ngày
        </h3>
        {can_edit && (
          <button
            onClick={() => setShowForm(true)}
            className="min-h-[44px] min-w-[44px] flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <PenLine size={14} /> Sửa
          </button>
        )}
      </div>

      {/* Thời tiết bất lợi — cảnh báo rõ ràng */}
      {isAdverse && (
        <div className="flex items-center gap-2 rounded-xl bg-orange-100 px-3 py-2 mb-3 text-orange-800">
          <CloudRain size={16} className="shrink-0" />
          <span className="text-xs font-semibold">Thời tiết bất lợi cho thi công</span>
        </div>
      )}

      <dl className="space-y-2 text-sm">
        {/* Nhân lực */}
        <div className="flex items-center gap-2 text-gray-700">
          <Users size={15} className="text-gray-400 shrink-0" />
          <dt className="text-gray-500 min-w-[90px]">Nhân lực:</dt>
          <dd className="font-semibold">
            {day.manpower_count !== null && day.manpower_count !== undefined
              ? `${day.manpower_count} người`
              : '—'}
          </dd>
        </div>

        {/* Thời tiết */}
        {day.weather_label && (
          <div className="flex items-center gap-2 text-gray-700">
            <CloudSun size={15} className="text-gray-400 shrink-0" />
            <dt className="text-gray-500 min-w-[90px]">Thời tiết:</dt>
            <dd className="font-semibold">{day.weather_label}</dd>
          </div>
        )}

        {/* Ghi chú thời tiết */}
        {day.weather_note && (
          <div className="flex items-start gap-2 text-gray-700">
            <Info size={15} className="text-gray-400 shrink-0 mt-0.5" />
            <dt className="text-gray-500 min-w-[90px]">Ghi chú:</dt>
            <dd className="text-gray-700 text-xs leading-relaxed">{day.weather_note}</dd>
          </div>
        )}

        {/* Thiết bị */}
        {day.equipment && day.equipment.length > 0 && (
          <div className="flex items-start gap-2">
            <Wrench size={15} className="text-gray-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <dt className="text-gray-500 mb-1">Thiết bị:</dt>
              <dd>
                <ul className="space-y-0.5">
                  {day.equipment.map((eq) => (
                    <li key={eq.equipment_type_id} className="text-xs text-gray-700">
                      {eq.label} × {eq.quantity} {eq.unit || ''}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </div>
        )}
      </dl>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-1">
        <span>Cập nhật bởi {day.updated_by_name}</span>
        {day.updated_at && (
          <span>lúc {new Date(day.updated_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
        )}
      </div>

      {/* Số mục nhật ký */}
      {entries_count > 0 && (
        <p className="mt-2 text-xs text-gray-400">{entries_count} mục nhật ký trong ngày.</p>
      )}

      {showForm && (
        <DiaryDayForm
          projectId={projectId}
          date={date}
          existing={day}
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
