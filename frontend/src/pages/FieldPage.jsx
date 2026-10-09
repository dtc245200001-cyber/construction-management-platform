import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

import api from "../lib/api";

import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  HardHat,
  History,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import TaskLogModal from "../components/TaskLogModal";

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

  const m = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const d = String(
    date.getDate()
  ).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getCurrentWeek() {
  const now = new Date();

  const monday = new Date(now);

  const day =
    (now.getDay() + 6) % 7;

  monday.setDate(
    now.getDate() - day
  );

  const sunday =
    new Date(monday);

  sunday.setDate(
    monday.getDate() + 6
  );

  return {
    start:
      toLocalDateString(monday),

    end:
      toLocalDateString(sunday),

    today:
      toLocalDateString(now),
  };
}

export default function FieldPage({
  user,
}) {
  const currentProjectId =
    localStorage.getItem(
      "currentProjectId"
    );

  const isTeamLeader =
    user?.role === "doi_truong";

  const [team, setTeam] =
    useState(null);

  const [teams, setTeams] =
    useState([]);

  const [
    selectedTeamId,
    setSelectedTeamId,
  ] = useState("");

  const [tasks, setTasks] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    quantities,
    setQuantities,
  ] = useState({});

  const [
    savingId,
    setSavingId,
  ] = useState(null);

  const [notice, setNotice] =
    useState(null);

  // =========================================================
  // REPORT HISTORY
  // =========================================================

  const [
    historyTask,
    setHistoryTask,
  ] = useState(null);

  const [
    historyRows,
    setHistoryRows,
  ] = useState([]);

  const [
    historyLoading,
    setHistoryLoading,
  ] = useState(false);

  const [
    historyError,
    setHistoryError,
  ] = useState("");

  const [
    logTask,
    setLogTask,
  ] = useState(null);

  // =========================================================
  // LOAD TASKS
  // =========================================================

  const loadTasks =
    useCallback(async () => {
      if (!currentProjectId) {
        setLoading(false);
        return;
      }

      // Quản lý / Chỉ huy trưởng
      // phải chọn đội.
      if (
        !isTeamLeader &&
        !selectedTeamId
      ) {
        setTeam(null);
        setTasks([]);
        setLoading(false);
        setError("");

        return;
      }

      try {
        setLoading(true);
        setError("");

        const week =
          getCurrentWeek();

        const params = {
          week_start:
            week.start,

          week_end:
            week.end,

          report_date:
            week.today,
        };

        if (selectedTeamId) {
          params.team_id =
            selectedTeamId;
        }

        const res =
          await api.get(
            `/projects/${currentProjectId}/my-team/tasks`,
            {
              params,
            }
          );

        setTeam(
          res.data.team || null
        );

        setTasks(
          res.data.tasks || []
        );
      } catch (err) {
        setTeam(null);
        setTasks([]);

        setError(
          err.response?.data
            ?.message ||
            err.response?.data
              ?.error ||
            "Không thể tải danh sách việc của đội"
        );
      } finally {
        setLoading(false);
      }
    }, [
      currentProjectId,
      isTeamLeader,
      selectedTeamId,
    ]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // =========================================================
  // LOAD TEAMS
  // =========================================================

  useEffect(() => {
    if (
      !currentProjectId ||
      isTeamLeader
    ) {
      return;
    }

    let cancelled = false;

    async function loadTeams() {
      try {
        const res =
          await api.get(
            `/projects/${currentProjectId}/teams`
          );

        if (cancelled) {
          return;
        }

        const rows =
          res.data?.teams ||
          res.data ||
          [];

        setTeams(
          Array.isArray(rows)
            ? rows
            : []
        );
      } catch {
        if (!cancelled) {
          setTeams([]);
        }
      }
    }

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [
    currentProjectId,
    isTeamLeader,
  ]);

  // =========================================================
  // QUANTITY REPORT
  // =========================================================

  async function submitReport(
    task
  ) {
    const raw = String(
      quantities[
        task.task_id
      ] ?? ""
    ).trim();

    const quantity =
      Number(raw);

    if (
      raw === "" ||
      !Number.isFinite(
        quantity
      ) ||
      quantity <= 0 ||
      quantity >
        9999999999.99
    ) {
      setNotice({
        type: "error",

        message:
          "Khối lượng phải lớn hơn 0 và không vượt giới hạn cho phép.",
      });

      return;
    }

    try {
      setSavingId(
        task.task_id
      );

      setNotice(null);

      const week =
        getCurrentWeek();

      const res =
        await api.post(
          `/projects/${currentProjectId}/tasks/${task.task_id}/quantity-reports`,
          {
            quantity: raw,

            report_date:
              week.today,
          }
        );

      setNotice({
        type:
          res.data.warning
            ? "warning"
            : "success",

        message:
          res.data.warning ||
          res.data.message ||
          "Đã lưu báo cáo.",
      });

      setQuantities(
        (prev) => ({
          ...prev,

          [task.task_id]:
            "",
        })
      );

      await loadTasks();
    } catch (err) {
      setNotice({
        type: "error",

        message:
          err.response?.data
            ?.message ||
          "Không thể lưu báo cáo.",
      });
    } finally {
      setSavingId(null);
    }
  }

  // =========================================================
  // REPORT HISTORY
  // =========================================================

  async function loadReportHistory(
    task
  ) {
    try {
      setHistoryTask(task);

      setHistoryRows([]);

      setHistoryError("");

      setHistoryLoading(true);

      const res =
        await api.get(
          `/projects/${currentProjectId}/tasks/${task.task_id}/quantity-reports`
        );

      setHistoryRows(
        res.data?.reports || []
      );
    } catch (err) {
      setHistoryError(
        err.response?.data
          ?.message ||
          "Không thể tải lịch sử báo cáo."
      );
    } finally {
      setHistoryLoading(
        false
      );
    }
  }

  function closeHistory() {
    setHistoryTask(null);
    setHistoryRows([]);
    setHistoryError("");
  }

  // =========================================================
  // LOADING
  // =========================================================

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      {/* HEADER */}

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 md:text-2xl">
            <HardHat className="size-6 text-blue-600" />

            Việc của đội trong tuần
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            {team
              ? `Đội: ${team.name}`
              : "Việc được giao và báo cáo khối lượng"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isTeamLeader && (
            <select
              value={
                selectedTeamId
              }
              onChange={(e) => {
                setSelectedTeamId(
                  e.target.value
                );

                setNotice(null);
              }}
              className="min-h-12 min-w-[180px] rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
            >
              <option value="">
                -- Chọn đội --
              </option>

              {teams.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                )
              )}
            </select>
          )}

          <button
            type="button"
            onClick={loadTasks}
            className="min-h-12 min-w-12 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm"
            aria-label="Tải lại"
          >
            <RefreshCw className="mx-auto size-4" />
          </button>
        </div>
      </div>

      {/* NOTICE */}

      {notice && (
        <div
          role="alert"
          className={`mb-4 rounded-xl border p-3 text-sm font-medium ${
            notice.type ===
            "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : notice.type ===
                  "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </div>
      )}

      {/* ERROR */}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* MANAGER HAS NOT SELECTED TEAM */}

      {!error &&
        !isTeamLeader &&
        !selectedTeamId && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Vui lòng chọn đội để
            xem công việc.
          </div>
        )}

      {/* EMPTY */}

      {!error &&
        (isTeamLeader ||
          selectedTeamId) &&
        tasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Đội chưa có công việc
            trong tuần này.
          </div>
        )}

      {/* TASK CARDS */}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tasks.map((task) => {
          const planned =
            task.planned_quantity ===
              null ||
            task.planned_quantity ===
              undefined
              ? null
              : Number(
                  task.planned_quantity
                );

          const cumulative =
            Number(
              task.cumulative_reported ||
                0
            );

          return (
            <article
              key={task.task_id}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${
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
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[11px] font-bold text-red-700">
                        <AlertTriangle className="size-3" />

                        Việc găng
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    {
                      task.work_item_name
                    }
                  </p>
                </div>
              </div>

              {/* TASK INFO */}

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <CalendarDays className="size-3.5" />

                    Ngày bắt đầu
                  </div>

                  <div className="mt-1 font-semibold">
                    {formatDate(
                      task.early_start
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">
                    Báo hôm nay
                  </div>

                  <div className="mt-1 font-semibold">
                    {Number(
                      task.reported_today ||
                        0
                    )}{" "}
                    {task.quantity_unit ||
                      ""}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">
                    Lũy kế
                  </div>

                  <div
                    className={`mt-1 font-semibold ${
                      task.over_planned
                        ? "text-amber-700"
                        : ""
                    }`}
                  >
                    {cumulative}{" "}
                    {task.quantity_unit ||
                      ""}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">
                    Khối lượng việc
                  </div>

                  <div className="mt-1 font-semibold">
                    {planned === null
                      ? "Chưa đặt"
                      : `${planned} ${
                          task.quantity_unit ||
                          ""
                        }`}
                  </div>
                </div>
              </div>

              {/* OVER PLAN WARNING */}

              {task.over_planned && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />

                  Khối lượng lũy kế đã
                  vượt khối lượng kế
                  hoạch.
                </div>
              )}

              {/* REPORT INPUT */}

              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Khối lượng hoàn
                  thành hôm nay
                </label>

                <div className="flex gap-2">
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0.01"
                    max="9999999999.99"
                    step="0.01"
                    value={
                      quantities[
                        task.task_id
                      ] ?? ""
                    }
                    onChange={(e) =>
                      setQuantities(
                        (prev) => ({
                          ...prev,

                          [task.task_id]:
                            e.target
                              .value,
                        })
                      )
                    }
                    placeholder="0"
                    className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      submitReport(
                        task
                      )
                    }
                    disabled={
                      savingId ===
                      task.task_id
                    }
                    className="inline-flex min-h-12 min-w-[104px] touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingId ===
                    task.task_id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}

                    Lưu
                  </button>
                </div>
              </div>

              {/* ACTION BUTTONS */}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    loadReportHistory(
                      task
                    )
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <History className="size-4" />

                  Lịch sử báo cáo
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setLogTask(task)
                  }
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  <Camera className="size-4 text-blue-600" />

                  Nhật ký & Ảnh
                </button>
              </div>

              {/* LAST REPORT */}

              {task.last_reported_at && (
                <p className="mt-3 text-xs text-slate-400">
                  Lần báo gần nhất:{" "}
                  {new Date(
                    task.last_reported_at
                  ).toLocaleString(
                    "vi-VN"
                  )}
                </p>
              )}
            </article>
          );
        })}
      </div>

      {/* =====================================================
          REPORT HISTORY MODAL
      ===================================================== */}

      {historyTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* MODAL HEADER */}

            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 font-bold text-slate-900">
                  <History className="size-5 text-blue-600" />

                  Lịch sử báo cáo
                  khối lượng
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Công việc:{" "}
                  <span className="font-semibold text-slate-700">
                    {
                      historyTask.name
                    }
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeHistory
                }
                className="flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
                aria-label="Đóng"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* MODAL BODY */}

            <div className="max-h-[65vh] overflow-y-auto p-5">
              {historyLoading ? (
                <div className="flex min-h-40 items-center justify-center">
                  <Loader2 className="size-7 animate-spin text-blue-600" />
                </div>
              ) : historyError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {historyError}
                </div>
              ) : historyRows.length ===
                0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  Chưa có báo cáo
                  khối lượng nào.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="px-3 py-3">
                          Ngày
                        </th>

                        <th className="px-3 py-3">
                          Khối lượng
                        </th>

                        <th className="px-3 py-3">
                          Đội
                        </th>

                        <th className="px-3 py-3">
                          Người báo
                        </th>

                        <th className="px-3 py-3">
                          Ghi nhận lúc
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {historyRows.map(
                        (row) => (
                          <tr
                            key={row.id}
                            className="border-b border-slate-100"
                          >
                            <td className="px-3 py-3 font-medium text-slate-700">
                              {formatDate(
                                row.report_date
                              )}
                            </td>

                            <td className="px-3 py-3 font-semibold text-blue-700">
                              {
                                row.quantity
                              }{" "}
                              {historyTask.quantity_unit ||
                                ""}
                            </td>

                            <td className="px-3 py-3 text-slate-600">
                              {row.team_name ||
                                "--"}
                            </td>

                            <td className="px-3 py-3 text-slate-600">
                              {row.reported_by_name ||
                                "--"}
                            </td>

                            <td className="px-3 py-3 text-slate-600">
                              {row.created_at
                                ? new Date(
                                    row.created_at
                                  ).toLocaleString(
                                    "vi-VN"
                                  )
                                : "--"}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          TASK LOG & PHOTO ATTACHMENTS MODAL (S-23 / T-53)
      ===================================================== */}
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