import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../lib/api";
import { mapScheduleToGantt, generateTimelineTicks } from "../utils/ganttUtils";
import { AlertTriangle, RefreshCw, CalendarRange, Edit3, X, Activity } from "lucide-react";
import { differenceInCalendarDays, parseISO, format } from "date-fns";
import TaskProgressModal from "../components/TaskProgressModal";
import GanttTaskDetailPanel from "../components/GanttTaskDetailPanel";
import { usePermission } from "../hooks/usePermission";
import { readSnapshot, writeSnapshot, isNetworkError, SNAPSHOT_TYPES } from "../services/offlineSnapshotCache";
import OfflineSnapshotBanner from "../components/OfflineSnapshotBanner";

function formatDate(dateStr) {
  if (!dateStr) return "--";

  try {
    return format(parseISO(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

// Module-level RAM snapshot cache: hiển thị ngay lập tức (0ms) khi chuyển menu, chống giật nháy
const ganttMemoryCache = new Map();
export function _clearGanttMemoryCache() {
  ganttMemoryCache.clear();
}

export default function GanttPage() {
  // Kế hoạch gốc: chỉ Ban quản lý. Cập nhật tiến độ: BQL / CHT / CĐT (KSGS, KT chỉ xem).
  const { can } = usePermission();
  const canLockBaseline = can("baseline.lock");
  const canUpdateProgress = can("progress.update");

  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const currentProjectId = String(currentProject?.id || localStorage.getItem("currentProjectId") || "1");
  const memCached = ganttMemoryCache.get(currentProjectId);

  const [tasks, setTasks] = useState(() => memCached?.tasks || []);
  const [dependencies, setDependencies] = useState(() => memCached?.dependencies || []);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(() => !memCached || !memCached.tasks || memCached.tasks.length === 0);
  const [scheduleSummary, setScheduleSummary] = useState(() => memCached?.scheduleSummary || null);
  const [calendar, setCalendar] = useState(() => memCached?.calendar || null);
  const [holidays, setHolidays] = useState(() => memCached?.holidays || []);
  const [isPolling, setIsPolling] = useState(false);
  const [viewMode, setViewMode] = useState(() => (typeof window !== "undefined" && window.innerWidth < 768 ? "week" : "day"));
  const [summary, setSummary] = useState(() => memCached?.summary || null);
  const [baselineBusy, setBaselineBusy] = useState(false);
  const [baselineMsg, setBaselineMsg] = useState(null);
  const [isFromCache, setIsFromCache] = useState(() => memCached?.isFromCache || false);
  const [cachedAt, setCachedAt] = useState(() => memCached?.cachedAt || null);
  const [cacheMiss, setCacheMiss] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false);
  const isReadOnly = isFromCache || !isOnline;
  const offlineMutationMessage = "Cần có mạng để thực hiện thao tác này";

  // T-33 / T-35: Thanh công việc đang được chọn để xem chi tiết trong Side Panel cố định bên phải
  const [activeBar, setActiveBar] = useState(null);

  // T-35: công việc được chọn để cập nhật tiến độ thực tế
  const [selectedTaskForProgress, setSelectedTaskForProgress] = useState(null);
  const scrollContainerRef = React.useRef(null);
  const leftColRef = React.useRef(null);
  const [containerWidth, setContainerWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  const [leftColWidth, setLeftColWidth] = useState(240);

  const ROW_HEIGHT = 40;

  // Đo đạc kích thước thực tế của vùng Gantt để tính toán thang thời gian và viewport
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const updateDimensions = () => {
      if (scrollContainerRef.current) {
        setContainerWidth(scrollContainerRef.current.clientWidth);
      }
      if (leftColRef.current) {
        setLeftColWidth(leftColRef.current.offsetWidth);
      }
    };
    updateDimensions();

    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(updateDimensions);
      ro.observe(scrollContainerRef.current);
      if (leftColRef.current) {
        ro.observe(leftColRef.current);
      }
    }
    window.addEventListener("resize", updateDimensions);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", updateDimensions);
    };
  }, [activeBar]);

  // Đảm bảo thanh công việc được chọn luôn nằm trong viewport nhìn thấy,
  // tự động cuộn ngang độc lập để thanh không bị cắt ở mép phải khi mở panel.
  const ensureBarInView = React.useCallback((bar, smooth = true) => {
    if (!bar || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const currentLeftColWidth = leftColRef.current ? leftColRef.current.offsetWidth : 240;
    const visibleWidth = Math.max(100, container.clientWidth - currentLeftColWidth);

    // Biên toạ độ của thanh công việc (tính cả nhãn float và ký hiệu phía sau)
    const barStart = typeof bar.x === "number" ? bar.x : 0;
    const barEnd = barStart + (bar.width || 80) + (bar.total_float > 0 ? 160 : 40);

    const currentScroll = container.scrollLeft;
    const visibleStart = currentScroll;
    const visibleEnd = currentScroll + visibleWidth;

    let targetScroll = currentScroll;

    if (barEnd > visibleEnd) {
      // Thanh bị khuất hoặc cắt ở mép phải -> Cuộn sang phải để đưa toàn bộ thanh vào trong tầm nhìn
      targetScroll = barEnd - visibleWidth + 60;
    } else if (barStart < visibleStart) {
      // Thanh bị che dưới cột tên công việc cố định bên trái -> Cuộn sang trái
      targetScroll = Math.max(0, barStart - 40);
    }

    if (targetScroll !== currentScroll) {
      if (typeof container.scrollTo === "function") {
        container.scrollTo({
          left: Math.max(0, targetScroll),
          behavior: smooth ? "smooth" : "auto",
        });
      } else {
        container.scrollLeft = Math.max(0, targetScroll);
      }
    }
  }, []);

  // Tự động điều chỉnh viewport khi mở hoặc chọn công việc để tránh bị cắt ở mép phải
  useEffect(() => {
    if (!activeBar) return;
    const timer = setTimeout(() => {
      ensureBarInView(activeBar, true);
    }, 80);

    return () => clearTimeout(timer);
  }, [activeBar, containerWidth, ensureBarInView]);

  // Đóng side panel khi nhấn phím Escape
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setActiveBar(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Cập nhật lại thông tin trong activeBar khi danh sách tasks thay đổi (ví dụ sau khi cập nhật tiến độ)
  React.useEffect(() => {
    setActiveBar((prev) => {
      if (!prev) return null;
      const updated = tasks.find((t) => t.id === prev.id);
      if (!updated) return prev;
      if (
        prev.percent_complete === updated.percent_complete &&
        prev.actual_start_date === updated.actual_start_date &&
        prev.actual_end_date === updated.actual_end_date &&
        prev.early_start === updated.early_start &&
        prev.early_finish === updated.early_finish
      ) {
        return prev;
      }
      return { ...prev, ...updated };
    });
  }, [tasks]);

  const fetchSeqRef = React.useRef(0);
  const previousProjectIdRef = React.useRef(null);

  const fetchData = async () => {
    const mySeq = ++fetchSeqRef.current;
    const myProjectId = currentProjectId;
    const isStale = () =>
      mySeq !== fetchSeqRef.current ||
      String(myProjectId) !== String(currentProject?.id || localStorage.getItem("currentProjectId") || "1");

    const isProjectChanged = previousProjectIdRef.current !== null && previousProjectIdRef.current !== myProjectId;
    previousProjectIdRef.current = myProjectId;

    if (isProjectChanged) {
      setTasks([]);
      setDependencies([]);
      setSummary(null);
      setScheduleSummary(null);
      setCalendar(null);
      setHolidays([]);
      setError(null);
      setIsFromCache(false);
      setCachedAt(null);
      setCacheMiss(false);
      setSelectedTaskForProgress(null);
      setActiveBar(null);
    }

    try {
      if (tasks.length === 0 || isProjectChanged) {
        setLoading(true);
      }

      // SWR: Tải nhanh từ offline snapshot cache nếu có dữ liệu sẵn của dự án này,
      // giúp hiển thị tức thì (0ms) mà không bị màn hình trống hoặc chớp empty state trong 2-3s
      try {
        const localSnapshot = await readSnapshot(myProjectId, SNAPSHOT_TYPES.GANTT);
        if (!isStale() && localSnapshot?.payload?.tasks?.length > 0) {
          const payload = localSnapshot.payload;
          const snapObj = {
            tasks: payload.tasks || [],
            dependencies: payload.dependencies || [],
            summary: payload.summary || null,
            scheduleSummary: payload.scheduleSummary || null,
            calendar: payload.calendar || null,
            holidays: payload.holidays || [],
            isFromCache: true,
            cachedAt: localSnapshot.saved_at,
          };
          ganttMemoryCache.set(myProjectId, snapObj);
          setTasks(snapObj.tasks);
          setDependencies(snapObj.dependencies);
          setSummary(snapObj.summary);
          if (snapObj.scheduleSummary) setScheduleSummary(snapObj.scheduleSummary);
          if (snapObj.calendar) setCalendar(snapObj.calendar);
          if (snapObj.holidays) setHolidays(snapObj.holidays);
          setLoading(false);
        }
      } catch {
        /* ignore snapshot cache read error */
      }

      if (!navigator.onLine) {
        const snapshot = await readSnapshot(myProjectId, SNAPSHOT_TYPES.GANTT);
        if (isStale()) return;
        if (snapshot?.payload?.tasks) {
          const payload = snapshot.payload;
          setTasks(payload.tasks || []);
          setDependencies(payload.dependencies || []);
          setSummary(payload.summary || null);
          setScheduleSummary(payload.scheduleSummary || null);
          setCalendar(payload.calendar || null);
          setHolidays(payload.holidays || []);
          setIsFromCache(true);
          setCachedAt(snapshot.cachedAt);
          setIsOnline(false);
        } else {
          setCacheMiss(true);
          setIsOnline(false);
        }
        return;
      }
      setError(null);

      let calcErrObj = null;
      let shouldFetchResults = true;

      try {
        const calcRes = await api.post(`/projects/${myProjectId}/schedule/recalculate`);

        if (calcRes.status === 202 && calcRes.data?.jobId) {
          setIsPolling(true);
          let jobStatus = 'queued';
          let currentDelay = 1000;
          let jobErrorDetails = null;

          while (jobStatus === 'queued' || jobStatus === 'running') {
            await new Promise(r => setTimeout(r, currentDelay));
            try {
              const jobRes = await api.get(`/projects/${myProjectId}/schedule-jobs/${calcRes.data.jobId}`);
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
          api.get(`/projects/${myProjectId}/schedule-results`),
          api.get(`/projects/${myProjectId}/schedule-summary`).catch(() => ({ data: null })),
          api.get(`/projects/${myProjectId}/calendar`).catch(() => ({ data: { calendar: null } })),
          api.get(`/projects/${myProjectId}/holidays`).catch(() => ({ data: { holidays: [] } }))
        ]);
        if (isStale()) return;
        const freshTasks = res.data.data || [];
        const freshDeps = res.data.dependencies || [];
        const freshSummary = res.data.summary || null;
        const freshSchedSummary = summaryRes.data || null;
        const freshCal = calRes.data?.calendar || null;
        const freshHolidays = holRes.data?.holidays || [];

        ganttMemoryCache.set(myProjectId, {
          tasks: freshTasks,
          dependencies: freshDeps,
          summary: freshSummary,
          scheduleSummary: freshSchedSummary,
          calendar: freshCal,
          holidays: freshHolidays,
          isFromCache: false,
          cachedAt: null,
        });

        setTasks(freshTasks);
        setDependencies(freshDeps);
        setSummary(freshSummary);
        if (freshSchedSummary) {
          setScheduleSummary(freshSchedSummary);
        }
        if (freshCal) {
          setCalendar(freshCal);
        }
        if (freshHolidays) {
          setHolidays(freshHolidays);
        }
        await writeSnapshot(myProjectId, SNAPSHOT_TYPES.GANTT, {
          tasks: freshTasks,
          dependencies: freshDeps,
          summary: freshSummary,
          scheduleSummary: freshSchedSummary,
          calendar: freshCal,
          holidays: freshHolidays,
        });
        setIsFromCache(false);
        setCachedAt(null);
        setCacheMiss(false);
        setIsOnline(true);
      }
    } catch (err) {
      if (isNetworkError(err)) {
        setIsOnline(false);
        const snapshot = await readSnapshot(myProjectId, SNAPSHOT_TYPES.GANTT);
        if (isStale()) return;
        if (snapshot?.payload?.tasks) {
          const payload = snapshot.payload;
          setTasks(payload.tasks || []);
          setDependencies(payload.dependencies || []);
          setSummary(payload.summary || null);
          setScheduleSummary(payload.scheduleSummary || null);
          setCalendar(payload.calendar || null);
          setHolidays(payload.holidays || []);
          setIsFromCache(true);
          setCachedAt(snapshot.cachedAt);
        } else {
          setCacheMiss(true);
        }
      } else {
        setError(err.response?.data?.message || "Lỗi tải tiến độ dự án");
      }
    } finally {
      if (!isStale()) {
        setLoading(false);
        setIsPolling(false);
      }
    }
  };
  const handleCreateBaseline = async () => {
    if (isReadOnly) { setBaselineMsg(offlineMutationMessage); return; }
    try {
      setBaselineBusy(true);
      setBaselineMsg(null);
      await api.post(`/projects/${currentProjectId}/baselines/freeze`);
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

  useEffect(() => {
    if (!activeBar) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") setActiveBar(null);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [activeBar]);

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

  if ((loading && tasks.length === 0) || (isPolling && tasks.length === 0)) {
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
    [t.early_start, t.planned_early_start].filter(Boolean),
  );
  const projectStartDate = allStarts.reduce((min, d) =>
    new Date(d) < new Date(min) ? d : min,
  );

  const projectEndDate = new Date(
    Math.max(
      ...validTasks.flatMap((t) =>
        [t.early_finish, t.planned_early_finish].filter(Boolean).map((d) => new Date(d)),
      ),
    ),
  );

  const totalDays = differenceInCalendarDays(
    projectEndDate,
    parseISO(projectStartDate),
  );

  const availableTimelineWidth = Math.max(260, containerWidth - leftColWidth);

  // Tính số pixel mỗi ngày tuỳ theo chế độ hiển thị:
  // - fit (Vừa vặn): Tự động co giãn theo chiều rộng khả dụng của vùng Gantt
  // - day (Ngày): 30px / ngày
  // - week (Tuần): 6px / ngày
  const calculatedDays = Math.max(1, totalDays + 3);
  const fitPpd = Math.max(12, Math.floor(Math.max(160, availableTimelineWidth - 160) / calculatedDays));
  const PIXELS_PER_DAY = viewMode === "fit" ? fitPpd : viewMode === "week" ? 6 : 30;

  const scrollToToday = () => {
    if (!scrollContainerRef.current || !projectStartDate) return;
    try {
      const daysFromStart = differenceInCalendarDays(new Date(), parseISO(projectStartDate));
      const todayX = Math.max(0, daysFromStart * PIXELS_PER_DAY);
      if (typeof scrollContainerRef.current.scrollTo === "function") {
        scrollContainerRef.current.scrollTo({ left: Math.max(0, todayX - 120), behavior: "smooth" });
      } else {
        scrollContainerRef.current.scrollLeft = Math.max(0, todayX - 120);
      }
    } catch (e) {
      console.error("Scroll to today error:", e);
    }
  };

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
    0,
    ...ganttBars.map((bar) =>
      Math.max(bar.x + bar.width, bar.baseline ? bar.baseline.x + bar.baseline.width : 0),
    ),
  );

  const svgWidth = Math.max(
    maxRightX + 260,
    (ticks[ticks.length - 1]?.x || 0) + 260,
    availableTimelineWidth,
  );

  return (
    <div className="flex-1 min-h-0 bg-[#F3F6FB] text-[#0F1B3D] flex flex-col overflow-y-auto">
      <div className="flex-1 min-h-0 flex flex-col p-3.5 sm:p-6 pb-24 lg:pb-6 gap-4 sm:gap-6 max-w-[1672px] mx-auto w-full">
        {/* Hero Banner */}
        <div className="relative min-h-[105px] rounded-2xl overflow-hidden shrink-0 flex items-center p-4 sm:p-6 shadow-sm">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1541888086425-d81bb19240f5?auto=format&fit=crop&q=80')",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B3FA8] via-[#0B3FA8]/90 to-transparent" />
          <div className="relative z-10 flex w-full flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="size-11 sm:size-[60px] bg-[#1F63E0] rounded-xl flex items-center justify-center shadow-lg border border-white/20 shrink-0">
                <CalendarRange className="size-6 sm:size-8 text-white" />
              </div>
              <div>
                <h1 className="text-white text-lg sm:text-[26px] md:text-[30px] font-bold leading-tight">
                  Tiến độ thi công (Gantt)
                </h1>
                <p className="text-white/90 text-xs sm:text-sm md:text-base font-medium mt-1 flex flex-wrap items-center gap-2">
                  <span>
                    {currentProject
                      ? `Dự án: ${currentProject.name}`
                      : "Sơ đồ thanh ngang theo trục thời gian"}
                  </span>
                  {scheduleSummary && scheduleSummary.planned_finish_date && scheduleSummary.current_finish_date && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
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

            {/* Chú giải trạng thái công việc (nằm phía bên phải của banner màu xanh) */}
            <div className="flex items-center flex-wrap gap-2 sm:gap-2.5 sm:justify-end">
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-white shadow-xs shrink-0">
                <div className="size-3.5 rounded-[4px] bg-blue-400 border border-white/40" />
                <span className="text-xs font-semibold text-white">Không găng</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-white shadow-xs shrink-0">
                <div className="size-3.5 rounded-[4px] bg-red-500 border border-white/40 flex items-center justify-center text-[9px] font-bold text-white">!</div>
                <span className="text-xs font-semibold text-red-100">Việc găng</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-white shadow-xs shrink-0">
                <div className="size-3.5 rounded-[4px] bg-orange-400 border border-white/40 flex items-center justify-center text-[9px] font-bold text-white">!</div>
                <span className="text-xs font-semibold text-orange-100">Găng mới</span>
              </div>
              {summary?.hasBaseline && (
                <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-white shadow-xs shrink-0">
                  <span className="inline-block h-1.5 w-4 rounded bg-white/70" />
                  <span className="text-xs font-semibold text-white">Kế hoạch gốc</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <OfflineSnapshotBanner isFromCache={isFromCache} cachedAt={cachedAt} cacheMiss={cacheMiss} pageName="Gantt" />

        <div className="flex-1 flex flex-col bg-white overflow-hidden rounded-2xl border border-[#E6EBF3] shadow-sm">
          {/* Toolbar */}
          <div className="min-h-[52px] h-auto py-2 border-b border-[#E6EBF3] bg-slate-50/50 flex flex-wrap items-center justify-between px-3 sm:px-4 shrink-0 gap-2.5">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-gray-800 text-sm md:text-base hidden sm:block">
                Sơ đồ thanh ngang
              </h2>
              {isPolling && !summary && (
                <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full font-medium">
                  <RefreshCw className="size-3.5 animate-spin" />
                  Đang tính lại...
                </div>
              )}
              {summary && (
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg shadow-xs">
                  <span>Hoàn thành hiện tại: <strong>{formatDate(summary.currentFinish ?? summary.actualFinish)}</strong></span>
                  <span className="text-slate-300">•</span>
                  <span>KH: <strong>{formatDate(summary.plannedFinish)}</strong></span>
                  <span className="text-slate-300">•</span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold ${
                    summary.status === 'late' ? 'bg-red-100 text-red-700' :
                    summary.status === 'early' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {summary.status === 'late' && <AlertTriangle className="size-3" />}
                    {summary.status === 'late' ? `Chậm ${summary.delayWorkingDays} ngày` :
                     summary.status === 'early' ? `Sớm ${Math.abs(summary.delayWorkingDays)} ngày` :
                     'Đúng hạn'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={scrollToToday}
                className="px-2.5 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-blue-600 cursor-pointer shadow-2xs"
                title="Nhảy tới ngày hiện tại"
              >
                Hôm nay
              </button>

              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode("fit")}
                  className={`px-2.5 h-8 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === "fit"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                  title="Tự động co giãn theo chiều rộng màn hình"
                >
                  Vừa vặn
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("day")}
                  className={`px-2.5 h-8 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === "day"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Ngày
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("week")}
                  className={`px-2.5 h-8 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === "week"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Tuần
                </button>
              </div>
            </div>
          </div>
          {summary && (
            <div
              data-testid="baseline-hint"
              className={`px-4 py-2 ${
                summary.hasBaseline ? "bg-slate-50 border-b border-slate-200 text-slate-600" : "bg-amber-50 border-b border-amber-200 text-amber-800"
              } text-sm flex flex-wrap items-center gap-3`}
            >
              <span>{summary.hasBaseline ? (canLockBaseline ? "Kế hoạch gốc đã được chốt. Bạn có thể chốt lại bản mới nếu có thay đổi lớn." : "Kế hoạch gốc đã được chốt.") : "Chưa chốt kế hoạch gốc nên chưa có thanh so sánh."}</span>
              {canLockBaseline && (
              <button
                type="button"
                onClick={handleCreateBaseline}
                disabled={baselineBusy || isReadOnly}
                className={`px-3 min-h-11 rounded-lg text-white text-xs font-semibold disabled:opacity-60 ${
                  summary.hasBaseline ? "bg-slate-600 hover:bg-slate-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {baselineBusy ? "Đang xử lý..." : (summary.hasBaseline ? "Cập nhật Kế hoạch gốc" : "Chốt kế hoạch gốc")}
              </button>
              )}
              {baselineMsg && <span className="text-red-600 font-medium">{baselineMsg}</span>}
            </div>
          )}
          {/* KHUNG HIỂN THỊ CHÍNH: Biểu đồ Gantt bên trái + Side Panel cố định bên phải */}
          <div className="flex-1 flex min-h-0 overflow-hidden relative">
            <div ref={scrollContainerRef} className="flex-1 min-w-0 overflow-auto bg-slate-50 relative custom-scrollbar">
              <div className="flex w-max min-w-full">
                {/* CỘT TRÁI (Sticky Left) */}
                <div
                  ref={leftColRef}
                  className="sticky left-0 z-20 bg-white border-r border-gray-200 flex flex-col shrink-0 w-[110px] sm:w-[150px] md:w-[180px] lg:w-max lg:min-w-[220px] lg:max-w-[320px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                >
                  {/* Ô GÓC (Sticky Top & Left - Cao nhất) */}
                  <div className="sticky top-0 z-30 h-20 bg-slate-50 border-b border-gray-200 flex items-center px-2.5 sm:px-4 font-semibold text-xs sm:text-sm text-gray-600 shrink-0">
                    Tên công việc
                  </div>

                  {/* Dòng tên công việc */}
                  <div className="flex flex-col">
                    {ganttBars.map((bar) => (
                      <div
                        key={bar.id}
                        className={`px-2 md:px-4 text-[12px] md:text-[13px] truncate border-b border-slate-100 flex items-center gap-2 transition-colors cursor-pointer ${
                          activeBar?.id === bar.id ? "bg-blue-50/90 font-bold text-blue-900 border-l-4 border-l-blue-600 pl-1 md:pl-3" : "bg-white hover:bg-slate-50/80"
                        } ${
                          bar.is_critical && bar.was_critical_baseline === false
                            ? "text-orange-600"
                            : bar.is_critical
                            ? "text-red-700"
                            : "text-slate-700"
                          }`}
                        style={{ height: ROW_HEIGHT }}
                        title={bar.name}
                        onClick={() => setActiveBar(bar)}
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
                      <div className="truncate lg:whitespace-nowrap flex-1 flex items-center gap-2">
                        <span>{bar.name}</span>
                        {bar.has_baseline && bar.planned_early_finish && bar.early_finish && differenceInCalendarDays(parseISO(bar.early_finish), parseISO(bar.planned_early_finish)) > 0 && (
                          <span className="inline-flex items-center rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10" title={`+${differenceInCalendarDays(parseISO(bar.early_finish), parseISO(bar.planned_early_finish))} ngày so với kế hoạch gốc`}>
                            +{differenceInCalendarDays(parseISO(bar.early_finish), parseISO(bar.planned_early_finish))}d
                          </span>
                        )}
                      </div>

                      {canUpdateProgress && (
                      <button
                        type="button"
                        aria-label={`Cập nhật tiến độ: ${bar.name}`}
                        title={isReadOnly ? offlineMutationMessage : "Cập nhật tiến độ thực tế"}
                        disabled={isReadOnly}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isReadOnly) return;
                          setSelectedTaskForProgress(bar);
                          setActiveBar(null);
                        }}
                        className="flex min-h-11 min-w-11 items-center justify-center opacity-70 hover:opacity-100 hover:text-blue-600 text-slate-400 cursor-pointer shrink-0"
                      >
                        <Edit3 className="size-3.5" />
                      </button>
                      )}
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
                        width: PIXELS_PER_DAY * (viewMode === "week" ? 7 : (tick.step || 1)),
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
                  onClick={() => {
                    setActiveBar(null);
                  }}
                >
                  <defs>
                    <pattern id="hatch-pattern" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                      <line x1="0" y1="0" x2="0" y2="8" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.4" />
                    </pattern>
                  </defs>
                  
                  {/* Vẽ cột ngày nghỉ bằng dải màu xám */}
                  {ticks.map((tick) => 
                    tick.isNonWorkingDay && (viewMode === "day" || (viewMode === "fit" && PIXELS_PER_DAY >= 18)) ? (
                      <rect
                        key={`nw-${tick.x}`}
                        x={tick.x}
                        y={0}
                        width={PIXELS_PER_DAY}
                        height="100%"
                        fill="#F1F5F9"
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
                          }. Bắt đầu sớm: ${formatDate(bar.early_start)}, Kết thúc sớm: ${formatDate(bar.early_finish)}, Bắt đầu muộn: ${formatDate(bar.late_start)}, Kết thúc muộn: ${formatDate(bar.late_finish)}, Dự trữ thời gian: ${bar.total_float} ngày.`}
                          style={{
                            cursor: "pointer",
                            outline: "none",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveBar(bar);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (!canUpdateProgress || isReadOnly) return;
                            setSelectedTaskForProgress(bar);
                          }}
                        />

                        {/* T-32: Sọc chéo cho việc găng */}
                        {bar.is_critical && (
                          <rect
                            x={bar.x}
                            y={bar.y + (ROW_HEIGHT - bar.height) / 2}
                            width={bar.width}
                            height={bar.height}
                            fill="url(#hatch-pattern)"
                            rx={4}
                            style={{ pointerEvents: "none" }}
                          />
                        )}

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
              </div>
            </div>
          </div>

          {/* Side Panel hiển thị chi tiết công việc cố định bên phải (không che khuất biểu đồ) */}
          {activeBar && (
            <GanttTaskDetailPanel
              task={activeBar}
              onClose={() => setActiveBar(null)}
              onUpdateProgress={() => {
                if (isReadOnly) return;
                setSelectedTaskForProgress(activeBar);
              }}
              canUpdateProgress={canUpdateProgress}
              isReadOnly={isReadOnly}
              offlineMutationMessage={offlineMutationMessage}
              allTasks={validTasks}
              dependencies={dependencies}
              onSelectTask={(nextTask) => {
                const targetBar = ganttBars.find((b) => b.id === nextTask.id) || nextTask;
                setActiveBar(targetBar);
              }}
            />
          )}
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
