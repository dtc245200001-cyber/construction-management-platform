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
  const [dependencies, setDependencies] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduleSummary, setScheduleSummary] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [viewMode, setViewMode] = useState("day");
  const [summary, setSummary] = useState(null);
  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [baselineMsg, setBaselineMsg] = useState(null);

  // T-33: thanh đang được hover / focus / click
  const [activeBar, setActiveBar] = useState(null);
  // T-35: công việc được chọn để cập nhật tiến độ thực tế
  const [selectedTaskForProgress, setSelectedTaskForProgress] = useState(null);

  const PIXELS_PER_DAY = viewMode === "day" ? 30 : 5;

  const ROW_HEIGHT = 40;

  const currentProjectId = localStorage.getItem("currentProjectId") || 13;

  const fetchData = async () => {
    try {
      if (tasks.length === 0) setLoading(true);
      setError(null);

      let calcErrObj = null;
      let shouldFetchResults = true;

      try {
        const calcRes = await api.post(`/projects/${currentProjectId}/schedule/recalculate`);

        if (calcRes.status === 202 && calcRes.data?.jobId) {
          setIsPolling(true);
          let jobStatus = 'queued';
          let currentDelay = 1000;
          let jobErrorDetails = null;

          while (jobStatus === 'queued' || jobStatus === 'running') {
            await new Promise(r => setTimeout(r, currentDelay));
            try {
              const jobRes = await api.get(`/projects/${currentProjectId}/schedule-jobs/${calcRes.data.jobId}`);
              jobStatus = jobRes.data.job.status;
              if (jobStatus === 'failed') {
                jobErrorDetails = jobRes.data.job.error_details ? JSON.parse(jobRes.data.job.error_details) : { message: 'Lỗi không xác định' };
              }
              currentDelay = Math.min(currentDelay * 1.5, 5000);
            } catch (pollErr) {
              jobStatus = 'failed';
              jobErrorDetails = { message: 'Lỗi khi kiểm tra trạng thái' };
            }
          }
          setIsPolling(false);

          if (jobStatus === 'failed') {
            if (jobErrorDetails?.code === 'DEPENDENCY_CYCLE') {
              calcErrObj = jobErrorDetails.message;
            } else {
              calcErrObj = jobErrorDetails?.message || 'Lỗi tính toán lịch ngầm';
            }
            shouldFetchResults = false;
          }
        }
      } catch (calcErr) {
        if (calcErr.response?.data?.code === "DEPENDENCY_CYCLE") {
          calcErrObj = calcErr.response.data.message;
          shouldFetchResults = false;
        }
      }

      if (calcErrObj) {
        setError(calcErrObj);
        return;
      }

      if (shouldFetchResults) {
        const [res, summaryRes, calRes, holRes] = await Promise.all([
          api.get(`/projects/${currentProjectId}/schedule-results`),
          api.get(`/projects/${currentProjectId}/schedule-summary`).catch(() => ({ data: null })),
          api.get(`/projects/${currentProjectId}/calendar`).catch(() => ({ data: { calendar: null } })),
          api.get(`/projects/${currentProjectId}/holidays`).catch(() => ({ data: { holidays: [] } }))
        ]);
        setTasks(res.data.data || []);
        setDependencies(res.data.dependencies || []);
        setSummary(res.data.summary || null);
        if (summaryRes.data) {
          setScheduleSummary(summaryRes.data);
        }
        if (calRes.data?.calendar) {
          setCalendar(calRes.data.calendar);
        }
        if (holRes.data?.holidays) {
          setHolidays(holRes.data.holidays);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || "Lỗi tải tiến độ dự án");
    } finally {
      setLoading(false);
      setIsPolling(false);
    }
  };
  const handleCreateBaseline = async () => {
    try {
      setBaselineBusy(true);
      setBaselineMsg(null);
      await api.post(`/projects/${currentProjectId}/baselines`);
      const res = await api.get(`/projects/${currentProjectId}/schedule-results`);
      setTasks(res.data.data || []);
      setSummary(res.data.summary || null);
    } catch (err) {
      setBaselineMsg(
        err.response?.status === 403
          ? "Chỉ ban quản lý được chốt kế hoạch gốc"
          : err.response?.data?.message || "Không chốt được kế hoạch gốc"
      );
    } finally {
      setBaselineBusy(false);
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
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 gap-4">
        {error && error.includes("vòng") ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center gap-3">
            <AlertTriangle className="size-10 text-red-500" />
            <h2 className="text-lg font-bold text-red-700">
              Không thể vẽ sơ đồ do phát hiện vòng lặp
            </h2>
            <p className="text-sm">{error}</p>
          </div>
        ) : (
          <p className="text-gray-500">
            Dự án chưa có công việc nào hợp lệ để vẽ.
          </p>
        )}
      </div>
    );
  }

  const allStarts = validTasks.flatMap((t) =>
    [t.early_start, t.baseline_start].filter(Boolean),
  );
  const projectStartDate = allStarts.reduce((min, d) =>
    new Date(d) < new Date(min) ? d : min,
  );

  const projectEndDate = new Date(
    Math.max(
      ...validTasks.flatMap((t) =>
        [t.early_finish, t.baseline_finish].filter(Boolean).map((d) => new Date(d)),
      ),
    ),
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
    calendar,
    holidays
  );

  const maxRightX = Math.max(
    ...ganttBars.map((bar) =>
      Math.max(bar.x + bar.width, bar.baseline ? bar.baseline.x + bar.baseline.width : 0),
    ),
  );

  const svgWidth = Math.max(
    maxRightX + 200,
    ticks[ticks.length - 1]?.x + 200 || 1000,
  );

  return (
    <div className="flex-1 min-h-0 bg-[#F3F6FB] text-[#0F1B3D] flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 gap-6 max-w-[1672px] mx-auto w-full">
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
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-5">
            <div className="size-[60px] bg-[#1F63E0] rounded-xl flex items-center justify-center shadow-lg border border-white/20">
              <CalendarRange className="size-8 text-white" />
            </div>
            <div>
              <h1 className="text-white text-[30px] font-bold leading-tight">
                Tiến độ thi công (Gantt)
              </h1>
              <p className="text-white/90 text-[18px] font-medium mt-1.5 flex items-center gap-4">
                <span>
                  {currentProject
                    ? `Dự án: ${currentProject.name}`
                    : "Sơ đồ thanh ngang theo trục thời gian"}
                </span>
                {scheduleSummary && scheduleSummary.planned_finish_date && scheduleSummary.current_finish_date && (
                  <span className={`px-2.5 py-1 rounded-full text-sm font-bold ${
                    differenceInCalendarDays(
                      parseISO(scheduleSummary.current_finish_date),
                      parseISO(scheduleSummary.planned_finish_date)
                    ) > 0 
                      ? "bg-red-500/20 text-red-100 border border-red-500/30"
                      : "bg-green-500/20 text-green-100 border border-green-500/30"
                  }`}>
                    {differenceInCalendarDays(
                      parseISO(scheduleSummary.current_finish_date),
                      parseISO(scheduleSummary.planned_finish_date)
                    ) > 0 
                      ? `Trễ ${differenceInCalendarDays(
                          parseISO(scheduleSummary.current_finish_date),
                          parseISO(scheduleSummary.planned_finish_date)
                        )} ngày so với gốc`
                      : "Đúng tiến độ gốc"}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Chú thích màu sắc */}
          <div className="relative z-10 hidden lg:flex items-center gap-5 bg-white/10 backdrop-blur-md px-5 py-2.5 rounded-xl border border-white/20 shadow-sm ml-auto">
            <div className="flex items-center gap-2.5">
              <div className="size-4 rounded-[4px] bg-blue-500 border border-blue-600 shadow-sm"></div>
              <span className="text-white text-[13px] font-medium tracking-wide">Không găng</span>
            </div>
            <div className="w-[1px] h-4 bg-white/20"></div>
            <div className="flex items-center gap-2.5">
              <div className="relative size-4 rounded-[4px] bg-red-500 border border-red-600 shadow-sm flex items-center justify-center">
                <span className="text-[10px] font-black text-white">!</span>
              </div>
              <span className="text-white text-[13px] font-medium tracking-wide">Việc găng</span>
            </div>
            <div className="w-[1px] h-4 bg-white/20"></div>
            <div className="flex items-center gap-2.5">
              <div className="relative size-4 rounded-[4px] bg-orange-500 border border-orange-600 shadow-sm flex items-center justify-center">
                <span className="text-[10px] font-black text-white">!</span>
              </div>
              <span className="text-white text-[13px] font-medium tracking-wide">Găng (mới)</span>
            </div>
          </div>
        </div>
      </div>

        <div className="flex-1 flex flex-col bg-white overflow-hidden rounded-2xl border border-[#E6EBF3] shadow-sm">
          {/* Toolbar */}
          <div className="min-h-[56px] h-auto py-2 border-b border-[#E6EBF3] bg-slate-50/50 flex flex-wrap items-center justify-between px-4 shrink-0 gap-3">
            <div className="flex items-center gap-4">
              <h1 className="font-bold text-gray-800 text-[15px] md:text-base hidden md:block">
                Sơ đồ thanh ngang
              </h1>
              {isPolling && !summary && (
                <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full font-medium">
                  <RefreshCw className="size-4 animate-spin" />
                  Đang tính lại tiến độ...
                </div>
              )}
              {summary && (
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                  <span>Hoàn thành hiện tại {formatDate(summary.currentFinish ?? summary.actualFinish)}</span>
                  <span className="text-slate-300">•</span>
                  <span>Kế hoạch {formatDate(summary.plannedFinish)}</span>
                  <span className="text-slate-300">•</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${summary.status === 'late' ? 'bg-red-100 text-red-700' :
                    summary.status === 'early' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                    {summary?.hasBaseline && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="inline-block h-1 w-5 rounded bg-slate-500/50" />
                        Kế hoạch gốc
                      </span>
                    )}
                    {summary.status === 'late' && <AlertTriangle className="size-3" />}
                    {summary.status === 'late' ? `Chậm ${summary.delayWorkingDays} ngày` :
                      summary.status === 'early' ? `Sớm ${Math.abs(summary.delayWorkingDays)} ngày` :
                        'Đúng kế hoạch'}
                  </span>
                  {isPolling && (
                    <span className="text-xs text-slate-500 italic ml-1 flex items-center gap-1">
                      <RefreshCw className="size-3 animate-spin" />
                      đang cập nhật
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode("day")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${viewMode === "day"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
              >
                Chế độ Ngày
              </button>

              <button
                onClick={() => setViewMode("week")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${viewMode === "week"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
              >
                Chế độ Tuần
              </button>
            </div>
          </div>
          {summary && !summary.hasBaseline && (
            <div
              data-testid="baseline-hint"
              className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex flex-wrap items-center gap-3"
            >
              <span>Chưa chốt kế hoạch gốc nên chưa có thanh so sánh.</span>
              <button
                type="button"
                onClick={handleCreateBaseline}
                disabled={baselineBusy}
                className="px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-60"
              >
                {baselineBusy ? "Đang chốt..." : "Chốt kế hoạch gốc"}
              </button>
              {baselineMsg && <span className="text-red-600">{baselineMsg}</span>}
            </div>
          )}
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
                        bar.is_critical && bar.was_critical_baseline === false
                          ? "font-bold text-orange-600"
                          : bar.is_critical
                          ? "font-bold text-red-700"
                          : "font-medium text-slate-700"
                        }`}
                      style={{ height: ROW_HEIGHT }}
                      title={bar.name}
                      onMouseEnter={() => setActiveBar(bar)}
                      onMouseLeave={() => setActiveBar(null)}
                    >
                      <div className="w-5 shrink-0 flex items-center justify-center">
                        {bar.is_critical && bar.was_critical_baseline === false ? (
                          <span
                            aria-label="Việc găng mới"
                            className="inline-flex size-4 items-center justify-center rounded-full bg-orange-600 text-[10px] font-black text-white"
                            title="Việc mới bị đẩy thành găng"
                          >
                            !
                          </span>
                        ) : bar.is_critical ? (
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
                          setActiveBar(null);
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
                  onClick={() => setActiveBar(null)}
                >
                  {/* Vẽ cột ngày nghỉ bằng dải màu xám */}
                  {ticks.map((tick) => 
                    tick.isNonWorkingDay && viewMode === "day" ? (
                      <rect
                        key={`nw-${tick.x}`}
                        x={tick.x}
                        y={0}
                        width={PIXELS_PER_DAY}
                        height="100%"
                        fill="#cbd5e1"
                        opacity="0.3"
                      />
                    ) : null
                  )}

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

                  {/* 2. BACKGROUND ROWS & HORIZONTAL GRID */}
                  {ganttBars.map((bar) => (
                    <rect
                      key={`bg-${bar.id}`}
                      x={0}
                      y={bar.y}
                      width={svgWidth}
                      height={ROW_HEIGHT}
                      fill={activeBar?.id === bar.id ? "#f8fafc" : "transparent"}
                      stroke="#f1f5f9"
                      strokeWidth="1"
                    />
                  ))}


                  {/* 4. TASK BARS */}
                  {ganttBars.map((bar) => {
                    const isNewCritical = bar.is_critical && bar.was_critical_baseline === false;
                    const barColor = isNewCritical ? "#ea580c" : bar.is_critical ? "#ef4444" : "#3b82f6";
                    const strokeColor = isNewCritical ? "#c2410c" : bar.is_critical ? "#dc2626" : "#1d4ed8";
                    const progressPercent = Math.min(100, Math.max(0, bar.percent_complete || 0));
                    return (
                      <g key={`bar-${bar.id}`}>

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
                          stroke={strokeColor}
                          strokeWidth={bar.is_critical ? 1.5 : 1}
                          rx={4}
                          role="button"
                          tabIndex={0}
                          aria-label={`${bar.name} - ${
                            isNewCritical ? "Việc găng mới" : bar.is_critical ? "Việc găng" : "Không găng"
                          }`}
                          style={{
                            cursor: "pointer",
                            outline: "none",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveBar(bar);
                          }}
                          onMouseEnter={() => setActiveBar(bar)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setSelectedTaskForProgress(bar);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            setActiveBar(activeBar?.id === bar.id ? null : bar);
                          }}
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
                        {/* T-42: thanh kế hoạch gốc mờ, mỏng, nằm dưới thanh hiện tại */}
                        {bar.baseline && (
                          <rect
                            data-testid={`baseline-bar-${bar.id}`}
                            x={bar.baseline.x}
                            y={bar.y + (ROW_HEIGHT - bar.height) / 2 + bar.height + 2}
                            width={bar.baseline.width}
                            height={4}
                            fill="#64748b"
                            opacity="0.45"
                            rx={2}
                            pointerEvents="none"
                          />
                        )}

                        {/* T-32: ký hiệu riêng cho việc găng */}
                        {bar.newly_critical ? (
                          <>
                            <polygon
                              data-testid={`newly-critical-marker-${bar.id}`}
                              role="img"
                              aria-label="Việc mới trở thành găng"
                              points={`${bar.x + 8},${bar.y + ROW_HEIGHT / 2 - 6} ${bar.x + 8 + 6},${bar.y + ROW_HEIGHT / 2} ${bar.x + 8},${bar.y + ROW_HEIGHT / 2 + 6} ${bar.x + 8 - 6},${bar.y + ROW_HEIGHT / 2}`}
                              fill="#fef2f2"
                              stroke="#dc2626"
                              strokeWidth="1.5"
                              strokeDasharray="2,1"
                              pointerEvents="none"
                            />
                            <text
                              x={bar.x + 8}
                              y={bar.y + ROW_HEIGHT / 2 + 3}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight="900"
                              fill="#dc2626"
                              pointerEvents="none"
                            >
                              !
                            </text>
                          </>
                        ) : bar.is_critical ? (
                          <>
                            <circle
                              data-testid={`critical-marker-${bar.id}`}
                              cx={bar.x + 8}
                              cy={bar.y + ROW_HEIGHT / 2}
                              r="5.5"
                              fill={isNewCritical ? "#ea580c" : "#dc2626"}
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
                        ) : null}

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
                            ? `(Dự phòng: ${bar.total_float} ngày)`
                            : ""}
                        </text>
                      </g>
                    );
                  })}

                  {/* 4. SVG DIAGONAL / ORTHOGONAL LINES cho RÀNG BUỘC (Dependencies) */}
                  {dependencies.map((dep, index) => {
                    const pred = ganttBars.find(b => b.id === dep.predecessor_id);
                    const succ = ganttBars.find(b => b.id === dep.successor_id);
                    
                    if (!pred || !succ) return null;

                    const isHovered = activeBar && (activeBar.id === pred.id || activeBar.id === succ.id);
                    let pathD = "";
                    const arrowSize = 4;
                    // Tăng độ đậm để dễ nhìn hơn
                    const strokeColor = isHovered ? "#2563eb" : "#64748b";
                    const strokeWidth = isHovered ? "2.5" : "1.5";
                    const opacity = isHovered ? 1 : 0.6;

                    if (dep.dependency_type === 'FS') {
                      // Finish to Start
                      const startX = pred.x + pred.width;
                      const startY = pred.y + ROW_HEIGHT / 2;
                      const endX = succ.x;
                      const endY = succ.y + ROW_HEIGHT / 2;
                      
                      // Cố định độ phình của curve (gap) để tránh bị phình to như sợi mỳ khi khoảng cách xa
                      const gap = 20; 
                      
                      if (endX >= startX) {
                        pathD = `M ${startX} ${startY} C ${startX + gap} ${startY}, ${endX - gap} ${endY}, ${endX - arrowSize} ${endY}`;
                      } else {
                        // Vòng lặp ngược nếu task sau bắt đầu trước khi task trước kết thúc
                        pathD = `M ${startX} ${startY} C ${startX + gap} ${startY}, ${startX + gap} ${startY + ROW_HEIGHT/2}, ${startX} ${startY + ROW_HEIGHT/2} C ${endX - gap} ${startY + ROW_HEIGHT/2}, ${endX - gap} ${endY}, ${endX - arrowSize} ${endY}`;
                      }
                      
                      return (
                        <g key={`dep-${index}`} style={{ opacity, transition: 'opacity 0.2s' }}>
                          <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
                          <polygon 
                            points={`${endX},${endY} ${endX-arrowSize},${endY-arrowSize} ${endX-arrowSize},${endY+arrowSize}`} 
                            fill={strokeColor} 
                          />
                        </g>
                      );
                    }
                    
                    return null;
                  })}
                </svg>

                {/* T-33 + T-35: Tooltip chi tiết gọn nhẹ nằm TRÊN thanh công việc */}
                {activeBar && (
                  <div
                    role="tooltip"
                    className="pointer-events-auto absolute z-50 w-[280px] rounded-lg border border-slate-200 bg-white/95 backdrop-blur-sm p-3 shadow-xl"
                    style={{
                      left: Math.max(10, activeBar.x - 20),
                      top: Math.max(0, 80 + activeBar.y - 120), // Đẩy lên trên thanh bar
                    }}
                  >
                    <div className="flex flex-col gap-1.5">
                      {/* Dòng 1: Tên và Label */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-slate-800 text-[13px] leading-tight">
                          {activeBar.is_critical && activeBar.was_critical_baseline === false ? (
                            <span className="text-orange-600 mr-1">(!)</span>
                          ) : activeBar.is_critical ? (
                            <span className="text-red-600 mr-1">(!)</span>
                          ) : null}
                          {activeBar.name}
                        </div>
                        {activeBar.is_critical ? (
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${activeBar.was_critical_baseline === false ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                            {activeBar.was_critical_baseline === false ? 'Găng (mới)' : 'Găng'}
                          </span>
                        ) : null}
                      </div>

                      {/* Dòng 2: Thông số lưới */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Bắt đầu (ES):</span>
                          <span className="font-semibold text-slate-700">{formatDate(activeBar.early_start)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Kết thúc (EF):</span>
                          <span className="font-semibold text-slate-700">{formatDate(activeBar.early_finish)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Muộn nhất bắt đầu (LS):</span>
                          <span className="font-semibold text-slate-700">{formatDate(activeBar.late_start)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Muộn nhất kết thúc (LF):</span>
                          <span className="font-semibold text-slate-700">{formatDate(activeBar.late_finish)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Dự phòng (Float):</span>
                          <span className={`font-semibold ${activeBar.total_float === 0 ? 'text-red-600' : 'text-slate-700'}`}>
                            {activeBar.total_float != null ? `${activeBar.total_float} ngày` : '--'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Thực tế:</span>
                          <span className="font-semibold text-blue-600">{activeBar.percent_complete ?? 0}%</span>
                        </div>
                      </div>

                      {/* Dòng 3: Nút cập nhật (nhỏ gọn) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskForProgress(activeBar);
                          setActiveBar(null);
                        }}
                        className="mt-1.5 w-full py-1.5 text-[11px] font-semibold rounded bg-slate-100 text-blue-600 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5 border border-blue-100"
                      >
                        <Edit3 className="size-3" />
                        Cập nhật tiến độ
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
