import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import api from "../lib/api";
import {
  Home,
  Network,
  TrendingUp,
  Camera,
  FileText,
  CheckSquare,
  Wallet,
  Users,
  Settings,
  LogOut,
  RefreshCw,
  Bell,
  Plus,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Building2,
  UsersRound,
  ClipboardList,
  AlertTriangle,
  Info,
  AlertCircle,
  ShieldCheck,
  Zap,
  HeartHandshake,
  Pencil,
  CheckCircle2,
} from "lucide-react";

import heroImage from "../assets/hero-site.jpg";

const navItems = [
  { label: "Tổng quan", icon: Home, active: true },
  { label: "Cơ cấu công việc (WBS)", icon: Network },
  { label: "Bảng đường găng (CPM)", icon: TrendingUp },
  { label: "Hiện trường & Giao việc", icon: Camera },
  { label: "Nhật ký thi công", icon: FileText },
  { label: "Nghiệm thu khối lượng", icon: CheckSquare },
  { label: "Thanh toán & Chi phí", icon: Wallet },
  { label: "Thành viên & Tổ đội", icon: Users },
];

// Removed static summary

// Removed static tasks (todayWork/risks giờ tính từ dữ liệu thật trong loadData)

const toneChip = {
  danger: "bg-danger-soft text-danger-foreground border-danger/25",
  warning: "bg-warning-soft text-warning-foreground border-warning/30",
  success: "bg-success-soft text-success-foreground border-success/25",
  info: "bg-info-soft text-info-foreground border-info/25",
};

const toneIcon = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
};

