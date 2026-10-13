import React, { useState, useEffect, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import api from "../lib/api";
import useDiarySyncStatus from "../hooks/useDiarySyncStatus";
import {
  CalendarDays,
  Building2,
  UsersRound,
  ClipboardList,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Clock,
  CheckSquare,
  FileText,
  Camera,
  Wallet,
  ArrowUpRight,
  Flame,
  HardHat,
  Receipt,
} from "lucide-react";

import heroImage from "../assets/hero-site.jpg";

export default function LandingPage({ user }) {
  const currentProjectId = localStorage.getItem("currentProjectId") || 2;
  const outletContext = useOutletContext() || {};
  const { stats, isOnline } = useDiarySyncStatus();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dữ liệu thực từ API backend
  const [project, setProject] = useState(null);
  const [membership, setMembership] = useState(outletContext.projectRole || null);
  const [scheduleSummary, setScheduleSummary] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [warnings, setWarnings] = useState({ open: [], closed: [] });
  const [vouchers, setVouchers] = useState([]);
  const [contractData, setContractData] = useState(null);
  const [membersCount, setMembersCount] = useState(0);
  const [todayDiaries, setTodayDiaries] = useState([]);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        projRes,
        sumRes,
        resRes,
        warnRes,
        vouchRes,
        contractRes,
        memRes,
        diaryRes,
      ] = await Promise.all([
        api.get(`/projects/${currentProjectId}`),
        api.get(`/projects/${currentProjectId}/schedule-summary`).catch(() => ({ data: null })),
        api.get(`/projects/${currentProjectId}/schedule-results`).catch(() => ({ data: { data: [] } })),
        api.get(`/projects/${currentProjectId}/warnings`).catch(() => ({ data: { open: [], closed: [] } })),
        api.get(`/projects/${currentProjectId}/acceptance-vouchers`).catch(() => ({ data: { vouchers: [] } })),
        api.get(`/projects/${currentProjectId}/contract-quantities`).catch(() => ({ data: null })),
        api.get(`/projects/${currentProjectId}/members`).catch(() => ({ data: { members: [] } })),
        api.get(`/projects/${currentProjectId}/diary-entries?date=${todayStr}`).catch(() => ({ data: { data: [] } })),
      ]);

      setProject(projRes.data?.project || null);
      if (projRes.data?.membership) {
        setMembership(projRes.data.membership);
      }
      setScheduleSummary(sumRes.data || null);
      setTasks(Array.isArray(resRes.data?.data) ? resRes.data.data : []);
      
      const warnData = warnRes.data?.data || warnRes.data || {};
      setWarnings({
        open: Array.isArray(warnData.open) ? warnData.open : [],
        closed: Array.isArray(warnData.closed) ? warnData.closed : [],
      });

      setVouchers(Array.isArray(vouchRes.data?.vouchers) ? vouchRes.data.vouchers : []);
      setContractData(contractRes.data || null);
      setMembersCount(Array.isArray(memRes.data?.members) ? memRes.data.members.length : 0);
      
      const diaryEntries = Array.isArray(diaryRes.data?.data) 
        ? diaryRes.data.data 
        : Array.isArray(diaryRes.data?.entries) 
          ? diaryRes.data.entries 
          : [];
      setTodayDiaries(diaryEntries);
    } catch (err) {
      console.error("Lỗi tải dữ liệu Dashboard:", err);
      setError("Không thể tải dữ liệu bảng điều khiển. Vui lòng kiểm tra kết nối máy chủ.");
    } finally {
      setLoading(false);
    }
  }, [currentProjectId, todayStr]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Xác định vai trò hiệu lực
  const effectiveRole = membership || outletContext.projectRole || user?.role;
  const isSystemAdmin = Boolean(user?.is_system_admin || outletContext.is_system_admin);

  // Tính toán Tiến độ dự án
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => (t.percent_complete || 0) >= 100);
  const inProgressTasks = tasks.filter(
    (t) => (t.percent_complete || 0) > 0 && (t.percent_complete || 0) < 100
  );
  const notStartedTasks = tasks.filter((t) => (t.percent_complete || 0) === 0);

  const actualProgress =
    totalTasks > 0
      ? Math.round(
          tasks.reduce((sum, t) => sum + (Number(t.percent_complete) || 0), 0) / totalTasks
        )
      : project?.actual_progress != null
      ? Math.round(Number(project.actual_progress))
      : null;

  const plannedProgress =
    scheduleSummary?.planned_progress != null
      ? Math.round(Number(scheduleSummary.planned_progress))
      : project?.planned_progress != null
      ? Math.round(Number(project.planned_progress))
      : actualProgress;

  const progressDelta =
    actualProgress != null && plannedProgress != null
      ? actualProgress - plannedProgress
      : null;

  // Tính toán Công việc ưu tiên
  const overdueTasks = tasks.filter((t) => {
    if ((t.percent_complete || 0) >= 100) return false;
    if (!t.early_finish) return false;
    const finishDate = t.early_finish.slice(0, 10);
    return finishDate < todayStr;
  });

  const criticalTasks = tasks.filter(
    (t) => Boolean(t.is_critical) && (t.percent_complete || 0) < 100
  );

  const todayTasks = tasks.filter((t) => {
    const start = t.early_start ? t.early_start.slice(0, 10) : "";
    const finish = t.early_finish ? t.early_finish.slice(0, 10) : "";
    return (start <= todayStr && todayStr <= finish) || start === todayStr || finish === todayStr;
  });

  // Hợp nhất danh sách ưu tiên không trùng lặp
  const priorityTasksMap = new Map();
  overdueTasks.forEach((t) => priorityTasksMap.set(t.id, { ...t, priorityReason: "overdue" }));
  criticalTasks.forEach((t) => {
    if (!priorityTasksMap.has(t.id)) {
      priorityTasksMap.set(t.id, { ...t, priorityReason: "critical" });
    }
  });
  todayTasks.forEach((t) => {
    if (!priorityTasksMap.has(t.id)) {
      priorityTasksMap.set(t.id, { ...t, priorityReason: "today" });
    }
  });
  const priorityTasksList = Array.from(priorityTasksMap.values()).slice(0, 6);

  // Nghiệm thu và Hợp đồng
  const pendingVouchers = vouchers.filter(
    (v) => v.status === "draft" || v.status === "pending"
  );
  const approvedVouchers = vouchers.filter((v) => v.status === "approved");
  const totalAcceptanceItems = vouchers.reduce(
    (sum, v) => sum + (Number(v.item_count) || 0),
    0
  );

  // Tính chênh lệch ngày CPM
  const plannedFinish = scheduleSummary?.planned_finish_date;
  const currentFinish = scheduleSummary?.current_finish_date;
  const delayDays =
    plannedFinish && currentFinish
      ? differenceInCalendarDays(parseISO(currentFinish), parseISO(plannedFinish))
      : 0;

  // Phân quyền hiển thị từng khu vực Dashboard theo vai trò
  const showProgressSection = true; // Mọi vai trò đều xem được tổng quan dự án
  const showPriorityTasksSection = !["ke_toan"].includes(effectiveRole) || isSystemAdmin;
  const showSiteActivitySection = !["ke_toan"].includes(effectiveRole) || isSystemAdmin;
  const showAcceptanceAndFinanceSection =
    !["doi_truong"].includes(effectiveRole) || isSystemAdmin;
  const showWarningsSection = !["ke_toan"].includes(effectiveRole) || isSystemAdmin;

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <RefreshCw className="size-8 animate-spin text-info" />
          <p className="text-sm font-medium">Đang tải dữ liệu thực tế từ hệ thống...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md rounded-2xl border border-danger/30 bg-card p-6 text-center shadow-lg">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-danger-soft text-danger">
            <AlertCircle className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-foreground">Không thể tải dữ liệu</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={loadDashboardData}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-info px-4 py-2.5 text-sm font-semibold text-white shadow transition-all hover:bg-info/90 active:scale-95"
          >
            <RefreshCw className="size-4" /> Thử lại
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="grid flex-1 gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_360px] overflow-y-auto">
      {/* CỘT CHÍNH (BÊN TRÁI) */}
      <div className="flex min-w-0 flex-col gap-6">
        {/* BANNER TỔNG QUAN DỰ ÁN */}
        <section className="hero-surface relative overflow-hidden rounded-2xl border border-border">
          <img
            src={heroImage}
            alt="Công trường thi công"
            width={1280}
            height={640}
            className="absolute right-0 top-0 hidden h-[60%] w-[38%] rounded-tr-2xl object-cover md:block"
            style={{
              maskImage: "linear-gradient(90deg, transparent, #000 35%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent, #000 35%)",
            }}
          />
          <div className="relative p-6 sm:p-7">
            {/* Lời chào ngắn gọn, thân thiện theo yêu cầu */}
            <div className="flex items-center gap-2 text-sm font-medium text-info">
              <span>Xin chào, {user?.name || "Người dùng"} 👋</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Dự án {project?.name || "Chưa chọn dự án"}
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              Bảng điều khiển theo dõi tiến độ thi công, đường găng CPM, nghiệm thu và nhật ký hiện trường với dữ liệu thực tế từ hệ thống.
            </p>

            <div className="card-surface mt-6 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info shrink-0">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">Dự án</p>
                  <p className="truncate text-sm font-semibold">{project?.name || "—"}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info shrink-0">
                  <CalendarDays className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Ngày khởi công</p>
                  <p className="whitespace-nowrap text-sm font-semibold">
                    {project?.start_date ? format(parseISO(project.start_date), "dd/MM/yyyy") : "Chưa có dữ liệu"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info shrink-0">
                  <UsersRound className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Nhân sự tham gia</p>
                  <p className="whitespace-nowrap text-sm font-semibold">
                    {membersCount > 0 ? `${membersCount} thành viên` : "Chưa có thành viên"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info shrink-0">
                  <Clock className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Hoàn thành CPM</p>
                  <p className="whitespace-nowrap text-sm font-semibold">
                    {currentFinish ? format(parseISO(currentFinish), "dd/MM/yyyy") : "Chưa lập lịch CPM"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TỔNG QUAN TIẾN ĐỘ */}
        {showProgressSection && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <CalendarDays className="size-4 text-info" /> Tổng quan tiến độ
              </h2>
              {effectiveRole !== "ke_toan" && (
                <Link
                  to="/schedule"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
                >
                  Xem bảng CPM <ChevronRight className="size-3.5" />
                </Link>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* Card 1: Tiến độ thực tế vs Kế hoạch */}
              <article className="card-surface p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Tiến độ thực tế</p>
                      <p className="mt-1 text-2xl font-bold">
                        {actualProgress != null ? `${actualProgress}%` : "Chưa có dữ liệu"}
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info">
                      <CalendarDays className="size-5" />
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Kế hoạch: {plannedProgress != null ? `${plannedProgress}%` : "—"}</span>
                      {progressDelta != null && (
                        <span
                          className={`font-semibold ${
                            progressDelta < 0
                              ? "text-danger"
                              : progressDelta > 0
                              ? "text-success"
                              : "text-muted-foreground"
                          }`}
                        >
                          {progressDelta < 0
                            ? `Chậm ${Math.abs(progressDelta)}%`
                            : progressDelta > 0
                            ? `Vượt +${progressDelta}%`
                            : "Đúng hạn"}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-info transition-all duration-500"
                        style={{ width: `${Math.min(actualProgress || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </article>

              {/* Card 2: Hạn hoàn thành & Chênh lệch ngày */}
              <article className="card-surface p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Hạn hoàn thành CPM</p>
                      <p className="mt-1 text-lg font-bold">
                        {currentFinish ? format(parseISO(currentFinish), "dd/MM/yyyy") : "Chưa lập tiến độ"}
                      </p>
                    </div>
                    <div
                      className={`flex size-10 items-center justify-center rounded-xl ${
                        delayDays > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                      }`}
                    >
                      <Clock className="size-5" />
                    </div>
                  </div>

                  <div className="mt-3">
                    {delayDays > 0 ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger-soft/40 px-2 py-1 text-xs font-semibold text-danger">
                        <AlertCircle className="size-3.5" /> Trễ {delayDays} ngày so với kế hoạch
                      </div>
                    ) : currentFinish ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success-soft/40 px-2 py-1 text-xs font-semibold text-success">
                        <CheckCircle2 className="size-3.5" /> Đúng tiến độ theo đường găng
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Chưa có mốc thời gian hoàn thành</p>
                    )}
                  </div>
                </div>
              </article>

              {/* Card 3: Phân bố công việc */}
              <article className="card-surface p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Tổng số công việc</p>
                      <p className="mt-1 text-2xl font-bold">{totalTasks} việc</p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-info-soft text-info">
                      <ClipboardList className="size-5" />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1 text-center text-xs">
                    <div className="rounded-lg bg-success-soft/50 p-1.5">
                      <p className="font-bold text-success">{completedTasks.length}</p>
                      <p className="text-[10px] text-muted-foreground">Xong</p>
                    </div>
                    <div className="rounded-lg bg-info-soft/50 p-1.5">
                      <p className="font-bold text-info">{inProgressTasks.length}</p>
                      <p className="text-[10px] text-muted-foreground">Đang làm</p>
                    </div>
                    <div className="rounded-lg bg-muted p-1.5">
                      <p className="font-bold text-muted-foreground">{notStartedTasks.length}</p>
                      <p className="text-[10px] text-muted-foreground">Chưa làm</p>
                    </div>
                  </div>
                </div>
              </article>

              {/* Card 4: Công việc đường găng */}
              <article className="card-surface p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Việc trên đường găng</p>
                      <p className="mt-1 text-2xl font-bold text-danger">{criticalTasks.length} việc</p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-danger-soft text-danger">
                      <Flame className="size-5" />
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
                    {criticalTasks.length > 0 ? (
                      <span className="text-danger font-semibold">
                        Cần ưu tiên thi công, không có độ trễ dự phòng
                      </span>
                    ) : (
                      <span>Không có công việc găng chưa hoàn thành</span>
                    )}
                  </p>
                </div>
              </article>
            </div>
          </section>
        )}

        {/* CÔNG VIỆC ƯU TIÊN */}
        {showPriorityTasksSection && (
          <section className="card-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-danger-soft text-danger">
                  <AlertTriangle className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    {effectiveRole === "doi_truong" ? "Công việc của đội tôi" : "Công việc ưu tiên"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {effectiveRole === "doi_truong"
                      ? "Các công việc thi công cần thực hiện và báo cáo tiến độ khối lượng"
                      : "Bao gồm công việc quá hạn, công việc thuộc đường găng và công việc thi công trong ngày"}
                  </p>
                </div>
              </div>
              <Link
                to={effectiveRole === "doi_truong" ? "/field" : "/schedule"}
                className="inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
              >
                {effectiveRole === "doi_truong" ? "Mở Hiện trường & Giao việc" : "Toàn bộ tiến độ CPM"}{" "}
                <ChevronRight className="size-3.5" />
              </Link>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold text-muted-foreground uppercase">
                    <th className="px-3 py-2.5">Công việc / Hạng mục</th>
                    <th className="px-3 py-2.5">Thời hạn CPM</th>
                    <th className="px-3 py-2.5">Tiến độ</th>
                    <th className="px-3 py-2.5">Loại ưu tiên</th>
                    <th className="px-3 py-2.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityTasksList.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-3 py-8 text-center text-muted-foreground">
                        <CheckCircle2 className="mx-auto size-7 text-success mb-2" />
                        <p className="text-sm font-medium">Không có công việc ưu tiên nào cần xử lý khẩn</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Tất cả các công việc đang đúng tiến độ hoặc chưa có lịch trình phát sinh
                        </p>
                      </td>
                    </tr>
                  ) : (
                    priorityTasksList.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b border-border/60 last:border-0 hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-3 py-3">
                          <div className="font-semibold text-foreground">{t.name || `Công việc #${t.id}`}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.work_item_name ? `Hạng mục: ${t.work_item_name}` : "Chưa gán hạng mục"}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                          {t.early_finish ? format(parseISO(t.early_finish), "dd/MM/yyyy") : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs">{t.percent_complete || 0}%</span>
                            <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-info"
                                style={{ width: `${t.percent_complete || 0}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {t.is_critical && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger mr-1">
                              ◆ GĂNG
                            </span>
                          )}
                          {t.early_finish && t.early_finish.slice(0, 10) < todayStr && (t.percent_complete || 0) < 100 && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-warning/30 bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning mr-1">
                              QUÁ HẠN
                            </span>
                          )}
                          {t.early_start && t.early_start.slice(0, 10) <= todayStr && (t.early_finish ? t.early_finish.slice(0, 10) >= todayStr : true) && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-info/30 bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info">
                              HÔM NAY
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            to={effectiveRole === "doi_truong" ? "/field" : "/schedule"}
                            className="inline-flex items-center rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                          >
                            {effectiveRole === "doi_truong" ? "Báo khối lượng" : "Cập nhật"}
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* NGHIỆM THU & TÀI CHÍNH */}
        {showAcceptanceAndFinanceSection && (
          <section className="card-surface p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-xl bg-info-soft text-info">
                  <CheckSquare className="size-4" />
                </div>
                <h2 className="text-base font-bold text-foreground">
                  Nghiệm thu & Tài chính
                </h2>
              </div>
              <Link
                to="/acceptance"
                className="inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
              >
                Xem phiếu nghiệm thu <ChevronRight className="size-3.5" />
              </Link>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Khối 1: Phiếu nghiệm thu */}
              <div className="rounded-xl border border-border p-4 bg-card/60">
                <p className="text-xs font-medium text-muted-foreground">Phiếu nghiệm thu khối lượng</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-foreground">{vouchers.length}</span>
                  <span className="text-xs text-muted-foreground">phiếu tổng cộng</span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-warning-soft px-2 py-0.5 font-semibold text-warning">
                    {pendingVouchers.length} chờ duyệt
                  </span>
                  <span className="rounded-md bg-success-soft px-2 py-0.5 font-semibold text-success">
                    {approvedVouchers.length} đã duyệt
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Tổng cộng {totalAcceptanceItems} hạng mục nghiệm thu
                </p>
              </div>

              {/* Khối 2: Khối lượng hợp đồng */}
              <div className="rounded-xl border border-border p-4 bg-card/60">
                <p className="text-xs font-medium text-muted-foreground">Khối lượng hợp đồng</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-foreground">
                    {contractData?.items ? contractData.items.length : 0}
                  </span>
                  <span className="text-xs text-muted-foreground">hạng mục khai báo</span>
                </div>
                <div className="mt-3 text-xs">
                  {contractData?.can_view_prices && contractData?.project_total ? (
                    <p className="font-semibold text-foreground">
                      Tổng giá trị: {contractData.project_total}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      {contractData?.can_view_prices === false
                        ? "Đơn giá ẩn theo phân quyền vai trò"
                        : "Chưa khai giá trị hợp đồng"}
                    </p>
                  )}
                </div>
                <Link
                  to="/contract-quantities"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-info hover:underline"
                >
                  Chi tiết khối lượng <ArrowUpRight className="size-3" />
                </Link>
              </div>

              {/* Khối 3: Chi phí và thanh toán thực tế (Trung thực) */}
              <div className="rounded-xl border border-dashed border-border p-4 bg-muted/20 sm:col-span-2 lg:col-span-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Wallet className="size-3.5" /> Chi phí & Thanh toán thực tế
                </div>
                <div className="mt-2">
                  <span className="inline-block rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                    Chưa hỗ trợ thống kê
                  </span>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    Module quản lý thanh toán và dòng tiền dự án đang trong lộ trình phát triển. Hệ thống không tạo số liệu giả định.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* CỘT PHỤ (BÊN PHẢI) */}
      <div className="flex flex-col gap-6">
        {/* HOẠT ĐỘNG HIỆN TRƯỜNG */}
        {showSiteActivitySection && (
          <section className="card-surface p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-info-soft text-info">
                  <FileText className="size-4" />
                </div>
                <h2 className="text-sm font-bold text-foreground">
                  Hoạt động hiện trường
                </h2>
              </div>
              <Link
                to="/diary"
                className="inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
              >
                Mở sổ <ChevronRight className="size-3" />
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {/* Nhật ký hôm nay */}
              <div className="flex items-center justify-between rounded-xl border border-border p-3 bg-card/60">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                    <CalendarDays className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Nhật ký hôm nay</p>
                    <p className="text-sm font-bold text-foreground">
                      {todayDiaries.length > 0 ? `${todayDiaries.length} bản ghi` : "0 nhật ký"}
                    </p>
                  </div>
                </div>
                <Link
                  to="/diary"
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                >
                  Ghi sổ
                </Link>
              </div>

              {/* Trạng thái ngoại tuyến / chờ đồng bộ */}
              <div className="flex items-center justify-between rounded-xl border border-border p-3 bg-card/60">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-9 items-center justify-center rounded-lg ${
                      stats.totalPending > 0
                        ? "bg-warning-soft text-warning"
                        : "bg-success-soft text-success"
                    }`}
                  >
                    <RefreshCw className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Hàng đợi đồng bộ</p>
                    <p className="text-sm font-bold text-foreground">
                      {stats.totalPending > 0
                        ? `${stats.totalPending} bản ghi chờ đồng bộ`
                        : "Đã đồng bộ toàn bộ"}
                    </p>
                  </div>
                </div>
                <span
                  className={`size-2.5 rounded-full ${
                    isOnline ? "bg-success" : "bg-warning"
                  }`}
                  title={isOnline ? "Trực tuyến" : "Ngoại tuyến"}
                />
              </div>

              {/* Công việc hiện trường */}
              <div className="flex items-center justify-between rounded-xl border border-border p-3 bg-card/60">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-info">
                    <Camera className="size-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Công việc hiện trường</p>
                    <p className="text-sm font-bold text-foreground">
                      {inProgressTasks.length > 0
                        ? `${inProgressTasks.length} việc đang thi công`
                        : "Chưa có việc đang làm"}
                    </p>
                  </div>
                </div>
                <Link
                  to="/field"
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                >
                  Xem
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* CẢNH BÁO & RỦI RO */}
        {showWarningsSection && (
          <section className="card-surface p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-warning-soft text-warning">
                  <AlertTriangle className="size-4" />
                </div>
                <h2 className="text-sm font-bold text-foreground">
                  Cảnh báo & Rủi ro
                </h2>
              </div>
              <Link
                to="/schedule"
                className="inline-flex items-center gap-1 text-xs font-semibold text-info hover:underline"
              >
                Chi tiết <ChevronRight className="size-3" />
              </Link>
            </div>

            <div className="mt-4">
              {warnings.open.length === 0 ? (
                <div className="rounded-xl border border-success/25 bg-success-soft/30 p-4 text-center">
                  <CheckCircle2 className="mx-auto size-6 text-success mb-1.5" />
                  <p className="text-xs font-semibold text-success">
                    Không có cảnh báo tiến độ nào
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Các mốc tiến độ quan trọng đều nằm trong giới hạn an toàn theo backend.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {warnings.open.map((w) => (
                    <li key={w.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-danger-soft text-danger">
                          <AlertCircle className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground">
                            {w.work_item_name || `Mốc #${w.milestone_id || w.id}`}
                          </p>
                          <p className="text-[11px] text-danger font-medium mt-0.5">
                            Trễ {w.overdue_days} ngày so với mốc yêu cầu
                          </p>
                          {w.required_date && (
                            <p className="text-[10px] text-muted-foreground">
                              Hạn mốc: {format(parseISO(w.required_date), "dd/MM/yyyy")}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* NGUYÊN TẮC DỮ LIỆU THỰC TẾ */}
        <section className="card-surface p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Dữ liệu thực tế và phân quyền</p>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Tất cả chỉ số tiến độ, đường găng, nghiệm thu và cảnh báo được truy vấn trực tiếp theo vai trò và phân quyền trong dự án hiện tại.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
