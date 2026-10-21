import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import api from "../lib/api";
import { can, isValidRole, ROLES } from "../config/permissions";

import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HardHat,
  History,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  User,
  X,
} from "lucide-react";
import TaskLogModal from "../components/TaskLogModal";
import PageHeroBanner from "../components/PageHeroBanner";

function formatDate(value) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("vi-VN");
}

function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekForOffset(weekOffset = 0) {
  const now = new Date();
  const baseDate = new Date(now);
  baseDate.setDate(now.getDate() + weekOffset * 7);

  const monday = new Date(baseDate);
  const day = (baseDate.getDay() + 6) % 7;
  monday.setDate(baseDate.getDate() - day);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

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

export default function FieldPage({ user } = {}) {
  const currentProjectId = localStorage.getItem("currentProjectId");

  // Vai trò TRONG DỰ ÁN HIỆN TẠI (membership) — chỉ dùng membership/cache,
  // KHÔNG fallback sang user.role hệ thống (tài khoản mới là Khách).
  const [projectRole, setProjectRole] = useState(() => {
    try {
      if (currentProjectId) {
        return localStorage.getItem(`project_role_${currentProjectId}`) || undefined;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  });

  const canViewAll = can(projectRole, "field.viewAll");
  const canReport = can(projectRole, "field.report") || projectRole === ROLES.DOI_TRUONG;
  const isTeamLeader =
    (isValidRole(projectRole) && !canViewAll) ||
    projectRole === ROLES.DOI_TRUONG;

  const [weekOffset, setWeekOffset] = useState(0);
  const [allTasksMode, setAllTasksMode] = useState(false);
  const [viewAllTeams, setViewAllTeams] = useState(false);

  const [team, setTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [quantities, setQuantities] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [notice, setNotice] = useState(null);

  // History modal
  const [historyTask, setHistoryTask] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // Task log / photo attachments
  const [logTask, setLogTask] = useState(null);

  const currentWeek = getWeekForOffset(weekOffset);

  // =========================================================
  // LOAD PROJECT ROLE (membership trong dự án hiện tại)
  // =========================================================
  useEffect(() => {
    if (!currentProjectId) return;

    let cancelled = false;

    api
      .get(`/projects/${currentProjectId}`)
      .then((res) => {
        if (!cancelled) {
          const role = res.data?.membership || null;
          setProjectRole(role);
          try {
            if (role) localStorage.setItem(`project_role_${currentProjectId}`, role);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectRole(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentProjectId]);

  // =========================================================
  // LOAD TASKS
  // =========================================================
  const loadTasks = useCallback(async () => {
    if (!currentProjectId) {
      setLoading(false);
      return;
    }

    if (projectRole === undefined) {
      return;
    }

    // Quản lý phải chọn đội hoặc "all"
    if (!isTeamLeader && !viewAllTeams && !selectedTeamId) {
      setTeam(null);
      setTasks([]);
      setLoading(false);
      setError("");
      return;
    }

    const cacheKey = `field_tasks_${currentProjectId}_${viewAllTeams ? "all" : selectedTeamId || "my"}_${weekOffset}_${allTasksMode}`;

    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached && Array.isArray(cached.tasks)) {
        setTeam(cached.team || null);
        setTasks(cached.tasks);
        setLoading(false);
      }
    } catch {
      /* ignore */
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

      if (!isTeamLeader && viewAllTeams) {
        const res = await api.get(`/projects/${currentProjectId}/teams/all/tasks`, { params });
        setTeam(null);
        setTasks(res.data.tasks || []);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ team: null, tasks: res.data.tasks || [] }));
        } catch {
          /* ignore */
        }
        return;
      }

      if (selectedTeamId && selectedTeamId !== "all") {
        params.team_id = selectedTeamId;
      } else if (selectedTeamId === "all") {
        params.team_id = "all";
      }

      const res = await api.get(`/projects/${currentProjectId}/my-team/tasks`, { params });

      setTeam(res.data.team || null);
      setTasks(res.data.tasks || []);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ team: res.data.team || null, tasks: res.data.tasks || [] }));
      } catch {
        /* ignore */
      }
    } catch (err) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
        if (cached && Array.isArray(cached.tasks)) {
          setTeam(cached.team || null);
          setTasks(cached.tasks);
          setError("");
          return;
        }
      } catch {
        /* ignore */
      }

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
    projectRole,
    selectedTeamId,
    viewAllTeams,
    weekOffset,
    allTasksMode,
    user?.role,
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

    const cacheKey = `field_teams_${currentProjectId}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (Array.isArray(cached) && cached.length > 0) {
        setTeams(cached);
      }
    } catch {
      /* ignore */
    }

    let cancelled = false;

    async function loadTeams() {
      try {
        const res = await api.get(`/projects/${currentProjectId}/teams`);
        if (cancelled) return;
        const rows = res.data?.teams || res.data || [];
        const teamList = Array.isArray(rows) ? rows : [];
        setTeams(teamList);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(teamList));
        } catch {
          /* ignore */
        }
      } catch {
        if (!cancelled) {
          try {
            const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
            if (Array.isArray(cached) && cached.length > 0) {
              setTeams(cached);
              return;
            }
          } catch {
            /* ignore */
          }
          setTeams([]);
        }
      }
    }

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [currentProjectId, isTeamLeader]);

  // =========================================================
  // GLOVE-FRIENDLY QUICK STEPPERS (S-26 NFR)
  // =========================================================
  const handleStepQuantity = (taskId, step) => {
    setQuantities((prev) => {
      const current = parseFloat(prev[taskId] || 0) || 0;
      const next = Math.max(0, Math.round((current + step) * 100) / 100);
      return {
        ...prev,
        [taskId]: next > 0 ? String(next) : "",
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
  // QUANTITY REPORT SUBMIT (AC 2 & AC 3)
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
        message: "Khối lượng phải lớn hơn 0 và không vượt giới hạn cho phép.",
      });
      return;
    }

    try {
      setSavingId(task.task_id);
      setNotice(null);

      const week = getWeekForOffset(weekOffset);
      const res = await api.post(
        `/projects/${currentProjectId}/tasks/${task.task_id}/quantity-reports`,
        {
          quantity: raw,
          report_date: week.today,
        }
      );

      setNotice({
        type: res.data.warning ? "warning" : "success",
        message:
          res.data.warning ||
          res.data.message ||
          "Đã lưu báo cáo khối lượng thành công.",
      });

      setQuantities((prev) => ({
        ...prev,
        [task.task_id]: "",
      }));

      await loadTasks();
    } catch (err) {
      setNotice({
        type: "error",
        message:
          err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể lưu báo cáo khối lượng.",
      });
    } finally {
      setSavingId(null);
    }
  }

  // =========================================================
  // REPORT HISTORY (S-39 / T-104)
  // =========================================================
  async function loadReportHistory(task) {
    try {
      setHistoryTask(task);
      setHistoryRows([]);
      setHistoryError("");
      setHistoryLoading(true);

      const res = await api.get(
        `/projects/${currentProjectId}/tasks/${task.task_id}/quantity-reports/history`
      );

      setHistoryRows(res.data?.history || []);
    } catch (err) {
      setHistoryError(
        err.response?.data?.message || "Không thể tải lịch sử báo cáo."
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
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // =========================================================
  // MAIN RENDER
  // =========================================================
  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      {/* HEADER */}
      <div className="mb-5">
        <PageHeroBanner
          icon={<HardHat className="size-6 sm:size-8" />}
          title="Việc của đội trong tuần"
          subtitle={
            team
              ? `Đội: ${team.name}`
              : viewAllTeams
                ? "Xem việc của tất cả đội (chỉ đọc)"
                : "Việc được giao và báo cáo khối lượng"
          }
        >
          {/* Toggle "Theo đội / Tất cả đội" cho Chỉ huy trưởng & Ban quản lý */}
          {canViewAll && (
            <div className="flex min-h-11 items-center rounded-xl border border-white/20 bg-white/10 p-1 text-sm shadow-xs backdrop-blur-xs">
              <button
                type="button"
                onClick={() => {
                  setViewAllTeams(false);
                  setNotice(null);
                }}
                className={`min-h-9 rounded-lg px-3 font-semibold transition-colors cursor-pointer ${
                  !viewAllTeams ? "bg-white text-[#1F63E0] shadow-xs" : "text-white/80 hover:text-white"
                }`}
              >
                Theo đội
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewAllTeams(true);
                  setNotice(null);
                }}
                className={`min-h-9 rounded-lg px-3 font-semibold transition-colors cursor-pointer ${
                  viewAllTeams ? "bg-white text-[#1F63E0] shadow-xs" : "text-white/80 hover:text-white"
                }`}
              >
                Tất cả đội
              </button>
            </div>
          )}

          {/* Dropdown chọn đội */}
          {!isTeamLeader && !viewAllTeams && (
            <select
              value={selectedTeamId}
              onChange={(e) => {
                setSelectedTeamId(e.target.value);
                setNotice(null);
              }}
              className="min-h-11 min-w-[170px] rounded-xl border border-white/20 bg-white text-slate-800 px-3 text-sm font-medium outline-none shadow-sm focus:border-white focus:ring-2 focus:ring-white/30"
            >
              <option value="">-- Chọn đội --</option>
              {teams.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}

          {/* Quick Refresh */}
          <button
            type="button"
            onClick={loadTasks}
            className="min-h-11 min-w-11 rounded-xl border border-white/20 bg-white/10 p-2.5 text-white hover:bg-white/20 cursor-pointer active:scale-95 transition-all flex items-center justify-center backdrop-blur-xs"
            aria-label="Tải lại"
          >
            <RefreshCw className="mx-auto size-4" />
          </button>
        </PageHeroBanner>
      </div>

      {/* WEEK NAVIGATION BAR */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 active:scale-95"
            aria-label="Tuần trước"
            title="Tuần trước"
          >
            <ChevronLeft className="size-5" />
          </button>

          <div className="flex min-h-11 items-center justify-center rounded-xl bg-blue-50 px-3 py-1 text-center font-bold text-xs sm:text-sm text-blue-950">
            <CalendarDays className="size-4 mr-1.5 text-blue-600 shrink-0" />
            <span>{currentWeek.displayRange}</span>
            {currentWeek.isCurrentWeek && (
              <span className="ml-1.5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white uppercase">
                Tuần này
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 active:scale-95"
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
        </div>

        {/* Toggle Tất cả việc / Lọc tuần */}
        <button
          type="button"
          onClick={() => setAllTasksMode(!allTasksMode)}
          className={`min-h-11 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
            allTasksMode
              ? "bg-slate-800 text-white shadow"
              : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          {allTasksMode ? "Tất cả việc" : "Lọc theo tuần"}
        </button>
      </div>

      {/* NOTICE */}
      {notice && (
        <div
          role="alert"
          className={`mb-4 rounded-xl border p-3.5 text-sm font-medium ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : notice.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* MANAGER HAS NOT SELECTED TEAM */}
      {!error && !isTeamLeader && !viewAllTeams && !selectedTeamId && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Vui lòng chọn đội để xem công việc.
        </div>
      )}

      {/* EMPTY STATE */}
      {!error &&
        (isTeamLeader || viewAllTeams || selectedTeamId) &&
        tasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            {viewAllTeams
              ? "Chưa có đội nào có công việc trong tuần này."
              : "Đội chưa có công việc trong tuần này."}
          </div>
        )}

      {/* TASK CARDS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tasks.map((task) => {
          const planned =
            task.planned_quantity === null || task.planned_quantity === undefined
              ? null
              : Number(task.planned_quantity);

          const cumulative = Number(task.cumulative_reported || 0);
          const currentInput = parseFloat(quantities[task.task_id] || 0) || 0;
          const willExceed =
            planned !== null &&
            currentInput > 0 &&
            cumulative + currentInput > planned;

          return (
            <article
              key={task.task_id}
              className={`rounded-2xl border bg-white p-4 shadow-xs transition-shadow hover:shadow-md ${
                task.is_critical
                  ? "border-red-300 border-l-4 border-l-red-600"
                  : "border-slate-200"
              }`}
            >
              {/* TASK TITLE */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      className={`text-base ${
                        task.is_critical
                          ? "font-bold text-red-700"
                          : "font-semibold text-slate-900"
                      }`}
                    >
                      {task.name}
                    </h2>

                    {task.is_critical && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                        <AlertTriangle className="size-3" />
                        Việc găng
                      </span>
                    )}

                    {viewAllTeams && task.team_name && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                        <HardHat className="size-3" />
                        {task.team_name}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    {task.work_item_name}
                  </p>
                </div>
              </div>

              {/* TASK INFO */}
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <CalendarDays className="size-3.5" />
                    Bắt đầu
                  </div>
                  <div className="mt-1 font-semibold text-slate-800">
                    {formatDate(task.early_start)}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5">
                  <div className="text-xs text-slate-500">Báo hôm nay</div>
                  <div className="mt-1 font-semibold text-slate-800">
                    {Number(task.reported_today || 0)}{" "}
                    {task.quantity_unit || ""}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5">
                  <div className="text-xs text-slate-500">Lũy kế</div>
                  <div
                    className={`mt-1 font-semibold ${
                      task.over_planned ? "text-amber-700 font-bold" : "text-slate-800"
                    }`}
                  >
                    {cumulative} {task.quantity_unit || ""}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-2.5">
                  <div className="text-xs text-slate-500">Khối lượng việc</div>
                  <div className="mt-1 font-semibold text-slate-800">
                    {planned === null
                      ? "Chưa đặt"
                      : `${planned} ${task.quantity_unit || ""}`}
                  </div>
                </div>
              </div>

              {/* PROGRESS BAR HOÀN THÀNH */}
              {planned !== null && planned > 0 && (
                <div className="mt-3 rounded-xl bg-slate-50 p-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>Tiến độ thực hiện:</span>
                    <span
                      className={
                        task.over_planned
                          ? "text-amber-600 font-bold"
                          : "text-blue-600 font-bold"
                      }
                    >
                      {Math.round((cumulative / planned) * 100)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        task.over_planned ? "bg-amber-500" : "bg-blue-600"
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round((cumulative / planned) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* OVER PLAN WARNING (AC 3) */}
              {task.over_planned && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs font-semibold text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span>
                    Cảnh báo: Khối lượng lũy kế đã vượt khối lượng kế hoạch (
                    {cumulative}/{planned} {task.quantity_unit || ""}). Phát sinh vẫn được ghi nhận.
                  </span>
                </div>
              )}

              {/* REPORT INPUT — chỉ khi có quyền báo cáo và không ở chế độ Tất cả đội */}
              {!viewAllTeams && canReport && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Khối lượng hoàn thành hôm nay
                  </label>

                  {/* Real-time over-planned preview warning (AC 3) */}
                  {willExceed && (
                    <div className="mb-2 rounded-xl bg-amber-100/90 p-2.5 text-xs font-bold text-amber-950 border border-amber-300">
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
                        onClick={() => handleStepQuantity(task.task_id, step)}
                        className="min-h-11 flex-1 touch-manipulation rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-800 shadow-xs transition active:scale-95 hover:bg-slate-100 cursor-pointer"
                      >
                        +{step}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleStepQuantity(task.task_id, -1)}
                      className="min-h-11 min-w-11 touch-manipulation rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-800 shadow-xs transition active:scale-95 hover:bg-slate-100 cursor-pointer"
                      title="Giảm 1"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearQuantity(task.task_id)}
                      className="min-h-11 min-w-11 touch-manipulation rounded-xl border border-red-200 bg-red-50 text-xs font-black text-red-700 shadow-xs transition active:scale-95 hover:bg-red-100 cursor-pointer"
                      title="Xóa ô nhập"
                    >
                      C
                    </button>
                  </div>

                  <div className="flex gap-2">
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
                      className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-base font-bold outline-none focus:border-blue-500"
                    />

                    <button
                      type="button"
                      onClick={() => submitReport(task)}
                      disabled={savingId === task.task_id}
                      className="inline-flex min-h-12 min-w-[104px] touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 hover:bg-blue-700 active:scale-95 transition-all cursor-pointer shadow-sm"
                    >
                      {savingId === task.task_id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      Lưu
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadReportHistory(task)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 cursor-pointer active:scale-95"
                >
                  <History className="size-3.5" />
                  Lịch sử báo cáo
                </button>

                <button
                  type="button"
                  onClick={() => setLogTask(task)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 cursor-pointer active:scale-95"
                >
                  <Camera className="size-3.5 text-blue-600" />
                  Nhật ký & Ảnh
                </button>
              </div>

              {/* LAST REPORT */}
              {task.last_reported_at && (
                <p className="mt-2.5 text-xs text-slate-400">
                  Lần báo gần nhất:{" "}
                  {new Date(task.last_reported_at).toLocaleString("vi-VN")}
                </p>
              )}
            </article>
          );
        })}
      </div>

      {/* =====================================================
          REPORT HISTORY MODAL (S-39 Audit Timeline)
      ===================================================== */}
      {historyTask && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-xs p-0 sm:p-4">
          <div className="max-h-[90dvh] w-full max-w-2xl overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl flex flex-col">
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
                className="flex size-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Đóng"
              >
                <X className="size-5" />
              </button>
            </div>

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
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="px-3 py-3">Ngày</th>
                        <th className="px-3 py-3">Khối lượng</th>
                        <th className="px-3 py-3">Đội</th>
                        <th className="px-3 py-3">Người báo</th>
                        <th className="px-3 py-3">Ghi nhận lúc</th>
                        <th className="px-3 py-3">Nhật ký thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-3 font-medium text-slate-700">
                            {formatDate(row.report_date)}
                          </td>
                          <td className="px-3 py-3 font-semibold text-blue-700">
                            +{row.quantity} {historyTask.quantity_unit || ""}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {row.team_name || "--"}
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            {row.reported_by_name || "--"}
                          </td>
                          <td className="px-3 py-3 text-slate-600 text-xs">
                            {row.created_at
                              ? new Date(row.created_at).toLocaleString("vi-VN")
                              : "--"}
                          </td>
                          <td className="px-3 py-3 text-slate-600 text-xs">
                            {row.audit_action ? (
                              <span title="Dòng nhật ký chỉ ghi thêm, không thể sửa/xóa">
                                <span className="font-semibold text-slate-700">
                                  {row.audit_user_name || row.reported_by_name || "--"}
                                </span>{" "}
                                đã lập
                                <br />
                                <span className="text-[11px] text-slate-400">
                                  {row.audit_created_at
                                    ? new Date(row.audit_created_at).toLocaleString("vi-VN")
                                    : ""}
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs italic text-slate-400">
                                Báo cáo cũ (trước S-39)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-4 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={closeHistory}
                className="min-h-11 w-full sm:w-auto rounded-xl bg-slate-900 px-6 font-bold text-white shadow hover:bg-slate-800 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TASK LOG & PHOTO MODAL (S-23) */}
      {logTask && (
        <TaskLogModal
          projectId={Number(currentProjectId)}
          taskId={logTask.task_id}
          taskName={logTask.name}
          isOpen={Boolean(logTask)}
          onClose={() => setLogTask(null)}
        />
      )}
    </div>
  );
}