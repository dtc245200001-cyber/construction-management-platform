import React, { useState, useEffect, useRef } from 'react';
import { todayVN, formatShortDayVN, weekDays } from '../utils/dateVN';
import { ChevronLeft, ChevronRight, CloudRain, Users, CalendarDays, FileText } from 'lucide-react';
import api from '../lib/api';

// S-22 / T-51 — Dải chọn ngày trong tuần
export default function DiaryWeekStrip({ projectId, selectedDate, onSelectDate, refreshKey = 0 }) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Tính tuần chứa selectedDate. Khi bộ lọc ngày bị xoá (''), giữ nguyên
  // tuần hiện tại thay vì crash ở weekDays('').
  const currentWeek = weekDays(selectedDate || todayVN());
  const from = currentWeek[0];
  const to = currentWeek[6];
  const today = todayVN();

  useEffect(() => {
    let isMounted = true;
    const fetchWeek = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/projects/${projectId}/diary-days?from=${from}&to=${to}`);
        if (isMounted) {
          setDays(res.data.days || []);
        }
      } catch (err) {
        console.error("Lỗi lấy dữ liệu tuần:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchWeek();
    return () => { isMounted = false; };
  }, [projectId, from, to, refreshKey]);

  const handlePrevWeek = () => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    onSelectDate(d.toISOString().slice(0, 10));
  };

  const handleNextWeek = () => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    onSelectDate(d.toISOString().slice(0, 10));
  };

  const handleThisWeek = () => {
    onSelectDate(today);
  };

  const adverseDaysCount = days.filter(d => d.weather_is_adverse).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-gray-800 text-lg">
            Tuần {formatShortDayVN(from).split(' ')[1]} - {formatShortDayVN(to).split(' ')[1]}
          </h2>
          {adverseDaysCount > 0 && (
            <p className="text-sm text-orange-600 font-medium flex items-center gap-1 mt-1">
              <CloudRain size={16} /> Tuần này có {adverseDaysCount} ngày thời tiết bất lợi
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevWeek}
            className="px-3 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center font-medium border border-gray-200"
            title="Tuần trước"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={handleThisWeek}
            className="px-4 rounded-xl hover:bg-blue-50 text-blue-600 transition-colors min-h-[48px] flex items-center justify-center font-semibold border border-blue-200"
          >
            Tuần này
          </button>
          <button
            onClick={handleNextWeek}
            className="px-3 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center font-medium border border-gray-200"
            title="Tuần sau"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-4 snap-x scroll-smooth hide-scrollbar"
      >
        {loading && days.length === 0 ? (
          <div className="flex-1 text-center py-4 text-sm text-gray-400 min-h-[140px] flex items-center justify-center">Đang tải...</div>
        ) : (
          (days.length > 0 ? days : currentWeek.map(d => ({ date: d }))).map((day) => {
            const isSelected = day.date === selectedDate;
            const isToday = day.date === today;
            const hasLog = day.has_daily_log;
            const entriesCount = day.entries_count || 0;
            const isAdverse = day.weather_is_adverse;

            return (
              <button
                key={day.date}
                onClick={() => onSelectDate(day.date)}
                className={`
                  relative flex-shrink-0 w-36 min-h-[140px] rounded-2xl transition-all snap-start flex flex-col p-3 gap-2 text-left
                  ${isSelected ? 'bg-blue-50 shadow-md ring-2 ring-blue-600 border-transparent' : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'}
                  ${isAdverse ? (isSelected ? 'border-dashed border-2 border-orange-500' : 'border-dashed border-2 border-orange-400 bg-orange-50/30') : ''}
                `}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`text-sm font-bold ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                    {formatShortDayVN(day.date)}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                      Hôm nay
                    </span>
                  )}
                </div>

                {!hasLog && entriesCount === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-gray-400 font-medium italic mt-2">
                    Chưa ghi
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-1.5 mt-1 text-xs">
                    {hasLog ? (
                      <>
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <Users size={14} className="text-gray-400 shrink-0" />
                          <span className="truncate">{day.manpower_count !== null ? `${day.manpower_count} người` : '—'}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 truncate ${isAdverse ? 'text-orange-700 font-semibold' : 'text-gray-700'}`}>
                          {isAdverse ? <CloudRain size={14} className="shrink-0" /> : <CalendarDays size={14} className="text-gray-400 shrink-0" />}
                          <span className="truncate" title={day.weather_label}>{day.weather_label || '—'}</span>
                        </div>
                      </>
                    ) : (
                      <div className="text-gray-400 italic">Thiếu mục đầu ngày</div>
                    )}
                    
                    <div className="mt-auto pt-1 flex items-center gap-1.5 font-medium text-gray-600 border-t border-gray-200/50">
                      <FileText size={14} className={entriesCount > 0 ? "text-green-500" : "text-gray-300"} />
                      {entriesCount} mục
                    </div>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
