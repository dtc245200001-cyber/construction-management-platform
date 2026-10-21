import React, { useState, useEffect, useCallback } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import PageHeroBanner from "../components/PageHeroBanner";
import api from "../lib/api";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Flag,
  RefreshCw,
  CalendarClock,
  Percent,
  Banknote,
  Activity,
  ListOrdered,
  ArrowRight,
  Info,
} from "lucide-react";

// S-49 / T-125 — Dashboard tiến độ dành cho Chủ đầu tư.
// Lấy dữ liệu thật từ GET /projects/:projectId/progress-dashboard.
// Quy ước hiển thị:
//   - Không biến "thiếu dữ liệu" thành 0 — chỉ số thiếu hiện "Chưa đủ dữ liệu".
//   - Cảnh báo có nhãn chữ (không chỉ dựa vào màu).
//   - Chênh lệch ngày: dương = chậm, âm = sớm, 0 = đúng (theo ngày làm việc).

const fmtDate = (d) => {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return `${String(dt.getDate()).padStart(2, "0")}/${String(
      dt.getMonth() + 1
    ).padStart(2, "0")}/${dt.getFullYear()}`;
  } catch {
    return d;
  }
};

const fmtMoney = (v) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("vi-VN");
};

const SCHEDULE_STATUS = {
  on_track: { label: "Đúng tiến độ", tone: "ok" },
  early: { label: "Vượt tiến độ (sớm)", tone: "ok" },
  late: { label: "Đang chậm", tone: "warn" },
  no_baseline: { label: "Chưa chốt baseline", tone: "muted" },
  insufficient_data: { label: "Chưa đủ dữ liệu", tone: "muted" },
};

