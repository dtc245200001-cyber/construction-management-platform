import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import api from "../lib/api";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  HardHat,
  History,
  Layers,
  ListFilter,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  User,
  X,
  Zap,
} from "lucide-react";

function formatDate(value) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("vi-VN");
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekForOffset(weekOffset = 0) {
  const now = new Date();
  // Adjust base date by week offset
  const baseDate = new Date(now);
  baseDate.setDate(now.getDate() + weekOffset * 7);

  const monday = new Date(baseDate);
  const day = (baseDate.getDay() + 6) % 7;
  monday.setDate(baseDate.getDate() - day);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // Calculate week number
  const firstJan = new Date(monday.getFullYear(), 0, 1);
  const pastDays = (monday - firstJan) / 86400000;
  const weekNum = Math.ceil((pastDays + firstJan.getDay() + 1) / 7);

  return {
    start: toLocalDateString(monday),
    end: toLocalDateString(sunday),
    today: toLocalDateString(now),
    weekNumber: weekNum,
    displayRange: `${monday.getDate()}/${monday.getMonth() + 1} - ${sunday.getDate()}/${sunday.getMonth() + 1}/${sunday.getFullYear()}`,
    isCurrentWeek: weekOffset === 0,
  };
}

export default function FieldPage({ user }) {
  const currentProjectId = localStorage.getItem("currentProjectId");

  const isTeamLeader = user?.role === "doi_truong";
  const isSiteManager =
    user?.role === "chi_huy_truong" ||
    user?.role === "ban_quan_ly" ||
    user?.role === "chu_dau_tu";

  const [weekOffset, setWeekOffset] = useState(0);
  const [allTasksMode, setAllTasksMode] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks"); // "tasks" | "feed"

  const [team, setTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(isTeamLeader ? "" : "all");

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [quantities, setQuantities] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [notice, setNotice] = useState(null);

  // Feed for site managers
  const [feedReports, setFeedReports] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedDate, setFeedDate] = useState("");

  // History modal
  const [historyTask, setHistoryTask] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const currentWeek = getWeekForOffset(weekOffset);

  // =========================================================
  // LOAD TASKS
  // =========================================================

  const loadTasks = useCallback(async () => {
    if (!currentProjectId) {
      setLoading(false);
      return;
    }

    // Quản lý phải chọn đội hoặc "all"
    if (!isTeamLeader && !selectedTeamId) {
      setTeam(null);
      setTasks([]);
      setLoading(false);
      setError("");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const week = getWeekForOffset(weekOffset);
      const params = {
        week_start: week.start,
        week_end: week.end,
        report_date: week.today,
      };

      if (allTasksMode) {
        params.all_tasks = "true";
      }

      if (selectedTeamId && selectedTeamId !== "all") {
        params.team_id = selectedTeamId;
      } else if (selectedTeamId === "all") {
        params.team_id = "all";
      }

      const res = await api.get(
        `/projects/${currentProjectId}/my-team/tasks`,
        { params }
      );

      setTeam(res.data.team || null);
      setTasks(res.data.tasks || []);
    } catch (err) {
      setTeam(null);
      setTasks([]);
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể tải danh sách việc của đội"
      );
    } finally {
      setLoading(false);
    }
  }, [
    currentProjectId,
    isTeamLeader,
    selectedTeamId,
    weekOffset,
    allTasksMode,
  ]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // =========================================================
  // LOAD TEAMS (for managers)
  // =========================================================

  useEffect(() => {
    if (!currentProjectId || isTeamLeader) {
      return;
    }

    let cancelled = false;

    async function loadTeams() {
      try {
        const res = await api.get(
          `/projects/${currentProjectId}/teams`
        );
        if (cancelled) return;
        const rows = res.data?.teams || res.data || [];
        setTeams(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setTeams([]);
      }
    }

    loadTeams();
    return () => {
      cancelled = true;
    };
  }, [currentProjectId, isTeamLeader]);

  // =========================================================
  // LOAD LIVE FEED (S-26 AC 2 - Site Manager view)
  // =========================================================

  const loadFeedReports = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      setFeedLoading(true);
      const params = { limit: 100 };
      if (feedDate) {
        params.report_date = feedDate;
      }
      if (selectedTeamId && selectedTeamId !== "all") {
        params.team_id = selectedTeamId;
      }
      const res = await api.get(
        `/projects/${currentProjectId}/quantity-reports`,
        { params }
      );
      setFeedReports(res.data?.reports || []);
    } catch {
      setFeedReports([]);
    } finally {
      setFeedLoading(false);
    }
  }, [currentProjectId, feedDate, selectedTeamId]);

  useEffect(() => {
    if (activeTab === "feed") {
      loadFeedReports();
    }
  }, [activeTab, loadFeedReports]);

  // =========================================================
  // GLOVE-FRIENDLY STEPPERS & QUANTITY MANIPULATION
  // =========================================================

  const handleStepQuantity = (taskId, step) => {
    // Haptic feedback for touch devices
    if (typeof window !== "undefined" && window.navigator?.vibrate) {
      window.navigator.vibrate(25);
    }

    setQuantities((prev) => {
      const currentVal = Number(prev[taskId] || 0);
      const nextVal = Math.max(0, Math.round((currentVal + step) * 100) / 100);
      return {
        ...prev,
        [taskId]: nextVal === 0 ? "" : String(nextVal),
      };
    });
  };

  const handleClearQuantity = (taskId) => {
    setQuantities((prev) => ({
      ...prev,
      [taskId]: "",
    }));
  };

  // =========================================================
  // SUBMIT REPORT (S-26 AC 2 & AC 3)
  // =========================================================

  async function submitReport(task) {
    const raw = String(quantities[task.task_id] ?? "").trim();
    const quantity = Number(raw);

    if (
      raw === "" ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 9999999999.99
    ) {
      setNotice({
        type: "error",
        message:
          "Vui lòng nhập khối lượng lớn hơn 0 và không vượt giới hạn cho phép.",
      });
      return;
    }

    try {
      setSavingId(task.task_id);
      setNotice(null);

      const todayStr = toLocalDateString(new Date());

      const res = await api.post(
        `/projects/${currentProjectId}/tasks/${task.task_id}/quantity-reports`,
        {
          quantity: raw,
          report_date: todayStr,
        }
      );

      // S-26 AC 3: Khối lượng vượt vẫn lưu thành công nhưng có cảnh báo
      setNotice({
        type: res.data.warning ? "warning" : "success",
        message:
          res.data.warning ||
          res.data.message ||
          "Đã lưu báo cáo khối lượng thành công.",
      });

      // Clear input on success
      setQuantities((prev) => ({
        ...prev,
        [task.task_id]: "",
      }));

      // Reload tasks & feed
      await loadTasks();
      if (activeTab === "feed") {
        await loadFeedReports();
      }
    } catch (err) {
      setNotice({
        type: "error",
        message:
          err.response?.data?.message ||
          "Không thể lưu báo cáo khối lượng. Vui lòng thử lại.",
      });
    } finally {
      setSavingId(null);
    }
  }

  // =========================================================
  // REPORT HISTORY MODAL
  // =========================================================

  async function loadReportHistory(task) {
    try {
      setHistoryTask(task);
      setHistoryRows([]);
      setHistoryError("");
      setHistoryLoading(true);

      const res = await api.get(
        `/projects/${currentProjectId}/tasks/${task.task_id}/quantity-reports`
      );

      setHistoryRows(res.data?.reports || []);
    } catch (err) {
      setHistoryError(
        err.response?.data?.message ||
          "Không thể tải lịch sử báo cáo."
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    setHistoryTask(null);
    setHistoryRows([]);
    setHistoryError("");
  }

  // =========================================================
  // LOADING STATE
  // =========================================================

  if (loading && !tasks.length && !error) {
    return (
      <div className="flex min-h-[450px] flex-col items-center justify-center gap-3">
        <Loader2 className="size-10 animate-spin text-blue-600" />
        <p className="text-sm font-medium text-slate-500">
          Đang tải danh sách công việc của đội...
        </p>
      </div>
    );
  }

  // =========================================================
  // MAIN RENDER
  // =========================================================

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
      {/* ================= HEADER & ROLE BADGE ================= */}
      <div className="mb-4 rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-4 text-white shadow-lg sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow">
                <HardHat className="size-5" />
              </span>
              <h1 className="text-lg font-black tracking-tight text-white sm:text-2xl">
                Hiện trường & Báo cáo khối lượng
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs sm:text-sm text-slate-300">
              {isTeamLeader ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-2.5 py-1 font-semibold text-emerald-300 border border-emerald-500/30">
                  <User className="size-3.5" />
                  Đội trưởng thi công:{" "}
                  <strong className="text-white">
                    {team?.name || "Đang xác định đội..."}
                  </strong>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-300 border border-amber-500/30">
                  <Sparkles className="size-3.5" />
                  Giám sát hiện trường ({user?.role === "chi_huy_truong" ? "Chỉ huy trưởng" : "Ban quản lý"})
                </span>
              )}

              {team && !isTeamLeader && (
                <span className="rounded-lg bg-white/10 px-2 py-0.5 text-xs text-white">
                  Đang xem: {team.name}
                </span>
              )}
            </div>
          </div>

          {/* Quick Refresh Button */}
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => {
                loadTasks();
                if (activeTab === "feed") loadFeedReports();
              }}
              className="inline-flex min-h-12 min-w-12 touch-manipulation items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 active:scale-95"
              title="Tải lại dữ liệu"
              aria-label="Tải lại"
            >
              <RefreshCw className="size-4" />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </div>

        {/* Tab switch for site managers / ban quan ly */}
        {isSiteManager && (
          <div className="mt-4 flex gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setActiveTab("tasks")}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-bold transition ${
                activeTab === "tasks"
                  ? "bg-white text-slate-900 shadow"
                  : "bg-white/10 text-white hover:bg-white/15"
              }`}
            >
              <Layers className="size-4" />
              Việc của đội trong tuần
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("feed")}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-bold transition ${
                activeTab === "feed"
                  ? "bg-white text-slate-900 shadow"
                  : "bg-white/10 text-white hover:bg-white/15"
              }`}
            >
              <History className="size-4" />
              Nhật ký báo cáo hiện trường
            </button>
          </div>
        )}
      </div>

      {/* ================= CONTROLS BAR: WEEK NAV & TEAM SELECTOR ================= */}
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
        {/* Week navigation (AC 1: xem việc trong tuần) */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 active:scale-95"
            aria-label="Tuần trước"
            title="Tuần trước"
          >
            <ChevronLeft className="size-5" />
          </button>

          <div className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-blue-50/80 px-3 py-1.5 text-center sm:flex-initial">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-950">
              <CalendarDays className="size-4 shrink-0 text-blue-600" />
              <span>{currentWeek.displayRange}</span>
              {currentWeek.isCurrentWeek && (
                <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white uppercase">
                  Tuần này
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 active:scale-95"
            aria-label="Tuần sau"
            title="Tuần sau"
          >
            <ChevronRight className="size-5" />
          </button>

          {!currentWeek.isCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="min-h-11 rounded-xl border border-blue-200 bg-white px-3 text-xs font-bold text-blue-600 hover:bg-blue-50 active:scale-95"
            >
              Về tuần này
            </button>
          )}

          {/* Toggle all tasks */}
          <button
            type="button"
            onClick={() => setAllTasksMode(!allTasksMode)}
            className={`min-h-11 rounded-xl px-3 text-xs font-bold transition ${
              allTasksMode
                ? "bg-indigo-600 text-white shadow"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
            title="Bật/tắt lọc theo tuần"
          >
            {allTasksMode ? "Tất cả việc" : "Lọc tuần"}
          </button>
        </div>

        {/* Manager Team Selector */}
        {!isTeamLeader && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 whitespace-nowrap">
              Đội thi công:
            </label>
            <select
              value={selectedTeamId}
              onChange={(e) => {
                setSelectedTeamId(e.target.value);
                setNotice(null);
              }}
              className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 sm:w-56"
            >
              <option value="all">-- Tất cả các đội --</option>
              {teams.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ================= ALERTS & NOTICES ================= */}
      {notice && (
        <div
          role="alert"
          className={`mb-4 flex items-start justify-between gap-3 rounded-2xl border p-4 text-sm font-semibold shadow-sm transition ${
            notice.type === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : notice.type === "warning"
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-red-300 bg-red-50 text-red-900"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {notice.type === "success" && (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            )}
            {notice.type === "warning" && (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            )}
            {notice.type === "error" && (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
            )}
            <div className="leading-snug">{notice.message}</div>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded-lg p-1 text-slate-500 hover:bg-black/5"
            aria-label="Đóng thông báo"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      {/* ================= TAB 1: TASKS LIST ================= */}
      {activeTab === "tasks" && (
        <div>
          {/* Empty state */}
          {!error && tasks.length === 0 && (
            <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <HardHat className="size-8" />
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-800">
                Không có công việc nào trong tuần này
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                {allTasksMode
                  ? "Đội chưa được phân công công việc nào chưa hoàn thành."
                  : "Tuần này không có việc được giao. Bấm 'Tất cả việc' để xem toàn bộ danh sách."}
              </p>
              {!allTasksMode && (
                <button
                  type="button"
                  onClick={() => setAllTasksMode(true)}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow hover:bg-blue-700"
                >
                  Xem tất cả việc của đội
                </button>
              )}
            </div>
          )}

          {/* Task list: Sorted by Start Date, Critical Tasks Marked (AC 1) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {tasks.map((task) => {
              const planned =
                task.planned_quantity === null ||
                task.planned_quantity === undefined
                  ? null
                  : Number(task.planned_quantity);

              const cumulative = Number(task.cumulative_reported || 0);
              const currentInput = Number(quantities[task.task_id] || 0);
              const willExceed =
                planned !== null &&
                currentInput > 0 &&
                cumulative + currentInput > planned;

              return (
                <article
                  key={task.task_id}
                  className={`relative flex flex-col justify-between rounded-3xl border bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5 ${
                    task.is_critical
                      ? "border-l-8 border-red-500 border-slate-200 bg-gradient-to-br from-red-50/20 via-white to-white"
                      : "border-slate-200"
                  }`}
                >
                  {/* TOP HEADER: Task Title & Critical Path Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2
                            className={`text-base sm:text-lg ${
                              task.is_critical
                                ? "font-extrabold text-red-950"
                                : "font-bold text-slate-900"
                            }`}
                          >
                            {task.name}
                          </h2>

                          {/* AC 1: Việc găng có đánh dấu rõ ràng */}
                          {task.is_critical && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-black text-white shadow-sm animate-pulse">
                              <Zap className="size-3.5 fill-current" />
                              VIỆC GĂNG
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">
                            Hạng mục: {task.work_item_name}
                          </span>
                          {task.team_name && !isTeamLeader && (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 font-medium">
                              Đội: {task.team_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* METRICS GRID: Large, easy to read under sunlight */}
                    <div className="mt-3.5 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      {/* Ngày bắt đầu (AC 1) */}
                      <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                        <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          <CalendarDays className="size-3 text-blue-600" />
                          Bắt đầu
                        </div>
                        <div className="mt-1 font-bold text-slate-900 text-sm">
                          {formatDate(task.early_start)}
                        </div>
                      </div>

                      {/* Báo hôm nay (AC 2) */}
                      <div className="rounded-2xl bg-blue-50/70 p-3 border border-blue-100">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                          Hôm nay
                        </div>
                        <div className="mt-1 font-extrabold text-blue-900 text-sm">
                          {Number(task.reported_today || 0)}{" "}
                          <span className="text-xs font-semibold text-blue-700">
                            {task.quantity_unit || ""}
                          </span>
                        </div>
                      </div>

                      {/* Lũy kế đã báo (AC 2) */}
                      <div
                        className={`rounded-2xl p-3 border ${
                          task.over_planned
                            ? "bg-amber-50 border-amber-200"
                            : "bg-slate-50 border-slate-100"
                        }`}
                      >
                        <div
                          className={`text-[11px] font-bold uppercase tracking-wider ${
                            task.over_planned
                              ? "text-amber-800"
                              : "text-slate-500"
                          }`}
                        >
                          Lũy kế
                        </div>
                        <div
                          className={`mt-1 font-extrabold text-sm ${
                            task.over_planned
                              ? "text-amber-900"
                              : "text-slate-900"
                          }`}
                        >
                          {cumulative}{" "}
                          <span className="text-xs font-semibold">
                            {task.quantity_unit || ""}
                          </span>
                        </div>
                      </div>

                      {/* Kế hoạch */}
                      <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Kế hoạch
                        </div>
                        <div className="mt-1 font-bold text-slate-900 text-sm">
                          {planned === null
                            ? "Chưa đặt"
                            : `${planned} ${task.quantity_unit || ""}`}
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    {planned !== null && planned > 0 && (
                      <div className="mt-2.5">
                        <div className="flex justify-between text-[11px] font-bold text-slate-500 mb-1">
                          <span>Tiến độ khối lượng</span>
                          <span
                            className={
                              task.over_planned
                                ? "text-amber-700"
                                : "text-blue-700"
                            }
                          >
                            {Math.round((cumulative / planned) * 100)}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full transition-all duration-300 ${
                              task.over_planned
                                ? "bg-amber-500"
                                : "bg-blue-600"
                            }`}
                            style={{
                              width: `${Math.min(100, Math.round((cumulative / planned) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* AC 3: Cảnh báo vượt kế hoạch (persistent tag) */}
                    {task.over_planned && (
                      <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-50 p-2.5 text-xs font-bold text-amber-900 border border-amber-200">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <div>
                          Khối lượng lũy kế ({cumulative} {task.quantity_unit}) đã
                          vượt kế hoạch ({planned} {task.quantity_unit}). Phát sinh
                          đang được ghi nhận.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ================= GLOVE-FRIENDLY REPORTING SECTION ================= */}
                  <div className="mt-4 border-t border-slate-100 pt-3.5">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        Báo khối lượng hoàn thành hôm nay:
                      </label>
                      {task.quantity_unit && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                          Đơn vị: {task.quantity_unit}
                        </span>
                      )}
                    </div>

                    {/* Real-time over-planned preview warning (AC 3) */}
                    {willExceed && (
                      <div className="mb-2 rounded-xl bg-amber-100/80 p-2.5 text-xs font-bold text-amber-950 border border-amber-300">
                        ⚠️ Cảnh báo phát sinh: Nhập {currentInput} sẽ làm tổng lũy
                        kế ({Math.round((cumulative + currentInput) * 100) / 100}{" "}
                        {task.quantity_unit}) vượt khối lượng việc ({planned}{" "}
                        {task.quantity_unit}). Hệ thống vẫn sẽ lưu vì hiện trường
                        có phát sinh.
                      </div>
                    )}

                    {/* GLOVE-FRIENDLY QUICK STEPPERS (NFR: nút bấm lớn khi đeo găng) */}
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {[1, 5, 10, 50].map((step) => (
                        <button
                          key={step}
                          type="button"
                          onClick={() =>
                            handleStepQuantity(task.task_id, step)
                          }
                          className="min-h-11 flex-1 touch-manipulation rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-800 shadow-sm transition active:scale-95 hover:bg-slate-100 hover:border-slate-300"
                        >
                          +{step}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          handleStepQuantity(task.task_id, -1)
                        }
                        className="min-h-11 min-w-11 touch-manipulation rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-800 shadow-sm transition active:scale-95 hover:bg-slate-100"
                        title="Giảm 1"
                      >
                        -1
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearQuantity(task.task_id)}
                        className="min-h-11 min-w-11 touch-manipulation rounded-xl border border-red-200 bg-red-50 text-xs font-black text-red-700 shadow-sm transition active:scale-95 hover:bg-red-100"
                        title="Xóa ô nhập"
                      >
                        C
                      </button>
                    </div>

                    {/* Numeric Input & Save Button: Big touch target >= 54px */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          inputMode="decimal"
                          type="number"
                          min="0.01"
                          max="9999999999.99"
                          step="0.01"
                          value={quantities[task.task_id] ?? ""}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [task.task_id]: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                          className="min-h-[54px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-lg font-black text-blue-950 placeholder-slate-300 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                        />
                        {task.quantity_unit && (
                          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                            {task.quantity_unit}
                          </span>
                        )}
                      </div>

                      {/* SAVE BUTTON (AC 2: Khi lưu) */}
                      <button
                        type="button"
                        onClick={() => submitReport(task)}
                        disabled={
                          savingId === task.task_id ||
                          !quantities[task.task_id]
                        }
                        className="inline-flex min-h-[54px] min-w-[120px] touch-manipulation items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-extrabold text-white shadow-md transition hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {savingId === task.task_id ? (
                          <Loader2 className="size-5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-5" />
                        )}
                        <span>Lưu</span>
                      </button>
                    </div>

                    {/* BOTTOM ACTIONS: History & Last Report Timestamp (AC 2) */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <button
                        type="button"
                        onClick={() => loadReportHistory(task)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 font-bold text-slate-700 transition hover:bg-slate-100 active:scale-95"
                      >
                        <History className="size-3.5 text-blue-600" />
                        Lịch sử báo cáo
                      </button>

                      {task.last_reported_at && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                          <Clock className="size-3 text-slate-400" />
                          Gần nhất: {formatDateTime(task.last_reported_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= TAB 2: LIVE FEED FOR SITE MANAGERS (AC 2) ================= */}
      {activeTab === "feed" && isSiteManager && (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <History className="size-5 text-blue-600" />
                Nhật ký báo cáo khối lượng từ các đội
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Chỉ huy trưởng theo dõi thời điểm và tổng lũy kế đội đã báo theo thời gian thực
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={feedDate}
                onChange={(e) => setFeedDate(e.target.value)}
                className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-semibold"
              />
              {feedDate && (
                <button
                  type="button"
                  onClick={() => setFeedDate("")}
                  className="min-h-11 rounded-xl border border-slate-200 px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Xóa lọc
                </button>
              )}
            </div>
          </div>

          {feedLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <Loader2 className="size-8 animate-spin text-blue-600" />
            </div>
          ) : feedReports.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm font-semibold text-slate-500">
              Chưa có báo cáo khối lượng nào được gửi trong thời gian này.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-3">Thời điểm</th>
                    <th className="py-3 px-3">Đội thi công</th>
                    <th className="py-3 px-3">Công việc & Hạng mục</th>
                    <th className="py-3 px-3">Khối lượng báo</th>
                    <th className="py-3 px-3">Lũy kế / Kế hoạch</th>
                    <th className="py-3 px-3">Người báo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {feedReports.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition">
                      {/* Thời điểm (AC 2) */}
                      <td className="py-3 px-3 text-xs font-bold text-slate-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3 text-slate-400" />
                          {formatDateTime(row.created_at)}
                        </span>
                      </td>

                      {/* Đội */}
                      <td className="py-3 px-3 font-semibold text-slate-900">
                        {row.team_name}
                      </td>

                      {/* Công việc */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800">{row.task_name}</div>
                        <div className="text-[11px] text-slate-500">{row.work_item_name}</div>
                      </td>

                      {/* Khối lượng báo */}
                      <td className="py-3 px-3">
                        <span className="inline-flex rounded-lg bg-blue-50 px-2.5 py-1 text-sm font-extrabold text-blue-700">
                          +{row.quantity} {row.quantity_unit || ""}
                        </span>
                      </td>

                      {/* Lũy kế / Kế hoạch */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">
                          {row.cumulative_reported}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            / {row.planned_quantity ?? "Chưa đặt"} {row.quantity_unit || ""}
                          </span>
                        </div>
                        {row.over_planned && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <AlertTriangle className="size-2.5" /> Vượt KH
                          </span>
                        )}
                      </td>

                      {/* Người báo */}
                      <td className="py-3 px-3 text-xs text-slate-600">
                        {row.reported_by_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL: REPORT HISTORY ================= */}
      {historyTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-900">
                  <History className="size-5 text-blue-600" />
                  Lịch sử báo cáo khối lượng
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Công việc: <strong className="text-slate-800">{historyTask.name}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={closeHistory}
                className="flex size-11 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 active:scale-95"
                aria-label="Đóng"
              >
                <X className="size-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {historyLoading ? (
                <div className="flex min-h-40 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-blue-600" />
                </div>
              ) : historyError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {historyError}
                </div>
              ) : historyRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-semibold text-slate-500">
                  Chưa có báo cáo khối lượng nào cho công việc này.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[550px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-500">
                        <th className="py-2.5 px-3">Ngày báo</th>
                        <th className="py-2.5 px-3">Khối lượng</th>
                        <th className="py-2.5 px-3">Đội</th>
                        <th className="py-2.5 px-3">Người báo</th>
                        <th className="py-2.5 px-3">Ghi nhận lúc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historyRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="py-3 px-3 font-semibold text-slate-700">
                            {formatDate(row.report_date)}
                          </td>
                          <td className="py-3 px-3 font-extrabold text-blue-700">
                            +{row.quantity} {historyTask.quantity_unit || ""}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            {row.team_name || "--"}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            {row.reported_by_name || "--"}
                          </td>
                          <td className="py-3 px-3 text-xs text-slate-500">
                            {formatDateTime(row.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-200 p-4 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={closeHistory}
                className="min-h-12 w-full sm:w-auto rounded-xl bg-slate-900 px-6 font-bold text-white shadow hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}