export default function LandingPage({ user, setUser }) {
  const currentProjectId = localStorage.getItem('currentProjectId') || 1;
  const [projectData, setProjectData] = useState({
    name: "Đang tải...",
    startDate: null,
    membersCount: 0,
    plannedFinish: null,
    currentFinish: null,
    actualProgress: 0,
    plannedProgress: 0,
    criticalTaskCount: 0,
    criticalTasks: [],
    // Nghiệm thu chờ duyệt (số thật)
    pendingVouchers: [],
    pendingCount: 0,
    overdueCount: 0,
    pendingAmount: 0,
    // Công việc hôm nay (suy từ việc đến hạn hôm nay)
    todayTasks: [],
    // Cảnh báo & rủi ro (suy từ dữ liệu thật)
    risks: [],
    // Dự toán & thực chi
    budgetTotal: 0,
    actualTotal: 0,
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [projRes, sumRes, resRes, memRes, vouchersRes, budgetsRes, costsRes] = await Promise.all([
          api.get(`/projects/${currentProjectId}`),
          api.get(`/projects/${currentProjectId}/schedule-summary`).catch(() => ({ data: {} })),
          api.get(`/projects/${currentProjectId}/schedule-results`).catch(() => ({ data: { data: [] } })),
          api.get(`/projects/${currentProjectId}/members`).catch(() => ({ data: { members: [] } })),
          // Nghiệm thu: lọc phiếu pending_review (403 -> giữ rỗng, không đoán)
          api.get(`/projects/${currentProjectId}/acceptance-vouchers`).catch(() => ({ data: { vouchers: [] } })),
          // Dự toán phiên bản mới nhất (403 -> giữ 0)
          api.get(`/projects/${currentProjectId}/budgets`).catch(() => ({ data: {} })),
          // Thực chi (403 -> giữ 0)
          api.get(`/projects/${currentProjectId}/actual-costs`).catch(() => ({ data: { actual_costs: [] } })),
        ]);

        const proj = projRes.data.project || {};
        const sum = sumRes.data || {};
        const results = resRes.data.data || [];
        const mems = memRes.data.members || [];

        const criticalTasks = results.filter(t => t.is_critical && t.percent_complete < 100);

        let actualProg = 0;
        if (results.length > 0) {
          actualProg = Math.round(results.reduce((acc, t) => acc + (t.percent_complete || 0), 0) / results.length);
        }

        // --- Nghiệm thu chờ duyệt (số thật) ---
        const vouchers = vouchersRes.data.vouchers || [];
        const pending = vouchers.filter(v => v.status === 'pending_review');
        const now = Date.now();
        const overdue = pending.filter(v => now - new Date(v.created_at).getTime() > 24 * 3600 * 1000);
        const pendingAmount = pending.reduce((acc, v) => acc + (Number(v.total_amount) || 0), 0);

        // --- Công việc hôm nay: việc có tên, chưa xong, đến hạn trong hôm nay ---
        const todayStr = new Date().toISOString().split('T')[0];
        const todayTasks = results
          .filter(t => t.task_name && (t.percent_complete || 0) < 100 && t.early_finish && t.early_finish.startsWith(todayStr))
          .slice(0, 5);

        // --- Cảnh báo & rủi ro suy từ dữ liệu thật ---
        const risks = [];
        const lateTasks = results.filter(t =>
          (t.percent_complete || 0) < 100 && t.early_finish && t.early_finish < todayStr
        );
        if (lateTasks.length > 0) {
          risks.push({
            icon: AlertTriangle,
            title: `${lateTasks.length} việc quá hạn`,
            sub: lateTasks.slice(0, 2).map(t => t.task_name).join('; ') || 'Cần điều phối lại',
            tone: 'danger',
          });
        }
        if (overdue.length > 0) {
          risks.push({
            icon: AlertCircle,
            title: `${overdue.length} phiếu nghiệm thu quá 24h`,
            sub: 'Cần duyệt hoặc trả lại sớm',
            tone: 'warning',
          });
        }
        if (criticalTasks.length > 0) {
          risks.push({
            icon: Info,
            title: `${criticalTasks.length} việc trên đường găng`,
            sub: 'Ưu tiên điều phối nhân lực',
            tone: 'info',
          });
        }

        // --- Dự toán & thực chi ---
        const budgetVersions = budgetsRes.data.versions || budgetsRes.data.budget_versions || [];
        const latestBudget = budgetVersions.length > 0 ? budgetVersions[budgetVersions.length - 1] : null;
        const budgetTotal = Number(latestBudget?.total_amount) || 0;
        const costs = costsRes.data.actual_costs || [];
        const actualTotal = costs.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);

        setProjectData({
          name: proj.name || "Chưa có tên",
          startDate: proj.start_date,
          membersCount: mems.length,
          plannedFinish: sum.planned_finish_date,
          currentFinish: sum.current_finish_date,
          actualProgress: actualProg,
          plannedProgress: sum.planned_progress || actualProg, // For now planned matches actual if empty
          criticalTaskCount: results.filter(t => t.is_critical).length,
          criticalTasks: criticalTasks.slice(0, 5), // top 5
          pendingVouchers: pending,
          pendingCount: pending.length,
          overdueCount: overdue.length,
          pendingAmount,
          todayTasks,
          risks,
          budgetTotal,
          actualTotal,
        });
      } catch (error) {
        console.error("Error loading dashboard data", error);
      }
    }
    if (currentProjectId) loadData();
  }, [currentProjectId]);

  const delayDays = projectData.currentFinish && projectData.plannedFinish
    ? differenceInCalendarDays(parseISO(projectData.currentFinish), parseISO(projectData.plannedFinish))
    : 0;

  // Trạng thái sức khỏe dự án — 1 câu duy nhất cho người không chuyên.
  const lateTaskCount = projectData.risks.find(r => r.tone === 'danger') ? Number((projectData.risks.find(r => r.tone === 'danger').title.match(/\d+/) || [0])[0]) : 0;
  const health = delayDays > 7 || lateTaskCount >= 5 || projectData.overdueCount >= 5
    ? { label: 'Cần can thiệp ngay', tone: 'danger' }
    : delayDays > 0 || projectData.overdueCount > 0 || lateTaskCount > 0
      ? { label: 'Đang chậm một phần', tone: 'warning' }
      : { label: 'Đúng tiến độ', tone: 'success' };
  const healthTone = {
    danger: 'bg-danger-soft text-danger-foreground border-danger/25',
    warning: 'bg-warning-soft text-warning-foreground border-warning/30',
    success: 'bg-success-soft text-success-foreground border-success/30',
  }[health.tone];
  const healthSummary = [
    delayDays > 0 ? `trễ ${delayDays} ngày` : 'đúng hạn',
    projectData.pendingCount > 0 ? `${projectData.pendingCount} phiếu chờ duyệt` : null,
    lateTaskCount > 0 ? `${lateTaskCount} việc quá hạn` : null,
  ].filter(Boolean).join(' · ');

  return (
        <main className="grid flex-1 gap-4 sm:gap-5 p-3.5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_340px] overflow-y-auto">
          {/* Left column */}
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            {/* Hero */}
            <section className="hero-surface relative overflow-hidden rounded-2xl border border-border">
              <img
                src={heroImage}
                alt="Công trường thi công với cẩu tháp"
                width={1280}
                height={640}
                className="absolute right-0 top-0 hidden h-[58%] w-[38%] rounded-tr-2xl object-cover md:block"
                style={{
                  maskImage: "linear-gradient(90deg, transparent, #000 35%)",
                  WebkitMaskImage: "linear-gradient(90deg, transparent, #000 35%)",
                }}
              />
              <div className="relative p-4 sm:p-7">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm sm:text-lg font-semibold text-info">Xin chào, {user?.name || 'Hương Lan'}</p>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:text-xs font-semibold ${healthTone}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {health.label}
                  </span>
                </div>
                <h1 className="mt-1 text-2xl sm:text-4xl font-bold tracking-tight">Tổng quan {projectData.name && projectData.name !== 'Đang tải...' ? projectData.name : 'dự án'}</h1>
                <p className="mt-1.5 max-w-md text-xs sm:text-sm text-muted-foreground">
                  {healthSummary ? `Hiện tại: ${healthSummary}.` : 'Chưa có dữ liệu tiến độ.'}
                  {projectData.criticalTaskCount > 0 && ` Có ${projectData.criticalTaskCount} việc quan trọng cần ưu tiên.`}
                </p>

                <dl className="card-surface mt-4 sm:mt-6 grid grid-cols-2 gap-2.5 sm:gap-4 p-3 sm:p-4 lg:grid-cols-3">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
                      <CalendarDays className="size-4 sm:size-5" />
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] sm:text-xs text-muted-foreground">Ngày bắt đầu</dt>
                      <dd className="whitespace-nowrap text-xs sm:text-sm font-semibold">
                        {projectData.startDate ? format(parseISO(projectData.startDate), 'dd/MM/yyyy') : '--'}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
                      <UsersRound className="size-4 sm:size-5" />
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] sm:text-xs text-muted-foreground">Số nhân sự</dt>
                      <dd className="whitespace-nowrap text-xs sm:text-sm font-semibold">{projectData.membersCount} người</dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
                      <CalendarDays className="size-4 sm:size-5" />
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[10px] sm:text-xs text-muted-foreground">Dự kiến xong</dt>
                      <dd className="whitespace-nowrap text-xs sm:text-sm font-semibold">
                        {projectData.currentFinish ? format(parseISO(projectData.currentFinish), 'dd/MM/yyyy') : '--'}
                      </dd>
                    </div>
                  </div>
                </dl>
              </div>
            </section>

            {/* KPI cards: 2x2 grid on mobile/laptop with right rail, 4 columns on wide 2xl */}
            <section className="grid grid-cols-2 gap-3 sm:gap-4 2xl:grid-cols-4">
              <article className="card-surface p-3.5 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start gap-2.5 sm:gap-3 [&>div]:min-w-0">
                    <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
                      <CalendarDays className="size-4 sm:size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-info-foreground">Đã làm được</p>
                      <p className="whitespace-nowrap text-lg sm:text-2xl font-bold">{projectData.actualProgress}%</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] sm:text-xs text-muted-foreground" title="Kế hoạch đến hôm nay phải đạt bao nhiêu">
                    Kế hoạch {projectData.plannedProgress}%
                    {projectData.actualProgress < projectData.plannedProgress &&
                      <span className="text-danger-foreground"> · đang hụt {projectData.plannedProgress - projectData.actualProgress}%</span>
                    }
                  </p>
                </div>
                <div className="mt-2.5 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-info transition-all duration-500" style={{ width: `${projectData.actualProgress}%` }} />
                </div>
              </article>

              <article className="card-surface bg-danger-soft/60 p-3.5 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start gap-2.5 sm:gap-3 [&>div]:min-w-0">
                    <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                      <CalendarDays className="size-4 sm:size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-danger-foreground">Ngày xong dự kiến</p>
                      <p className="truncate text-base sm:text-xl font-bold font-mono" title="Ngày xong tính theo tiến độ hiện tại">
                        {projectData.currentFinish ? format(parseISO(projectData.currentFinish), 'dd/MM/yyyy') : '--'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  {delayDays > 0 ? (
                    <p className="inline-flex items-center gap-1 rounded-md border border-danger/25 bg-card px-2 py-1 text-[11px] font-medium text-danger-foreground">
                      <AlertCircle className="size-3 shrink-0" /> Trễ {delayDays} ngày
                    </p>
                  ) : (
                    <p className="inline-flex items-center gap-1 rounded-md border border-success/30 bg-card px-2 py-1 text-[11px] font-medium text-success-foreground">
                      <AlertCircle className="size-3 shrink-0" /> Đúng hạn
                    </p>
                  )}
                </div>
              </article>

              <article className="card-surface bg-success-soft/50 p-3.5 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start gap-2.5 sm:gap-3 [&>div]:min-w-0">
                    <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-success text-primary-foreground">
                      <UsersRound className="size-4 sm:size-5" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-success-foreground" title="Việc chậm là cả dự án chậm — cần làm trước">
                        Việc quan trọng nhất
                      </p>
                      <p className="whitespace-nowrap text-lg sm:text-2xl font-bold">{projectData.criticalTaskCount} việc</p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 inline-flex items-center gap-1 rounded-md border border-warning/30 bg-card px-2 py-1 text-[11px] text-warning-foreground font-medium">
                  <AlertCircle className="size-3 shrink-0" /> Ưu tiên điều phối
                </p>
              </article>

              <article className="card-surface bg-warning-soft/50 p-3.5 sm:p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-start gap-2.5 sm:gap-3 [&>div]:min-w-0">
                    <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-warning text-primary-foreground">
                      <ClipboardList className="size-4 sm:size-5" />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-medium text-warning-foreground" title="Phiếu đội làm xong, đang chờ duyệt để thanh toán">
                        Chờ duyệt thanh toán
                      </p>
                      <p className="whitespace-nowrap text-lg sm:text-2xl font-bold">
                        {projectData.pendingCount} phiếu
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-1">
                  <p className="text-[11px] text-muted-foreground truncate">
                    {projectData.overdueCount > 0
                      ? `${projectData.overdueCount} phiếu quá 24h`
                      : 'Không có phiếu quá hạn'}
                  </p>
                  <p className="text-sm sm:text-lg font-bold text-foreground">
                    {projectData.pendingAmount > 0
                      ? `${(projectData.pendingAmount / 1e9).toFixed(2)} tỷ`
                      : '—'}
                  </p>
                </div>
              </article>
            </section>

            {/* Task table / Mobile Cards */}
            <section className="card-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 sm:size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                    <ClipboardList className="size-4 sm:size-5" />
                  </div>
                  <h2 className="text-sm sm:text-base font-semibold" title="Việc nào chậm là cả dự án chậm">
                    Việc cần làm ngay
                  </h2>
                </div>
                <Link to="/schedule" className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-info hover:underline">
                  Xem tất cả <ChevronRight className="size-3.5 sm:size-4" />
                </Link>
              </div>

              {/* Desktop Table (md and up) */}
              <div className="mt-4 hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-3 py-3 font-medium">Việc gì</th>
                      <th className="px-3 py-3 font-medium">Ai làm</th>
                      <th className="px-3 py-3 font-medium">Làm được</th>
                      <th className="px-3 py-3 font-medium">Hạn xong</th>
                      <th className="px-3 py-3 font-medium">Tình trạng</th>
                      <th className="px-3 py-3 font-medium text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectData.criticalTasks.length === 0 ? (
                      <tr><td colSpan="6" className="px-3 py-8 text-center text-muted-foreground font-medium">Không có công việc ưu tiên nào</td></tr>
                    ) : projectData.criticalTasks.map((t) => (
                      <tr key={t.task_id} className="border-b border-border/70 last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="px-3 py-3.5 font-medium">
                          <span className="flex items-center gap-2.5">
                            <span className="h-5 w-1.5 rounded-full bg-danger shrink-0" />
                            {t.task_name}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-muted-foreground">{t.assignee || 'Chưa giao'}</td>
                        <td className="px-3 py-3.5 font-medium tabular-nums">{t.percent_complete || 0}%</td>
                        <td className="px-3 py-3.5 tabular-nums">{t.early_finish ? format(parseISO(t.early_finish), 'dd/MM/yyyy') : '--'}</td>
                        <td className="px-3 py-3.5">
                          <span className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold bg-danger-soft text-danger-foreground border-danger/25" title="Việc chậm là cả dự án chậm">
                            ◆ LÀM NGAY
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <Link to="/schedule" className="rounded-lg border border-info/30 px-2.5 py-1 text-xs font-medium text-info transition-colors hover:bg-info-soft">
                            Cập nhật
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View (< md) */}
              <div className="mt-3.5 space-y-2.5 md:hidden">
                {projectData.criticalTasks.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Không có công việc ưu tiên nào</p>
                ) : projectData.criticalTasks.map((t) => (
                  <div key={t.task_id} className="rounded-xl border border-border bg-card p-3 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 h-4 w-1.5 rounded-full bg-danger shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-foreground line-clamp-1">{t.task_name}</p>
                          <p className="text-xs text-muted-foreground">{t.assignee || 'Chưa giao đội'}</p>
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold bg-danger-soft text-danger-foreground border-danger/25" title="Việc chậm là cả dự án chậm">
                        LÀM NGAY
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">Hạn xong: <strong className="text-foreground tabular-nums">{t.early_finish ? format(parseISO(t.early_finish), 'dd/MM/yyyy') : '--'}</strong></span>
                        <span className="text-muted-foreground">Làm được: <strong className="text-foreground tabular-nums">{t.percent_complete || 0}%</strong></span>
                      </div>
                      <Link to="/schedule" className="rounded-md border border-info/30 bg-info-soft px-2.5 py-1 text-xs font-medium text-info">
                        Cập nhật
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Footer strip */}
            <section className="card-surface grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5 p-3.5 sm:p-5">
              {[
                { icon: ShieldCheck, title: "An toàn lao động", sub: "Tối ưu và an toàn" },
                { icon: Zap, title: "Vận hành ổn định", sub: "Luôn sẵn sàng" },
                { icon: HeartHandshake, title: "Đồng hành cùng bạn", sub: "Trên mọi công trình" },
              ].map((item) => (
                <div key={item.title} className="flex items-center gap-3">
                  <div className="flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
                    <item.icon className="size-4 sm:size-5" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold">{item.title}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">{item.sub}</p>
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Right column — luôn hiển thị đầy đủ, có trạng thái trống thân thiện */}
          <div className="flex flex-col gap-4 sm:gap-5">
            <section className="card-surface p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                  <CalendarDays className="size-5" />
                </div>
                <h2 className="text-base font-semibold">Công việc hôm nay</h2>
                <Link to="/schedule" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-info hover:underline">
                  Xem tất cả <ChevronRight className="size-3.5" />
                </Link>
              </div>
              {projectData.todayTasks.length > 0 ? (
                <ul className="mt-4 divide-y divide-border">
                  {projectData.todayTasks.map((w) => (
                    <li key={w.task_id || w.task_name} className="flex items-center gap-3 py-3.5">
                      <span className={`size-2.5 shrink-0 rounded-full ${w.is_critical ? 'bg-danger' : 'bg-info'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{w.task_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {w.assignee || 'Chưa giao'} · {w.percent_complete || 0}%
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {w.early_finish ? w.early_finish.split('T')[0].split('-').reverse().join('/') : ''}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <div className="size-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="size-4.5" />
                  </div>
                  <p className="font-semibold text-foreground text-xs">Không có công việc đến hạn hôm nay</p>
                  <p className="text-[11px] text-muted-foreground">Tiến độ hiện trường đang bám sát kế hoạch</p>
                </div>
              )}
            </section>

            <section className="card-surface p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                  <AlertTriangle className="size-5" />
                </div>
                <h2 className="text-base font-semibold">Cảnh báo & rủi ro</h2>
                <Link to="/warnings" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-info hover:underline">
                  Xem tất cả <ChevronRight className="size-3.5" />
                </Link>
              </div>
              {projectData.risks.length > 0 ? (
                <ul className="mt-4 divide-y divide-border">
                  {projectData.risks.map((r) => (
                    <li key={r.title} className="flex items-center gap-3 py-3.5">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${toneIcon[r.tone]}`}
                      >
                        <r.icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.sub}</p>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <div className="size-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ShieldCheck className="size-4.5" />
                  </div>
                  <p className="font-semibold text-foreground text-xs">Công trường an toàn</p>
                  <p className="text-[11px] text-muted-foreground">Chưa ghi nhận rủi ro trễ hạn hay cảnh báo chi phí</p>
                </div>
              )}
            </section>

            <section className="card-surface p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                  <Wallet className="size-5" />
                </div>
                <h2 className="text-base font-semibold">Dự toán và thực chi lũy kế</h2>
                <Link to="/budgets" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-info hover:underline">
                  Xem chi tiết <ChevronRight className="size-3.5" />
                </Link>
              </div>
              {projectData.budgetTotal > 0 ? (
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-sm font-medium">
                      Dự toán: {(projectData.budgetTotal / 1e9).toFixed(2)} tỷ
                    </p>
                    <div className="mt-2 h-2.5 rounded-full bg-muted">
                      <div className="h-2.5 w-full rounded-full bg-info" />
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Thực chi: {((projectData.actualTotal / projectData.budgetTotal) * 100).toFixed(0)}%
                      ({(projectData.actualTotal / 1e9).toFixed(2)} tỷ)
                    </p>
                    <div className="mt-2 h-2.5 rounded-full bg-muted">
                      <div
                        className="h-2.5 rounded-full bg-info"
                        style={{ width: `${Math.min(100, (projectData.actualTotal / projectData.budgetTotal) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-5 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                  <div className="size-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                    <Wallet className="size-4.5" />
                  </div>
                  <p className="font-semibold text-foreground text-xs">Chưa khai báo dự toán</p>
                  <p className="text-[11px] text-muted-foreground">Khai báo dự toán để theo dõi ngân sách và thực chi</p>
                  <Link to="/budgets" className="mt-1 text-xs font-semibold text-info hover:underline">
                    Khai báo ngay &rarr;
                  </Link>
                </div>
              )}
            </section>
          </div>
        </main>
  );
}
