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

// Removed static tasks

const todayWork = [
  { title: "Móng cọc - Khu A", sub: "Đội nền móng · 3/5", time: "08:00", dot: "bg-info" },
  { title: "Thi công cột tầng 1", sub: "Đội kết cấu · 2/4", time: "10:30", dot: "bg-warning" },
  { title: "Nghiệm thu thép D20", sub: "Kỹ sư giám sát · 0/1", time: "14:00", dot: "bg-info" },
  { title: "Báo cáo tiến độ ngày", sub: "Chỉ huy trưởng · 1/1", time: "16:30", dot: "bg-success" },
];

const risks = [
  {
    icon: AlertTriangle,
    title: "Mưa lớn 48h tới",
    sub: "Có thể ảnh hưởng thi công ngoài trời",
    tone: "danger"
  },
  {
    icon: AlertCircle,
    title: "Chậm vật tư thép D20",
    sub: "Dự kiến giao trễ 2 ngày",
    tone: "warning"
  },
  {
    icon: Info,
    title: "Thiếu nhân công cố pha",
    sub: "Còn thiếu 3 người",
    tone: "info"
  },
];

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
    criticalTasks: []
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [projRes, sumRes, resRes, memRes] = await Promise.all([
          api.get(`/projects/${currentProjectId}`),
          api.get(`/projects/${currentProjectId}/schedule-summary`).catch(() => ({ data: {} })),
          api.get(`/projects/${currentProjectId}/schedule-results`).catch(() => ({ data: { data: [] } })),
          api.get(`/projects/${currentProjectId}/members`).catch(() => ({ data: { members: [] } }))
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

        setProjectData({
          name: proj.name || "Chưa có tên",
          startDate: proj.start_date,
          membersCount: mems.length,
          plannedFinish: sum.planned_finish_date,
          currentFinish: sum.current_finish_date,
          actualProgress: actualProg,
          plannedProgress: sum.planned_progress || actualProg, // For now planned matches actual if empty
          criticalTaskCount: results.filter(t => t.is_critical).length,
          criticalTasks: criticalTasks.slice(0, 5) // top 5
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

  return (

        <main className="grid flex-1 gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Left column */}
          <div className="flex min-w-0 flex-col gap-5">
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
              <div className="relative p-7">
                <p className="text-lg font-semibold text-info">Xin chào, {user?.name || 'Hương Lan'} 👋</p>
                <h1 className="mt-1 text-4xl font-bold tracking-tight">Tổng quan dự án</h1>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Theo dõi tiến độ, nghiệm thu và tình hình thi công công trình một cách nhanh chóng
                  và chính xác.
                </p>

                <div className="card-surface mt-6 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-info-soft text-info">
                      <Building2 className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">Dự án {projectData.name}</p>
                      <p className="truncate text-xs text-muted-foreground">Tổng quan công trình</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-info-soft text-info">
                      <CalendarDays className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Ngày bắt đầu</p>
                      <p className="whitespace-nowrap text-sm font-semibold">
                        {projectData.startDate ? format(parseISO(projectData.startDate), 'dd/MM/yyyy') : '--'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-info-soft text-info">
                      <UsersRound className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Số lượng nhân sự</p>
                      <p className="whitespace-nowrap text-sm font-semibold">{projectData.membersCount} người</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-info-soft text-info">
                      <CalendarDays className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Thời gian sprint</p>
                      <p className="whitespace-nowrap text-sm font-semibold">1 tuần</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* KPI cards */}
            <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <article className="card-surface p-5">
                <div className="flex items-start gap-3 [&>div]:min-w-0">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-info-soft text-info">
                    <CalendarDays className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-info-foreground">Tiến độ thực tế</p>
                    <p className="whitespace-nowrap text-2xl font-bold">{projectData.actualProgress}%</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  ↘ Kế hoạch {projectData.plannedProgress}% 
                  {projectData.actualProgress < projectData.plannedProgress && 
                    <span className="text-danger-foreground"> · Chênh -{projectData.plannedProgress - projectData.actualProgress}%</span>
                  }
                </p>
                <div className="mt-3 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-info" style={{ width: `${projectData.actualProgress}%` }} />
                </div>
              </article>

              <article className="card-surface bg-danger-soft/60 p-5">
                <div className="flex items-start gap-3 [&>div]:min-w-0">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
                    <CalendarDays className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-danger-foreground">Dự kiến hoàn thành</p>
                    <p className="whitespace-nowrap text-xl font-bold">
                      {projectData.currentFinish ? format(parseISO(projectData.currentFinish), 'dd/MM/yyyy') : '--'}
                    </p>
                  </div>
                </div>
                {delayDays > 0 ? (
                  <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-danger/25 bg-card px-2.5 py-1.5 text-xs text-danger-foreground">
                    <AlertCircle className="size-3.5" /> Trễ {delayDays} ngày so với kế hoạch gốc
                  </p>
                ) : (
                  <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-card px-2.5 py-1.5 text-xs text-success-foreground">
                    <AlertCircle className="size-3.5" /> Đúng tiến độ gốc
                  </p>
                )}
              </article>

              <article className="card-surface bg-success-soft/50 p-5">
                <div className="flex items-start gap-3 [&>div]:min-w-0">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-success text-primary-foreground">
                    <UsersRound className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-success-foreground">
                      Công việc đường găng
                    </p>
                    <p className="whitespace-nowrap text-2xl font-bold">{projectData.criticalTaskCount} việc</p>
                  </div>
                </div>
                <p className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-warning/30 bg-card px-2.5 py-1.5 text-xs text-warning-foreground">
                  <AlertCircle className="size-3.5" /> Ưu tiên điều phối nhân lực
                </p>
              </article>

              <article className="card-surface bg-warning-soft/50 p-5">
                <div className="flex items-start gap-3 [&>div]:min-w-0">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-warning text-primary-foreground">
                    <ClipboardList className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-warning-foreground">
                      Nghiệm thu chờ duyệt
                    </p>
                    <p className="whitespace-nowrap text-2xl font-bold">5 phiếu</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  2 phiếu quá 24h · chờ thanh toán
                </p>
                <p className="text-xl font-bold">1,24 tỷ</p>
              </article>
            </section>

            {/* Task table */}
            <section className="card-surface p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                  <ClipboardList className="size-5" />
                </div>
                <h2 className="text-base font-semibold">
                  Công việc ưu tiên hôm nay (xếp theo ảnh hưởng đường găng)
                </h2>
                <button className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-info">
                  Xem tất cả <ChevronRight className="size-4" />
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-3 py-3 font-medium">Công việc</th>
                      <th className="px-3 py-3 font-medium">Đội phụ trách</th>
                      <th className="px-3 py-3 font-medium">Tiến độ</th>
                      <th className="px-3 py-3 font-medium">Thời hạn</th>
                      <th className="px-3 py-3 font-medium">Trạng thái</th>
                      <th className="px-3 py-3 font-medium">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectData.criticalTasks.length === 0 ? (
                      <tr><td colSpan="6" className="px-3 py-8 text-center text-muted-foreground font-medium">Không có công việc ưu tiên nào</td></tr>
                    ) : projectData.criticalTasks.map((t) => (
                      <tr key={t.task_id} className="border-b border-border/70 last:border-0">
                        <td className="px-3 py-4">
                          <span className="flex items-center gap-3 font-medium">
                            <span className="h-6 w-1.5 rounded-full bg-danger" />
                            {t.task_name}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-muted-foreground">{t.assignee || 'Chưa giao'}</td>
                        <td className="px-3 py-4">{t.percent_complete || 0}%</td>
                        <td className="px-3 py-4">{t.early_finish ? format(parseISO(t.early_finish), 'dd/MM/yyyy') : '--'}</td>
                        <td className="px-3 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold bg-danger-soft text-danger-foreground border-danger/25">
                            ◆ GĂNG
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <Link to="/schedule" className="rounded-lg border border-info/30 px-3 py-1.5 text-xs font-medium text-info transition-colors hover:bg-info-soft">
                            Cập nhật
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Footer strip */}
            <section className="card-surface grid gap-5 p-5 md:grid-cols-3">
              {[
                { icon: ShieldCheck, title: "An toàn lao động", sub: "Tối ưu và an toàn" },
                { icon: Zap, title: "Vận hành ổn định", sub: "Luôn sẵn sàng" },
                { icon: HeartHandshake, title: "Đồng hành cùng bạn", sub: "Trên mọi công trình" },
              ].map((item) => (
                <div key={item.title} className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-info-soft text-info">
                    <item.icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.sub}</p>
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            <section className="card-surface p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                  <CalendarDays className="size-5" />
                </div>
                <h2 className="text-base font-semibold">Công việc hôm nay</h2>
                <button className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-info">
                  Xem tất cả <ChevronRight className="size-3.5" />
                </button>
              </div>
              <ul className="mt-4 divide-y divide-border">
                {todayWork.map((w) => (
                  <li key={w.title} className="flex items-center gap-3 py-3.5">
                    <span className={`size-2.5 shrink-0 rounded-full ${w.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{w.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{w.sub}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{w.time}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            </section>

            <section className="card-surface p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                  <AlertTriangle className="size-5" />
                </div>
                <h2 className="text-base font-semibold">Cảnh báo & rủi ro</h2>
                <button className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-info">
                  Xem tất cả <ChevronRight className="size-3.5" />
                </button>
              </div>
              <ul className="mt-4 divide-y divide-border">
                {risks.map((r) => (
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
            </section>

            <section className="card-surface p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                  <Wallet className="size-5" />
                </div>
                <h2 className="text-base font-semibold">Dự toán và thực chi lũy kế</h2>
                <button className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-info">
                  Xem chi tiết <ChevronRight className="size-3.5" />
                </button>
              </div>
              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-sm font-medium">Dự toán: 100%</p>
                  <div className="mt-2 h-2.5 rounded-full bg-muted">
                    <div className="h-2.5 w-full rounded-full bg-info" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Thực chi: 81%</p>
                  <div className="mt-2 h-2.5 rounded-full bg-muted">
                    <div className="h-2.5 w-[81%] rounded-full bg-info" />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </main>
  );
}
