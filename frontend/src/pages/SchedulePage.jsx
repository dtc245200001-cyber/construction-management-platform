import React, { useState, useEffect } from "react";
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
} from "lucide-react";

export default function SchedulePage() {
  const [scheduleData, setScheduleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const currentProjectId = localStorage.getItem("currentProjectId") || 1;

  const fetchSchedule = async (onlyCritical = criticalOnly) => {
    try {
      setLoading(true);
      setErrorMessage("");
      const queryParam = onlyCritical ? "?critical=true" : "";
      const res = await api.get(`/projects/${currentProjectId}/schedule-results${queryParam}`);
      setScheduleData(res.data.data || []);
    } catch (err) {
      console.error("Lỗi tải tiến độ CPM:", err);
      setErrorMessage(
        err.response?.data?.message || "Không thể tải dữ liệu tiến độ & đường găng."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule(criticalOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, criticalOnly]);

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      setErrorMessage("");
      setSuccessMessage("");
      const res = await api.post(`/projects/${currentProjectId}/schedule/recalculate`);
      setSuccessMessage(res.data?.message || "Đã tính toán lại tiến độ CPM thành công.");
      await fetchSchedule(criticalOnly);
    } catch (err) {
      console.error("Lỗi tính toán lại tiến độ:", err);
      setErrorMessage(
        err.response?.data?.message || "Lỗi khi chạy thuật toán tính tiến độ CPM."
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

  // Lọc theo từ khóa tìm kiếm
  const filteredData = scheduleData.filter((item) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const taskName = (item.name || "").toLowerCase();
    const workItemName = (item.work_item_name || "").toLowerCase();
    return taskName.includes(term) || workItemName.includes(term);
  });

  // Thống kê nhanh
  const totalTasks = scheduleData.length;
  const criticalTasksCount = scheduleData.filter((i) => i.is_critical).length;
  const criticalPercent = totalTasks > 0 ? Math.round((criticalTasksCount / totalTasks) * 100) : 0;

  return (
    <div className="flex-1 min-h-screen bg-[#F3F6FB] text-[#0F1B3D] flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden p-6 gap-6 max-w-[1672px] mx-auto w-full">
        {/* Hero Banner */}
        <div className="relative h-[115px] rounded-2xl overflow-hidden shrink-0 flex items-center p-6 shadow-sm">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&q=80')",
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B3FA8] to-[#1F63E0]/80 opacity-95"></div>
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-5">
              <div className="size-[60px] bg-[#1F63E0] rounded-xl flex items-center justify-center shadow-lg border border-white/20">
                <TrendingUp className="size-8 text-white" />
              </div>
              <div>
                <h1 className="text-white text-[28px] font-bold leading-tight">
                  Tiến độ & Đường găng (CPM)
                </h1>
                <p className="text-white/90 text-[14px] mt-1">
                  Phương pháp đường găng (Critical Path Method) theo chuẩn hạt công việc (T-26 / T-27 / T-28)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                className="h-11 px-5 flex items-center gap-2 bg-white text-[#0B3FA8] hover:bg-white/90 font-semibold rounded-[10px] text-[14px] shadow transition-all cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`size-4 ${recalculating ? "animate-spin" : ""}`} />
                {recalculating ? "Đang tính toán..." : "Tính lại tiến độ (CPM)"}
              </button>
            </div>
          </div>
        </div>

        {/* Thông báo lỗi / thành công */}
        {errorMessage && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            <AlertTriangle className="size-5 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Thẻ thống kê KPI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 shrink-0">
          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-sm flex items-center gap-4">
            <div className="size-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Layers className="size-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Tổng số công việc</p>
              <p className="text-2xl font-bold text-[#0F1B3D] mt-0.5">{totalTasks}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-sm flex items-center gap-4">
            <div className="size-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <TrendingUp className="size-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Công việc đường găng</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-bold text-red-600">{criticalTasksCount}</span>
                <span className="text-xs font-semibold text-red-500">({criticalPercent}% tổng số)</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-sm flex items-center gap-4">
            <div className="size-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Clock className="size-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Độ trễ dự phòng (Total Float)</p>
              <p className="text-sm font-semibold text-[#0F1B3D] mt-1">
                {criticalTasksCount > 0 ? "Float = 0 ngày trên đường găng" : "Chưa có đường găng"}
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar & Filter */}
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

        {/* Bảng kết quả tiến độ CPM */}
        <div className="flex-1 bg-white rounded-2xl border border-[#E6EBF3] shadow-sm flex flex-col overflow-hidden">
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[960px]">
              <thead className="bg-[#FAFBFD] sticky top-0 z-10 border-b border-[#E6EBF3]">
                <tr>
                  <th className="px-4 py-3.5 text-[13px] font-semibold text-[#475569] min-w-[220px]">
                    Công việc
                  </th>
                  <th className="px-4 py-3.5 text-[13px] font-semibold text-[#475569] min-w-[160px]">
                    Hạng mục
                  </th>
                  <th className="px-4 py-3.5 text-[13px] font-semibold text-[#475569] text-center w-[120px]">
                    Bắt đầu sớm (ES)
                  </th>
                  <th className="px-4 py-3.5 text-[13px] font-semibold text-[#475569] text-center w-[120px]">
                    Kết thúc sớm (EF)
                  </th>
                  <th className="px-4 py-3.5 text-[13px] font-semibold text-[#475569] text-center w-[120px]">
                    Bắt đầu muộn (LS)
                  </th>
                  <th className="px-4 py-3.5 text-[13px] font-semibold text-[#475569] text-center w-[120px]">
                    Kết thúc muộn (LF)
                  </th>
                  <th className="px-4 py-3.5 text-[13px] font-semibold text-[#475569] text-center w-[110px]">
                    Dự phòng (Float)
                  </th>
                  <th className="px-4 py-3.5 text-[13px] font-semibold text-[#475569] text-center w-[140px]">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF2F7]">
                {loading ? (
                  <tr>
                    <td colSpan="8" className="p-12 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="size-5 animate-spin text-[#1F63E0]" />
                        <span>Đang tải tiến độ đường găng...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-16 text-center text-gray-500">
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
                        row.is_critical ? "bg-red-50/40 hover:bg-red-50/70" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-2 font-medium text-[14px] text-[#0F1B3D]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`size-2 rounded-full shrink-0 ${
                              row.is_critical ? "bg-red-500 ring-4 ring-red-100" : "bg-slate-300"
                            }`}
                          />
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
                        {formatDate(row.early_finish)}
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
                          {row.total_float != null ? `${row.total_float} ngày` : "--"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.is_critical ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 whitespace-nowrap">
                            Đường găng
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 whitespace-nowrap">
                            Không găng
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
