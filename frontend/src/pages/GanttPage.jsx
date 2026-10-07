import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../lib/api";
import { mapScheduleToGantt, generateTimelineTicks } from "../utils/ganttUtils";
import { AlertTriangle, RefreshCw, CalendarRange, Edit3 } from "lucide-react";
import { differenceInCalendarDays, parseISO, format } from "date-fns";
import TaskProgressModal from "../components/TaskProgressModal";

function formatDate(dateStr) {
  if (!dateStr) return "--";

  try {
    return format(parseISO(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

export default function GanttPage() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("day");
  const context = useOutletContext();
  const currentProject = context?.currentProject;

  // T-33: thanh đang được hover / focus / click
  const [activeBar, setActiveBar] = useState(null);
  // T-35: công việc được chọn để cập nhật tiến độ thực tế
  const [selectedTaskForProgress, setSelectedTaskForProgress] = useState(null);

  const PIXELS_PER_DAY = viewMode === "day" ? 30 : 5;

  const ROW_HEIGHT = 40;

  const currentProjectId = localStorage.getItem("currentProjectId") || 13;

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      try {
        await api.post(`/projects/${currentProjectId}/schedule/recalculate`);
      } catch (calcErr) {
        if (calcErr.response?.data?.code === "DEPENDENCY_CYCLE") {
          setError(calcErr.response.data.message);
          return;
        }
      }

      const res = await api.get(
        `/projects/${currentProjectId}/schedule-results`,
      );

      setTasks(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || "Lỗi tải tiến độ dự án");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  if (error) {
    return (
      <div className="flex-1 p-6 text-red-600 flex flex-col items-center justify-center bg-gray-50">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center gap-3">
          <AlertTriangle className="size-10 text-red-500" />

          <h2 className="text-lg font-bold text-red-700">
            Không thể vẽ sơ đồ thanh ngang theo trục thời gian
          </h2>

          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-500">
        <RefreshCw className="size-8 animate-spin mb-4 text-blue-500" />
        <p>Đang tải dữ liệu tiến độ...</p>
      </div>
    );
  }

  const validTasks = tasks.filter(
    (task) => task.early_start && task.early_finish,
  );

  if (validTasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">
          Dự án chưa có công việc nào hợp lệ để vẽ.
        </p>
      </div>
    );
  }

  const sortedStarts = [...validTasks].sort(
    (a, b) => new Date(a.early_start) - new Date(b.early_start),
  );

  const projectStartDate = sortedStarts[0].early_start;

  const projectEndDate = new Date(
    Math.max(...validTasks.map((task) => new Date(task.early_finish))),
  );

  const totalDays = differenceInCalendarDays(
    projectEndDate,
    parseISO(projectStartDate),
  );

  const ganttBars = mapScheduleToGantt(
    validTasks,
    projectStartDate,
    PIXELS_PER_DAY,
    ROW_HEIGHT,
  );

  const ticks = generateTimelineTicks(
    projectStartDate,
    totalDays + 14,
    viewMode,
    PIXELS_PER_DAY,
  );

  const maxRightX = Math.max(...ganttBars.map((bar) => bar.x + bar.width));

  const svgWidth = Math.max(
    maxRightX + 200,
    ticks[ticks.length - 1]?.x + 200 || 1000,
  );

  return (
    <div className="flex-1 h-[calc(100vh-73px)] bg-[#F3F6FB] text-[#0F1B3D] flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6 gap-6 max-w-[1672px] mx-auto w-full">
        {/* Hero Banner */}
        <div className="relative h-[115px] rounded-2xl overflow-hidden shrink-0 flex items-center p-6 shadow-sm">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1541888086425-d81bb19240f5?auto=format&fit=crop&q=80')",
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B3FA8] to-transparent opacity-95"></div>
          <div className="relative z-10 flex items-center gap-5">
            <div className="size-[60px] bg-[#1F63E0] rounded-xl flex items-center justify-center shadow-lg border border-white/20">
              <CalendarRange className="size-8 text-white" />
            </div>
            <div>
              <h1 className="text-white text-[30px] font-bold leading-tight">
                Tiến độ thi công (Gantt)
              </h1>
              <p className="text-white/90 text-[18px] font-medium mt-1.5">
                {currentProject
                  ? `Dự án: ${currentProject.name}`
                  : "Sơ đồ thanh ngang theo trục thời gian"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-white overflow-hidden rounded-2xl border border-[#E6EBF3] shadow-sm">
          {/* Toolbar */}
          <div className="min-h-[56px] h-auto py-2 border-b border-[#E6EBF3] bg-slate-50/50 flex flex-wrap items-center justify-between px-4 shrink-0 gap-3">
            <h1 className="font-bold text-gray-800 text-[15px] md:text-base hidden md:block">
              Sơ đồ thanh ngang
            </h1>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode("day")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === "day"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                Chế độ Ngày
              </button>

              <button
                onClick={() => setViewMode("week")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  viewMode === "week"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                Chế độ Tuần
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-slate-50 relative custom-scrollbar">
            <div className="flex w-max min-w-full">
              {/* CỘT TRÁI (Sticky Left) */}
              <div className="sticky left-0 z-20 bg-white border-r border-gray-200 flex flex-col shrink-0 w-[140px] md:w-[180px] lg:w-max lg:min-w-[250px] lg:max-w-[350px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                {/* Ô GÓC (Sticky Top & Left - Cao nhất) */}
                <div className="sticky top-0 z-30 h-20 bg-slate-50 border-b border-gray-200 flex items-center px-4 font-semibold text-sm text-gray-600 shrink-0">
                  Tên công việc
                </div>

                {/* Dòng tên công việc */}
                <div className="flex flex-col">
                  {ganttBars.map((bar) => (
                    <div
                      key={bar.id}
                      className={`px-2 md:px-4 text-[12px] md:text-[13px] truncate border-b border-slate-100 flex items-center gap-2 transition-colors cursor-default ${
                        activeBar?.id === bar.id ? "bg-slate-50" : "bg-white"
                      } ${
                        bar.is_critical
                          ? "font-bold text-red-700"
                          : "font-medium text-slate-700"
                      }`}
                      style={{ height: ROW_HEIGHT }}
                      title={bar.name}
                      onMouseEnter={() => setActiveBar(bar)}
                      onMouseLeave={() => setActiveBar(null)}
                    >
                      <div className="w-5 shrink-0 flex items-center justify-center">
                        {bar.is_critical ? (
                          <span
                            aria-label="Việc găng"
                            className="inline-flex size-4 items-center justify-center rounded-full bg-red-700 text-[10px] font-black text-white"
                          >
                            !
                          </span>
                        ) : (
                          <span className="size-1.5 rounded-full bg-slate-300" />
                        )}
                      </div>
                      <div className="truncate lg:whitespace-nowrap flex-1">
                        {bar.name}
                      </div>

                      <button
                        type="button"
                        aria-label={`Cập nhật tiến độ: ${bar.name}`}
                        title="Cập nhật tiến độ thực tế"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskForProgress(bar);
                        }}
                        className="opacity-70 hover:opacity-100 hover:text-blue-600 p-0.5 text-slate-400 cursor-pointer shrink-0"
                      >
                        <Edit3 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* CỘT PHẢI (Timeline & SVG) */}
              <div className="relative shrink-0" style={{ width: svgWidth }}>
                {/* HEADER TRỤC THỜI GIAN (Sticky Top) */}
                <div className="sticky top-0 z-10 h-20 bg-slate-50 border-b border-gray-200 w-full overflow-hidden relative">
                  {ticks.map((tick) => (
                    <div
                      key={tick.x}
                      className="absolute h-full flex flex-col justify-end pb-2 border-l border-gray-300 text-[10px] text-gray-500"
                      style={{
                        left: tick.x,
                        width: PIXELS_PER_DAY * (viewMode === "week" ? 7 : 1),
                      }}
                    >
                      <span className="whitespace-nowrap -rotate-45 origin-bottom-left ml-2 mb-1">
                        {tick.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* SVG GANTT BARS */}
                <svg
                  width={svgWidth}
                  height={ganttBars.length * ROW_HEIGHT}
                  className="block bg-slate-50"
                >
                  {/* Lưới dọc */}
                  {ticks.map((tick) => (
                    <line
                      key={`line-${tick.x}`}
                      x1={tick.x}
                      y1={0}
                      x2={tick.x}
                      y2="100%"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                  ))}

                  {ganttBars.map((bar) => {
                    const barColor = bar.is_critical ? "#ef4444" : "#3b82f6";
                    const progressPercent = Math.min(100, Math.max(0, bar.percent_complete || 0));
                    return (
                      <g key={bar.id}>
                        {/* nền của dòng */}
                        <rect
                          x={0}
                          y={bar.y}
                          width={svgWidth}
                          height={ROW_HEIGHT}
                          fill={
                            activeBar?.id === bar.id ? "#f8fafc" : "transparent"
                          }
                          stroke="#f1f5f9"
                          strokeWidth="1"
                        />

                        {/* T-32 + T-33 + T-35:
                        - việc găng có viền riêng
                        - có ký hiệu !
                        - có hover/click/touch/focus */}
                        <rect
                          data-testid={`gantt-bar-${bar.id}`}
                          x={bar.x}
                          y={bar.y + (ROW_HEIGHT - bar.height) / 2}
                          width={bar.width}
                          height={bar.height}
                          fill={barColor}
                          stroke={
                            bar.is_critical
                              ? "#dc2626" // red-600
                              : "#1d4ed8" // blue-700
                          }
                          strokeWidth={bar.is_critical ? 1.5 : 1}
                          rx={4}
                          role="button"
                          tabIndex={0}
                          aria-label={`${bar.name} - ${
                            bar.is_critical ? "Việc găng" : "Không găng"
                          }`}
                          style={{
                            cursor: "pointer",
                            outline: "none",
                          }}
                          onMouseEnter={() => setActiveBar(bar)}
                          onMouseLeave={() => setActiveBar(null)}
                          onFocus={() => setActiveBar(bar)}
                          onBlur={() => setActiveBar(null)}
                          onClick={() =>
                            setActiveBar(activeBar?.id === bar.id ? null : bar)
                          }
                          onDoubleClick={() => setSelectedTaskForProgress(bar)}
                          onTouchStart={() => setActiveBar(bar)}
                        />

                        {/* Phần trăm hoàn thành thực tế hiển thị trên thanh Gantt */}
                        {progressPercent > 0 && (
                          <rect
                            x={bar.x}
                            y={bar.y + (ROW_HEIGHT - bar.height) / 2}
                            width={(bar.width * progressPercent) / 100}
                            height={bar.height}
                            fill="#0f172a"
                            opacity="0.25"
                            rx={4}
                            pointerEvents="none"
                          />
                        )}

                        {/* T-32: ký hiệu riêng cho việc găng */}
                        {bar.is_critical && (
                          <>
                            <circle
                              data-testid={`critical-marker-${bar.id}`}
                              cx={bar.x + 8}
                              cy={bar.y + ROW_HEIGHT / 2}
                              r="5.5"
                              fill="#dc2626"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                              pointerEvents="none"
                            />

                            <text
                              x={bar.x + 8}
                              y={bar.y + ROW_HEIGHT / 2 + 3}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight="900"
                              fill="#ffffff"
                              pointerEvents="none"
                            >
                              !
                            </text>
                          </>
                        )}

                        {/* Float bên cạnh */}
                        <text
                          x={bar.x + bar.width + 8}
                          y={bar.y + ROW_HEIGHT / 2 + 4}
                          fontSize="11"
                          fill="#64748b"
                          fontWeight="500"
                          pointerEvents="none"
                        >
                          {bar.total_float > 0
                            ? `(Float: ${bar.total_float}d)`
                            : ""}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* T-33 + T-35: Tooltip chi tiết kèm nút mở form cập nhật tiến độ */}
                {activeBar && (
                  <div
                    role="tooltip"
                    className="pointer-events-auto absolute z-50 w-[390px] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
                    style={{
                      left: activeBar.x + 10,
                      top: 80 + activeBar.y + ROW_HEIGHT,
                    }}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      {activeBar.is_critical && (
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-red-700 text-xs font-black text-white">
                          !
                        </span>
                      )}

                      <span className="font-bold text-slate-900">
                        {activeBar.name}
                      </span>

                      {activeBar.is_critical && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                          Việc găng
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      <div>
                        <div className="font-bold text-slate-500">ES</div>
                        <div className="mt-1 text-slate-900">
                          {formatDate(activeBar.early_start)}
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-slate-500">EF</div>
                        <div className="mt-1 text-slate-900">
                          {formatDate(activeBar.early_finish)}
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-slate-500">LS</div>
                        <div className="mt-1 text-slate-900">
                          {formatDate(activeBar.late_start)}
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-slate-500">LF</div>
                        <div className="mt-1 text-slate-900">
                          {formatDate(activeBar.late_finish)}
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-slate-500">Float</div>

                        <div
                          className={`mt-1 ${
                            activeBar.total_float === 0
                              ? "font-bold text-red-600"
                              : "text-slate-900"
                          }`}
                        >
                          {activeBar.total_float != null
                            ? `${activeBar.total_float} ngày`
                            : "--"}
                        </div>
                      </div>
                    </div>

                    {/* T-35: Cập nhật tiến độ thực tế từ sơ đồ */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">
                        Tiến độ thực tế:{" "}
                        <strong className="text-blue-600 font-bold">
                          {activeBar.percent_complete ?? 0}%
                        </strong>
                      </div>

                      <button
                        type="button"
                        aria-label={`Cập nhật tiến độ: ${activeBar.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskForProgress(activeBar);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <Edit3 className="size-3.5" />
                        <span>Cập nhật tiến độ</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal form cập nhật tiến độ (T-35 / S-15) */}
        {selectedTaskForProgress && (
          <TaskProgressModal
            projectId={currentProjectId}
            task={selectedTaskForProgress}
            isOpen={Boolean(selectedTaskForProgress)}
            onClose={() => setSelectedTaskForProgress(null)}
            onSuccess={async () => {
              setSelectedTaskForProgress(null);
              setActiveBar(null);
              await fetchData();
            }}
          />
        )}
      </div>
    </div>
  );
}
