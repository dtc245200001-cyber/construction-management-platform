import React, {
  useEffect,
  useState,
} from "react";

import api from "../lib/api";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  HardHat,
  Loader2,
  RefreshCw,
} from "lucide-react";

function formatDate(value) {
  if (!value) return "Chưa có";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("vi-VN");
}

export default function FieldPage() {
  const currentProjectId =
    localStorage.getItem("currentProjectId");

  const [team, setTeam] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");

  const [quantities, setQuantities] =
    useState({});

  const [savingId, setSavingId] =
    useState(null);

  const [notice, setNotice] =
    useState(null);

  async function loadTasks() {
    try {
      setLoading(true);
      setError("");

      const res = await api.get(
        `/projects/${currentProjectId}/my-team/tasks`
      );

      setTeam(res.data.team);
      setTasks(res.data.tasks || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Không thể tải danh sách việc của đội"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (currentProjectId) {
      loadTasks();
    }
  }, [currentProjectId]);

  async function submitReport(task) {
    const raw =
      quantities[task.task_id];

    const quantity = Number(raw);

    if (
      raw === undefined ||
      raw === "" ||
      !Number.isFinite(quantity) ||
      quantity < 0
    ) {
      setNotice({
        type: "error",
        message:
          "Khối lượng phải là số không âm.",
      });

      return;
    }

    try {
      setSavingId(task.task_id);
      setNotice(null);

      const res = await api.post(
        `/projects/${currentProjectId}/tasks/${task.task_id}/quantity-reports`,
        {
          quantity,
        }
      );

      setNotice({
        type: res.data.warning
          ? "warning"
          : "success",

        message:
          res.data.warning ||
          res.data.message,
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
          "Không thể lưu báo cáo.",
      });
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 md:text-2xl">
            <HardHat className="size-6 text-blue-600" />
            Việc của đội hôm nay
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            {team
              ? `Đội: ${team.name}`
              : "Việc được giao và báo cáo khối lượng"}
          </p>
        </div>

        <button
          onClick={loadTasks}
          className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm"
          aria-label="Tải lại"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {notice && (
        <div
          role="alert"
          className={`mb-4 rounded-xl border p-3 text-sm font-medium ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : notice.type === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!error &&
        tasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            Đội chưa được giao công việc nào.
          </div>
        )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tasks.map((task) => {
          const planned =
            task.planned_quantity === null
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
                    {task.work_item_name}
                  </p>
                </div>
              </div>

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

              {task.over_planned && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />

                  Khối lượng lũy kế đã vượt
                  khối lượng kế hoạch.
                </div>
              )}

              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Khối lượng hoàn thành hôm nay
                </label>

                <div className="flex gap-2">
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0"
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
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500"
                  />

                  <button
                    onClick={() =>
                      submitReport(task)
                    }
                    disabled={
                      savingId ===
                      task.task_id
                    }
                    className="inline-flex min-w-[96px] items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
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
    </div>
  );
}