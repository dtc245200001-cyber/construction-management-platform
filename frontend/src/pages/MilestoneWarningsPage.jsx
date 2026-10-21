import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import PageHeroBanner from "../components/PageHeroBanner";
import api from "../lib/api";
import { Bell, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, History, Flag } from "lucide-react";
import { format, parseISO } from "date-fns";
export default function MilestoneWarningsPage() {
  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const projectId = currentProject?.id || localStorage.getItem("currentProjectId") || 1;

  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState({ open: [], closed: [] });
  const [activeTab, setActiveTab] = useState("open"); // "open" | "closed"
  const [expandedWarningId, setExpandedWarningId] = useState(null);
  const [criticalPath, setCriticalPath] = useState([]);
  const [pathLoading, setPathLoading] = useState(false);

  useEffect(() => {
    fetchWarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const fetchWarnings = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/projects/${projectId}/warnings`);
      setWarnings({
        open: res.data.open || [],
        closed: res.data.closed || []
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (warning) => {
    if (expandedWarningId === warning.id) {
      setExpandedWarningId(null);
      setCriticalPath([]);
      return;
    }

    setExpandedWarningId(warning.id);
    setCriticalPath([]);
    setPathLoading(true);
    try {
      const res = await api.get(`/projects/${projectId}/warnings/${warning.id}/critical-path`);
      // res.data should be an array of objects: { task_name, start_date, end_date, ... }
      setCriticalPath(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setPathLoading(false);
    }
  };

  const renderDate = (d) => {
    if (!d) return "--";
    try {
      return format(parseISO(d), "dd/MM/yyyy");
    } catch {
      return d;
    }
  };

  const listToRender = activeTab === "open" ? warnings.open : warnings.closed;

  return (
    <div className="flex-1 min-h-0 bg-[#F3F6FB] text-[#0F1B3D] flex flex-col overflow-y-auto">
      <div className="flex-1 min-h-0 flex flex-col p-3.5 sm:p-6 pb-24 lg:pb-6 gap-4 sm:gap-6 max-w-[1200px] mx-auto w-full">
        <PageHeroBanner
          icon={<Bell className="size-6 sm:size-8" />}
          title="Cảnh báo tiến độ"
          subtitle={
            currentProject
              ? `Dự án: ${currentProject.name} · Theo dõi và xử lý các hạng mục vượt mốc bàn giao bắt buộc`
              : "Theo dõi và xử lý các hạng mục vượt mốc bàn giao bắt buộc."
          }
        />

        {/* Tabs */}
        <div className="flex items-center gap-4 border-b border-[#E6EBF3] shrink-0 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("open")}
            className={`min-h-11 px-2 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === "open" 
                ? "border-[#1F63E0] text-[#1F63E0]" 
                : "border-transparent text-[#64748B] hover:text-[#0F1B3D]"
            }`}
          >
            Đang mở ({warnings.open.length})
          </button>
          <button
            onClick={() => setActiveTab("closed")}
            className={`min-h-11 px-2 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === "closed" 
                ? "border-[#1F63E0] text-[#1F63E0]" 
                : "border-transparent text-[#64748B] hover:text-[#0F1B3D]"
            }`}
          >
            <History className="size-4 shrink-0" /> Lịch sử ({warnings.closed.length})
          </button>
        </div>

        {/* List of Accordion Cards */}
        <div className="flex-1">
          {loading ? (
            <div className="p-8 sm:p-10 text-center text-[#64748B] text-xs sm:text-sm">Đang tải dữ liệu cảnh báo...</div>
          ) : listToRender.length === 0 ? (
            <div className="p-8 sm:p-12 text-center flex flex-col items-center bg-white rounded-2xl border border-[#E6EBF3]">
              <CheckCircle className="size-10 sm:size-12 text-green-500 mb-3" />
              <p className="text-[#0F1B3D] font-bold text-base sm:text-lg">Không có cảnh báo nào</p>
              <p className="text-[#64748B] text-xs sm:text-sm mt-1">Dự án hiện đang đáp ứng tất cả mốc bàn giao bắt buộc.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {listToRender.map((w) => {
                const isExpanded = expandedWarningId === w.id;
                return (
                  <div
                    key={w.id}
                    className={`rounded-2xl border bg-white shadow-xs transition-all overflow-hidden ${
                      isExpanded ? "border-[#1F63E0]/40 ring-1 ring-[#1F63E0]/20" : "border-[#E6EBF3] hover:border-slate-300"
                    }`}
                  >
                    {/* Header item */}
                    <div
                      className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                      onClick={() => toggleExpand(w)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`size-9 sm:size-10 rounded-xl flex items-center justify-center shrink-0 ${
                            activeTab === 'open' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <AlertTriangle className="size-4 sm:size-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-bold text-[#0F1B3D] text-sm sm:text-base truncate">
                              {w.category_name || w.work_item_name || "Hạng mục không xác định"}
                            </span>
                            {activeTab === 'open' ? (
                              <span className="inline-flex items-center font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md text-[11px] border border-red-200">
                                Chậm {w.overdue_days || 0} ngày
                              </span>
                            ) : (
                              <span className="inline-flex items-center font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px] border border-emerald-200">
                                Đã đóng {renderDate(w.closed_at)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mt-1 text-xs text-[#64748B]">
                            <span className="inline-flex items-center gap-1">
                              <Flag className="size-3 text-[#1F63E0]" /> Mốc: <strong className="text-[#0F1B3D] font-mono">{renderDate(w.required_date)}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        aria-label="Xem chi tiết chuỗi găng"
                        className="flex size-9 items-center justify-center rounded-lg text-[#64748B] hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                      </button>
                    </div>

                    {/* Accordion Body: Vertical Timeline */}
                    {isExpanded && (
                      <div className="border-t border-[#E6EBF3] bg-slate-50/70 p-4 sm:p-5">
                        <h4 className="font-bold text-[#0F1B3D] text-xs sm:text-sm mb-3.5 flex items-center gap-2">
                          Chuỗi công việc gây chậm trễ (Critical Path)
                        </h4>

                        {pathLoading ? (
                          <div className="text-xs sm:text-sm text-[#64748B] py-3">Đang phân tích chuỗi đường găng...</div>
                        ) : criticalPath.length === 0 ? (
                          <div className="text-xs sm:text-sm text-[#64748B] italic py-2">Không có dữ liệu chuỗi công việc.</div>
                        ) : (
                          <div className="relative pl-5 sm:pl-6 border-l-2 border-slate-300 ml-2 space-y-4">
                            {criticalPath.map((task, idx) => (
                              <div key={idx} className="relative">
                                <div className="absolute -left-[27px] sm:-left-[31px] top-1 size-3 bg-[#ea580c] rounded-full ring-4 ring-slate-100" />
                                <div className="text-xs sm:text-sm font-semibold text-[#0F1B3D]">
                                  {task.task_name || task.name}
                                </div>
                                <div className="text-[11px] sm:text-xs text-[#64748B] font-mono mt-0.5">
                                  Dự kiến: {renderDate(task.early_start)} → {renderDate(task.early_finish)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