function StatCard({ icon: Icon, label, value, sub, tone = "default" }) {
  const toneCls =
    tone === "warn"
      ? "border-amber-200 bg-amber-50/60"
      : tone === "ok"
      ? "border-emerald-200 bg-emerald-50/50"
      : "border-[#E6EBF3] bg-white";
  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 shadow-xs ${toneCls}`}
      role="region"
      aria-label={label}
    >
      <div className="flex items-center gap-2 text-[11px] sm:text-xs font-semibold uppercase tracking-wide text-[#64748B]">
        {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-xl sm:text-2xl font-bold text-[#0F1B3D] leading-tight break-words">
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] sm:text-xs text-[#64748B]">{sub}</div>}
    </div>
  );
}

export default function ProgressDashboardPage() {
  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const projectId = currentProject?.id || localStorage.getItem("currentProjectId") || 1;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/projects/${projectId}/progress-dashboard`);
      setData(res.data || null);
    } catch (err) {
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.message || err?.response?.data?.error;
      if (status === 403) {
        setError(serverMsg || "Bạn không có quyền xem dashboard của dự án này.");
      } else if (status === 404) {
        if (serverMsg && (serverMsg.includes("đường dẫn") || serverMsg.includes("route") || serverMsg.includes("Cannot"))) {
          setError("Chức năng đang được cập nhật trên máy chủ backend (chưa triển khai API tiến độ). Vui lòng thử lại sau.");
        } else {
          setError(serverMsg || "Không tìm thấy dự án.");
        }
      } else {
        setError(serverMsg || "Không tải được dữ liệu tiến độ. Vui lòng thử lại.");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const progress = data?.progress || {};
  const schedule = data?.schedule || {};
  const milestones = data?.overdue_milestones || [];
  const critical = data?.critical_delayed_tasks || [];
  const schedStatus = SCHEDULE_STATUS[schedule.status] || SCHEDULE_STATUS.insufficient_data;

  const valuePct =
    progress.value_percent === null || progress.value_percent === undefined
      ? null
      : progress.value_percent;

  const variance = schedule.finish_variance_working_days;

  return (
    <div className="flex-1 min-h-0 bg-[#F3F6FB] text-[#0F1B3D] flex flex-col overflow-y-auto">
      <div className="flex-1 min-h-0 flex flex-col p-3.5 sm:p-6 pb-24 lg:pb-6 gap-4 sm:gap-6 max-w-[1200px] mx-auto w-full">
        {/* Header */}
        <PageHeroBanner
          icon={<Activity className="size-6 sm:size-8" aria-hidden="true" />}
          title="Tiến độ dự án"
          subtitle={
            data?.project_name
              ? `Dự án: ${data.project_name} · Tổng hợp tiến độ theo giá trị hợp đồng`
              : "Tổng hợp tiến độ theo giá trị hợp đồng"
          }
        >
          <button
            type="button"
            onClick={fetchDashboard}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white backdrop-blur-xs px-3 py-2 text-xs sm:text-sm font-semibold disabled:opacity-50 cursor-pointer touch-target transition-colors"
            aria-label="Tải lại dữ liệu"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            <span className="hidden sm:inline">Tải lại</span>
          </button>
        </PageHeroBanner>

        {/* Error */}
        {error && !loading && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 flex items-start gap-3"
          >
            <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold text-red-800 text-sm">{error}</p>
              <button
                type="button"
                onClick={fetchDashboard}
                className="mt-2 text-xs font-semibold text-red-700 underline underline-offset-2 cursor-pointer"
              >
                Thử lại
              </button>
            </div>
          </div>
        )}

        {(!error || Boolean(data)) && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0">
          <StatCard
            icon={Percent}
            label="Tiến độ theo giá trị"
            tone={valuePct !== null && valuePct >= 0 ? "default" : "muted"}
            value={
              loading ? "…" : valuePct === null ? "Chưa đủ dữ liệu" : `${valuePct}%`
            }
            sub={
              loading
                ? ""
                : valuePct === null
                ? "Chưa khai giá trị hợp đồng"
                : `${fmtMoney(progress.completed_value)} / ${fmtMoney(progress.total_contract_value)} VND`
            }
          />
          <StatCard
            icon={CalendarClock}
            label="Chênh lệch so với baseline"
            tone={
              !schedule.has_baseline
                ? "muted"
                : variance !== null && variance > 0
                ? "warn"
                : "ok"
            }
            value={
              loading
                ? "…"
                : !schedule.has_baseline
                ? "Chưa có baseline"
                : variance === null
                ? "Chưa đủ dữ liệu"
                : variance > 0
                ? `+${variance} ngày`
                : variance < 0
                ? `${variance} ngày`
                : "0 ngày"
            }
            sub={
              !schedule.has_baseline
                ? "Chưa chốt kế hoạch gốc"
                : variance === null
                ? ""
                : variance > 0
                ? "Chậm so với kế hoạch gốc"
                : variance < 0
                ? "Sớm hơn kế hoạch gốc"
                : "Đúng kế hoạch gốc"
            }
          />
          <StatCard
            icon={Flag}
            label="Mốc đang bị vượt"
            tone={milestones.length > 0 ? "warn" : "ok"}
            value={loading ? "…" : milestones.length}
            sub={milestones.length > 0 ? "Cần xử lý" : "Không có mốc quá hạn"}
          />
          <StatCard
            icon={TrendingUp}
            label="Việc găng đang chậm"
            tone={critical.length > 0 ? "warn" : "ok"}
            value={loading ? "…" : critical.length}
            sub={critical.length > 0 ? "Theo đường găng CPM" : "Không có việc găng chậm"}
          />
        </div>

        {/* Baseline note */}
        {!loading && !schedule.has_baseline && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 flex items-start gap-3">
            <Info className="size-5 text-[#1F63E0] shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs sm:text-sm text-[#1e3a8a]">
              Dự án chưa chốt <strong>kế hoạch gốc (baseline)</strong>. Chỉ số chênh lệch
              ngày và danh sách việc găng chậm chỉ khả dụng sau khi Ban quản lý chốt
              baseline cho tiến độ.
            </p>
          </div>
        )}

        {/* 2 columns: overdue milestones + critical delayed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Overdue milestones */}
          <section
            aria-labelledby="overdue-title"
            className="rounded-2xl border border-[#E6EBF3] bg-white shadow-xs overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[#E6EBF3]">
              <h2
                id="overdue-title"
                className="text-sm sm:text-base font-bold flex items-center gap-2"
              >
                <Flag className="size-4 text-red-600" aria-hidden="true" />
                Mốc đang bị vượt
                {milestones.length > 0 && (
                  <span className="inline-flex items-center rounded-md bg-red-50 border border-red-200 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                    {milestones.length}
                  </span>
                )}
              </h2>
            </div>
            <div className="flex-1 min-h-[120px]">
              {loading ? (
                <div className="p-8 text-center text-[#64748B] text-sm">Đang tải…</div>
              ) : milestones.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center">
                  <CheckCircle className="size-10 text-emerald-500 mb-2" aria-hidden="true" />
                  <p className="font-semibold text-[#0F1B3D] text-sm">Không có mốc quá hạn</p>
                  <p className="text-[#64748B] text-xs mt-1">
                    Tất cả mốc bàn giao đang đúng hạn hoặc đã hoàn thành.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#E6EBF3]">
                  {milestones.map((m) => (
                    <li key={m.milestone_id} className="px-4 sm:px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-[#0F1B3D] truncate">
                            {m.work_item_code ? `[${m.work_item_code}] ` : ""}
                            {m.work_item_name}
                          </p>
                          <p className="text-xs text-[#64748B] mt-0.5">
                            Mốc yêu cầu: <span className="font-mono">{fmtDate(m.required_date)}</span>
                          </p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-50 border border-red-200 px-2 py-1 text-[11px] font-bold text-red-700">
                          <AlertTriangle className="size-3" aria-hidden="true" />
                          Trễ {m.overdue_days} ngày
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Critical delayed tasks */}
          <section
            aria-labelledby="critical-title"
            className="rounded-2xl border border-[#E6EBF3] bg-white shadow-xs overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[#E6EBF3]">
              <h2
                id="critical-title"
                className="text-sm sm:text-base font-bold flex items-center gap-2"
              >
                <TrendingUp className="size-4 text-amber-600" aria-hidden="true" />
                Công việc găng đang chậm
                {critical.length > 0 && (
                  <span className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">
                    {critical.length}
                  </span>
                )}
              </h2>
            </div>
            <div className="flex-1 min-h-[120px]">
              {loading ? (
                <div className="p-8 text-center text-[#64748B] text-sm">Đang tải…</div>
              ) : critical.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center">
                  <CheckCircle className="size-10 text-emerald-500 mb-2" aria-hidden="true" />
                  <p className="font-semibold text-[#0F1B3D] text-sm">
                    Không có việc găng nào đang chậm
                  </p>
                  <p className="text-[#64748B] text-xs mt-1">
                    {!schedule.has_baseline
                      ? "Chưa có baseline — danh sách sẽ cập nhật sau khi chốt."
                      : "Các công việc trên đường găng đang theo đúng kế hoạch."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#E6EBF3]">
                  {critical.map((t) => (
                    <li key={t.task_id} className="px-4 sm:px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-[#0F1B3D] truncate">
                            {t.task_name}
                          </p>
                          <p className="text-[11px] text-[#64748B] mt-0.5 truncate">
                            {t.work_item_code ? `[${t.work_item_code}] ` : ""}
                            {t.work_item_name}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                            <div className="h-1.5 flex-1 max-w-[140px] rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#1F63E0]"
                                style={{ width: `${Math.min(100, Math.max(0, t.percent_complete || 0))}%` }}
                              />
                            </div>
                            <span className="font-mono text-[#64748B]">{t.percent_complete || 0}%</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {t.delay_days !== null && t.delay_days !== undefined ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-[11px] font-bold text-amber-700">
                              <AlertTriangle className="size-3" aria-hidden="true" />
                              {t.delay_basis === "baseline" ? "Trễ " : "Quá hạn "}
                              {t.delay_days} ngày
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#64748B]">—</span>
                          )}
                          <p className="text-[10px] text-[#94A3B8] mt-1 font-mono">
                            {fmtDate(t.current_finish)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
          </>
        )}

        {/* Footer link */}
        {!loading && schedule.has_baseline && (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => navigate("/gantt")}
              className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#1F63E0] hover:underline underline-offset-2 cursor-pointer"
            >
              Xem biểu đồ Gantt chi tiết
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
