import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../lib/api";
import { format, parseISO } from "date-fns";
import {
  TrendingUp,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  Clock,
  Filter,
  Search,
  Edit3,
} from "lucide-react";
import TaskProgressModal from "../components/TaskProgressModal";

// Server đã dựng sẵn câu "A chờ B, B chờ C, C chờ A" trong message,
// nên frontend dùng luôn, không tự ghép lại.
function getErrorText(err, fallback) {
  return err.response?.data?.message || fallback;
}

export default function SchedulePage() {
  const [scheduleData, setScheduleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [hoveredRowId, setHoveredRowId] = useState(null);
  const [selectedTaskForProgress, setSelectedTaskForProgress] = useState(null);
  const [summary, setSummary] = useState(null);

  const currentProjectId = localStorage.getItem("currentProjectId") || 1;

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      setErrorMessage("");

      const res = await api.get(
        `/projects/${currentProjectId}/schedule-results`
      );

      const rows = res.data.data || [];
      setScheduleData(rows);
      setSummary(res.data.summary || null);

      // Có việc nhưng chưa có mốc nào => chưa từng tính
      // hoặc chưa tính được. Thử tính một lần để phát hiện vòng.
      const neverCalculated =
        rows.length > 0 && rows.every((r) => !r.early_start);

      if (neverCalculated) {
        try {
          const calcRes = await api.post(
            `/projects/${currentProjectId}/schedule/recalculate`
          );

          if (calcRes.status === 202 && calcRes.data?.jobId) {
            setRecalculating(true);
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
            if (jobStatus === 'failed') {
              throw { response: { data: jobErrorDetails } };
            }
            setRecalculating(false);
          }

          const again = await api.get(
            `/projects/${currentProjectId}/schedule-results`
          );

          setScheduleData(again.data.data || []);
        } catch (calcErr) {
          setRecalculating(false);
          if (calcErr.response?.data?.code === "DEPENDENCY_CYCLE" || calcErr.response?.data?.message) {
            setErrorMessage(calcErr.response.data.message);
          }
        }
      }
    } catch (err) {
      console.error("Lỗi tải tiến độ CPM:", err);

      setErrorMessage(
        getErrorText(
          err,
          "Không thể tải dữ liệu tiến độ & đường găng."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      setErrorMessage("");
      setSuccessMessage("");

      const res = await api.post(
        `/projects/${currentProjectId}/schedule/recalculate`
      );

      if (res.status === 202 && res.data?.jobId) {
        let jobStatus = 'queued';
        let currentDelay = 1000;
        let jobErrorDetails = null;

        while (jobStatus === 'queued' || jobStatus === 'running') {
          await new Promise(r => setTimeout(r, currentDelay));
          try {
            const jobRes = await api.get(`/projects/${currentProjectId}/schedule-jobs/${res.data.jobId}`);
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
        if (jobStatus === 'failed') {
          throw { response: { data: jobErrorDetails } };
        }
      }

      setSuccessMessage(
        res.status === 202 ? "Đã tính toán xong tiến độ CPM." : (res.data?.message || "Đã tính toán lại tiến độ CPM thành công.")
      );

      // Reload without setting loading=true to avoid flicker
      const again = await api.get(`/projects/${currentProjectId}/schedule-results`);
      setScheduleData(again.data.data || []);
      setSummary(again.data.summary || null);
    } catch (err) {
      console.error("Lỗi tính toán lại tiến độ:", err);

      setErrorMessage(
        getErrorText(
          err,
          "Lỗi khi chạy thuật toán tính tiến độ CPM."
        )
      );
    } finally {
      setRecalculating(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "--";

    try {
      return format(parseISO(dateStr), "dd/MM/yyyy");
    } catch {
      return dateStr;
    }
  };

  // Lọc theo từ khóa tìm kiếm + chỉ việc găng
  const filteredData = scheduleData.filter((item) => {
    if (criticalOnly && !item.is_critical) return false;

    if (!search.trim()) return true;

    const term = search.toLowerCase();
    const taskName = (item.name || "").toLowerCase();
    const workItemName = (
      item.work_item_name || ""
    ).toLowerCase();

    return (
      taskName.includes(term) ||
      workItemName.includes(term)
    );
  });

  // Thống kê nhanh
  const totalTasks = scheduleData.length;

  const criticalTasksCount = scheduleData.filter(
    (item) => item.is_critical
  ).length;

  const criticalPercent =
    totalTasks > 0
      ? Math.round(
          (criticalTasksCount / totalTasks) * 100
        )
      : 0;

  return (
    <div className="flex-1 min-h-0 bg-[#F3F6FB] text-[#0F1B3D] flex flex-col">
      <div className="flex flex-col p-6 gap-6 max-w-[1672px] mx-auto w-full">
        {/* Hero Banner */}
        <div className="relative h-[115px] rounded-2xl overflow-hidden shrink-0 flex items-center p-6 shadow-sm">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1541888086425-d81bb19240f5?auto=format&fit=crop&q=80')",
            }}
          />

          <div className="absolute inset-0 bg-gradient-to-r from-[#0B3FA8] to-transparent opacity-95" />

          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-5">
              <div className="size-[60px] bg-[#1F63E0] rounded-xl flex items-center justify-center shadow-lg border border-white/20">
                <TrendingUp className="size-8 text-white" />
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-white text-[30px] font-bold leading-tight">
                    Bảng đường găng (CPM)
                  </h1>
                  {summary && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      summary.status === 'late' ? 'bg-red-500 text-white' : 
                      summary.status === 'early' ? 'bg-emerald-500 text-white' : 
                      'bg-blue-500 text-white'
                    }`}>
                      {summary.status === 'late' ? `Chậm ${summary.delayWorkingDays} ngày` :
                       summary.status === 'early' ? `Sớm ${Math.abs(summary.delayWorkingDays)} ngày` :
                       'Đúng tiến độ'}
                    </span>
                  )}
                </div>

                <p className="text-white/90 text-[18px] font-medium mt-1.5">
                  {currentProject ? `Dự án: ${currentProject.name}` : 'Phương pháp đường găng (Critical Path Method)'}
                </p>
              </div>
            </div>

            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="h-11 px-5 flex items-center gap-2 bg-white text-[#0B3FA8] hover:bg-white/90 font-semibold rounded-[10px] text-[14px] shadow transition-all cursor-pointer disabled:opacity-60"
            >
              <RefreshCw
                className={`size-4 ${
                  recalculating ? "animate-spin" : ""
                }`}
              />

              {recalculating
                ? "Đang tính toán..."
                : "Tính lại tiến độ (CPM)"}
            </button>
          </div>
        </div>

        {/* Thông báo lỗi */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm"
          >
            <AlertTriangle className="size-5 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Thông báo thành công */}
        {successMessage && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* KPI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 shrink-0">
          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-sm flex items-center gap-4">
            <div className="size-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Layers className="size-6" />
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium">
                Tổng số công việc
              </p>

              <p className="text-2xl font-bold text-[#0F1B3D] mt-0.5">
                {totalTasks}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-sm flex items-center gap-4">
            <div className="size-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-6" />
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium">
                Công việc đường găng
              </p>

              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-bold text-red-600">
                  {criticalTasksCount}
                </span>

                <span className="text-xs font-semibold text-red-500">
                  ({criticalPercent}% tổng số)
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-sm flex items-center gap-4">
            <div className="size-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Clock className="size-6" />
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium">
                Độ trễ dự phòng (Total Float)
              </p>

              <p className="text-sm font-semibold text-[#0F1B3D] mt-1">
                {criticalTasksCount > 0
                  ? "Float = 0 ngày trên đường găng"
                  : "Chưa có đường găng"}
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#64748B]" />

            <input
              type="text"
              placeholder="Tìm kiếm công việc, hạng mục..."
              className="w-full h-11 pl-10 pr-4 rounded-[10px] border border-[#E6EBF3] bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1F63E0]/20 focus:border-[#1F63E0]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#E6EBF3]">
            <button
              onClick={() => setCriticalOnly(false)}
              className={`h-9 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                !criticalOnly
                  ? "bg-[#1F63E0] text-white"
                  : "text-[#64748B] hover:bg-slate-100"
              }`}
            >
              Tất cả công việc ({totalTasks})
            </button>

            <button
              onClick={() => setCriticalOnly(true)}
              className={`h-9 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                criticalOnly
                  ? "bg-red-600 text-white"
                  : "text-red-600 hover:bg-red-50"
              }`}
            >
              <Filter className="size-3.5" />
              Chỉ đường găng ({criticalTasksCount})
            </button>
          </div>
        </div>

        {/* Bảng tiến độ */}
        <div className="flex-1 bg-white rounded-2xl border border-[#E6EBF3] shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_12px_rgba(16,24,40,.04)] flex flex-col overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead className="bg-white sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] min-w-[220px] whitespace-nowrap">
                    Công việc
                  </th>

                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] min-w-[160px] whitespace-nowrap">
                    Hạng mục
                  </th>

                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] text-center w-[150px] whitespace-nowrap">
                    Bắt đầu sớm (ES)
                  </th>

                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] text-center w-[150px] whitespace-nowrap">
                    Kết thúc sớm (EF)
                  </th>

                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] text-center w-[150px] whitespace-nowrap">
                    Bắt đầu muộn (LS)
                  </th>

                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] text-center w-[150px] whitespace-nowrap">
                    Kết thúc muộn (LF)
                  </th>

                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] text-center w-[130px] whitespace-nowrap">
                    Dự phòng (Float)
                  </th>

                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] text-center w-[140px] whitespace-nowrap">
                    Trạng thái
                  </th>

                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] text-center w-[160px] whitespace-nowrap">
                    Tiến độ thực tế
                  </th>

                  <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] text-center w-[110px] whitespace-nowrap">
                    Thao tác
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#EEF2F7]">
                {loading ? (
                  <tr>
                    <td
                      colSpan="10"
                      className="p-12 text-center text-gray-500"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="size-5 animate-spin text-[#1F63E0]" />
                        <span>
                          Đang tải tiến độ đường găng...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td
                      colSpan="10"
                      className="p-16 text-center text-gray-500"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Calendar className="size-8 text-gray-300" />

                        <p className="font-medium text-gray-600">
                          {criticalOnly
                            ? "Không có công việc nào trên đường găng (hoặc chưa tính toán CPM)."
                            : "Chưa có dữ liệu tiến độ. Nhấn 'Tính lại tiến độ (CPM)' để bắt đầu."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row) => (
                    <tr
                      key={row.id}
                      className={`h-[50px] transition-colors ${
                        row.newly_critical
                          ? "bg-red-50 border-l-4 border-l-red-500"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td className={`px-4 py-2 font-medium text-[14px] ${row.newly_critical ? 'text-red-700 font-bold' : 'text-[#0F1B3D]'}`}>
                        <div className="flex items-center gap-2">
                          <span>{row.name}</span>
                        </div>
                      </td>

                      <td className="px-4 py-2 text-[13px] text-[#64748B]">
                        {row.work_item_name || "--"}
                      </td>

                      <td className="px-4 py-2 text-center text-[13px] font-mono text-[#0F1B3D]">
                        {formatDate(row.early_start)}
                      </td>

                      <td className="px-4 py-2 text-center text-[13px] font-mono text-[#0F1B3D]">
                        <div className="flex flex-col">
                          <span>{formatDate(row.early_finish)}</span>
                          {row.planned_early_finish && formatDate(row.planned_early_finish) !== formatDate(row.early_finish) && (
                            <span className="text-[10px] text-gray-500 line-through">
                              Plan: {formatDate(row.planned_early_finish)}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-2 text-center text-[13px] font-mono text-[#475569]">
                        {formatDate(row.late_start)}
                      </td>

                      <td className="px-4 py-2 text-center text-[13px] font-mono text-[#475569]">
                        {formatDate(row.late_finish)}
                      </td>

                      <td className="px-4 py-2 text-center text-[13px] font-mono font-medium">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            row.total_float === 0
                              ? "bg-red-100 text-red-700 font-bold"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {row.total_float != null
                            ? `${row.total_float} ngày`
                            : "--"}
                        </span>
                      </td>

                      <td className="px-4 py-2 text-center">
                        {row.newly_critical ? (
                          <span
                            aria-label="Việc mới trở thành găng"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 whitespace-nowrap border border-dashed border-red-700"
                          >
                            <div className="inline-flex size-3 items-center justify-center border border-dashed border-red-700 text-[8px] font-black" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}>!</div>
                            Mới găng
                          </span>
                        ) : row.is_critical ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 whitespace-nowrap">
                            <AlertTriangle className="size-3" />
                            Đường găng
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 whitespace-nowrap">
                            Không găng
                          </span>
                        )}
                      </td>

                      {/* Tiến độ thực tế (T-35) */}
                      <td className="px-4 py-2 text-center text-[13px]">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-semibold text-slate-800 text-xs">
                            {row.percent_complete ?? 0}%
                          </span>
                          <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                (row.percent_complete || 0) === 100
                                  ? "bg-emerald-500"
                                  : (row.percent_complete || 0) > 0
                                    ? "bg-blue-600"
                                    : "bg-slate-300"
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(0, row.percent_complete || 0)
                                )}%`,
                              }}
                            />
                          </div>
                          {(row.actual_start_date || row.actual_end_date) && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {row.actual_start_date
                                ? formatDate(row.actual_start_date)
                                : "--"}
                              {" → "}
                              {row.actual_end_date
                                ? formatDate(row.actual_end_date)
                                : "..."}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Thao tác mở form cập nhật tiến độ (T-35) */}
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          aria-label={`Cập nhật tiến độ: ${row.name}`}
                          onClick={() => setSelectedTaskForProgress(row)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer"
                        >
                          <Edit3 className="size-3.5" />
                          <span>Cập nhật</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal cập nhật tiến độ thực tế (T-35 / S-15) */}
        {selectedTaskForProgress && (
          <TaskProgressModal
            projectId={currentProjectId}
            task={selectedTaskForProgress}
            isOpen={Boolean(selectedTaskForProgress)}
            onClose={() => setSelectedTaskForProgress(null)}
            onSuccess={async () => {
              setSelectedTaskForProgress(null);
              setSuccessMessage("Cập nhật tiến độ thực tế thành công.");
              await fetchSchedule();
            }}
          />
        )}
      </div>
    </div>
  );
}