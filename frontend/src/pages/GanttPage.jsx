import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { mapScheduleToGantt, generateTimelineTicks } from "../utils/ganttUtils";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";

export default function GanttPage() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Hardcode PIXELS_PER_DAY temporarily or make it a state for future view modes
  const [viewMode, setViewMode] = useState("day");
  
  const PIXELS_PER_DAY = viewMode === "day" ? 30 : 5; // 30px per day or 5px per day for week view
  const ROW_HEIGHT = 40;

  const currentProjectId = localStorage.getItem("currentProjectId") || 13;

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        
        // Thử tính toán lại CPM để bắt lỗi vòng nếu có
        try {
          await api.post(`/projects/${currentProjectId}/schedule/recalculate`);
        } catch (calcErr) {
          if (calcErr.response?.data?.code === "DEPENDENCY_CYCLE") {
            setError(calcErr.response.data.message);
            return;
          }
        }
        
        const res = await api.get(`/projects/${currentProjectId}/schedule-results`);
        setTasks(res.data.data || []);
      } catch (err) {
        setError(err.response?.data?.message || "Lỗi tải tiến độ dự án");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [currentProjectId]);

  if (error) {
    return (
      <div className="flex-1 p-6 text-red-600 flex flex-col items-center justify-center bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center gap-3">
          <AlertTriangle className="size-10 text-red-500" />
          <h2 className="text-lg font-bold text-red-700">Không thể vẽ sơ đồ thanh ngang theo trục thời gian</h2>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50">
        <RefreshCw className="size-8 text-blue-500 animate-spin mb-4" />
        <p className="text-gray-500">Đang tải và tính toán sơ đồ thanh ngang theo trục thời gian...</p>
      </div>
    );
  }

  const validTasks = tasks.filter((t) => t.early_start && t.early_finish);
  if (validTasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Dự án chưa có công việc nào hợp lệ để vẽ.</p>
      </div>
    );
  }

  // Tìm ngày bắt đầu sớm nhất của toàn dự án làm mốc X=0
  const sortedStarts = [...validTasks].sort(
    (a, b) => new Date(a.early_start) - new Date(b.early_start)
  );
  const projectStartDate = sortedStarts[0].early_start;
  const projectEndDate = new Date(Math.max(...validTasks.map(t => new Date(t.early_finish))));
  const totalDays = differenceInCalendarDays(projectEndDate, parseISO(projectStartDate));

  const ganttBars = mapScheduleToGantt(validTasks, projectStartDate, PIXELS_PER_DAY, ROW_HEIGHT);
  const ticks = generateTimelineTicks(projectStartDate, totalDays + 14, viewMode, PIXELS_PER_DAY); // Thêm 14 ngày đệm

  // Tính chiều rộng tổng của SVG
  const maxRightX = Math.max(...ganttBars.map(b => b.x + b.width));
  const svgWidth = Math.max(maxRightX + 200, ticks[ticks.length - 1]?.x + 200 || 1000);

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden m-4 rounded-xl border border-gray-200 shadow-sm">
      {/* Thanh công cụ (Toolbar) */}
      <div className="min-h-[56px] h-auto py-2 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between px-4 shrink-0 gap-3">
        <h1 className="font-bold text-gray-800 text-[15px] md:text-base">Sơ đồ thanh ngang theo trục thời gian</h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setViewMode("day")} 
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${viewMode === 'day' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            Chế độ Ngày
          </button>
          <button 
            onClick={() => setViewMode("week")} 
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${viewMode === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            Chế độ Tuần
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Cột Danh sách công việc */}
        <div className="w-[140px] md:w-[180px] lg:w-max lg:min-w-[250px] lg:max-w-[350px] border-r border-gray-200 bg-white shrink-0 flex flex-col z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
          <div className="h-20 border-b border-gray-200 bg-slate-50 flex items-center px-4 font-semibold text-sm text-gray-600 shrink-0">
            Tên công việc
          </div>
          <div className="flex-1 overflow-hidden">
            {/* 
               Ẩn thanh cuộn của cột này nhưng vẫn cho cuộn dọc (bằng cách đồng bộ với cuộn của SVG, 
               hoặc đơn giản là để nó tự cuộn nhưng ẩn scrollbar). 
               Cách tốt nhất là để cho SVG cuộn cả 2 chiều, còn cột này chỉ ăn theo cuộn dọc.
               Tạm thời dùng absolute/relative wrapper.
            */}
            {ganttBars.map((bar) => (
              <div
                key={bar.id}
                className="px-2 md:px-4 text-[12px] md:text-[13px] text-gray-700 truncate border-b border-gray-100 flex flex-col justify-center bg-white"
                style={{ height: ROW_HEIGHT }}
                title={bar.name}
              >
                <div className="truncate font-medium lg:whitespace-nowrap">{bar.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Khung thời gian (Cuộn ngang tự do) */}
        <div className="flex-1 overflow-auto bg-slate-50 relative">
          <div style={{ minWidth: svgWidth, height: ganttBars.length * ROW_HEIGHT + 80 }} className="relative">
            
            {/* Dòng Header Timeline (Chứa các mốc) */}
            <div className="h-20 border-b border-gray-200 bg-slate-50 sticky top-0 z-10 w-full relative overflow-hidden">
              {ticks.map(tick => (
                <div 
                  key={tick.x} 
                  className="absolute h-full flex flex-col justify-end pb-2 border-l border-gray-300 text-[10px] text-gray-500" 
                  style={{ left: tick.x, width: PIXELS_PER_DAY * (viewMode === 'week' ? 7 : 1) }}
                >
                  <span className="whitespace-nowrap -rotate-45 origin-bottom-left ml-2 mb-1">{tick.label}</span>
                </div>
              ))}
            </div>

            <svg width={svgWidth} height={ganttBars.length * ROW_HEIGHT} className="absolute left-0" style={{ top: 80 }}>
              {/* Lưới dọc */}
              {ticks.map(tick => (
                <line 
                  key={`line-${tick.x}`} 
                  x1={tick.x} y1={0} x2={tick.x} y2="100%" 
                  stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4" 
                />
              ))}

              {ganttBars.map((bar) => {
                const barColor = bar.is_critical ? "#ef4444" : "#3b82f6"; // Đỏ nếu găng, xanh nếu không
                return (
                  <g key={bar.id}>
                    {/* Dòng lưới nền */}
                    <rect x={0} y={bar.y} width={svgWidth} height={ROW_HEIGHT} fill="transparent" stroke="#e2e8f0" strokeWidth="0.5" />
                    
                    {/* Thanh công việc */}
                    <rect
                      x={bar.x}
                      y={bar.y + (ROW_HEIGHT - bar.height) / 2}
                      width={bar.width}
                      height={bar.height}
                      fill={barColor}
                      rx={4}
                    />
                    
                    {/* Tên công việc (nhỏ bên cạnh thanh) */}
                    <text
                      x={bar.x + bar.width + 8}
                      y={bar.y + ROW_HEIGHT / 2 + 4}
                      fontSize="11"
                      fill="#64748b"
                      fontWeight="500"
                    >
                      {bar.total_float > 0 ? `(Float: ${bar.total_float}d)` : ''}
                    </text>
                  </g>
                );
              })}
            </svg>

          </div>
        </div>
      </div>
    </div>
  );
}
