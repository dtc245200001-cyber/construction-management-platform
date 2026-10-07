import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import api from "../lib/api";
import { Bell, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, History, Flag } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function WarningsPage() {
  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const projectId = localStorage.getItem("currentProjectId") || 13;

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
    <div className="flex-1 h-[calc(100vh-73px)] bg-[#F3F6FB] text-[#0F1B3D] flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-6 gap-6 max-w-[1200px] mx-auto w-full">
        
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="size-6 text-red-600" /> Cảnh báo tiến độ
            </h1>
            <p className="text-[#64748B] mt-1 text-sm">
              Theo dõi và xử lý các hạng mục vượt mốc bàn giao bắt buộc.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 border-b border-[#E6EBF3] shrink-0">
          <button
            onClick={() => setActiveTab("open")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === "open" 
                ? "border-[#1F63E0] text-[#1F63E0]" 
                : "border-transparent text-[#64748B] hover:text-[#0F1B3D]"
            }`}
          >
            Đang mở ({warnings.open.length})
          </button>
          <button
            onClick={() => setActiveTab("closed")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "closed" 
                ? "border-[#1F63E0] text-[#1F63E0]" 
                : "border-transparent text-[#64748B] hover:text-[#0F1B3D]"
            }`}
          >
            <History className="size-4" /> Lịch sử ({warnings.closed.length})
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="p-10 text-center text-[#64748B]">Đang tải dữ liệu...</div>
          ) : listToRender.length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center">
              <CheckCircle className="size-12 text-green-500 mb-3" />
              <p className="text-[#0F1B3D] font-medium text-lg">Không có cảnh báo nào</p>
              <p className="text-[#64748B] text-sm mt-1">Dự án hiện đang đáp ứng tất cả mốc bàn giao.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {listToRender.map((w) => {
                const isExpanded = expandedWarningId === w.id;
                return (
                  <div key={w.id} className="bg-white rounded-xl border border-[#E6EBF3] shadow-sm overflow-hidden">
                    <div 
                      className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50 border-b border-[#E6EBF3]' : ''}`}
                      onClick={() => toggleExpand(w)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${activeTab === 'open' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                          <AlertTriangle className="size-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-[#0F1B3D] text-[15px]">{w.category_name || w.work_item_name || "Hạng mục không xác định"}</h3>
                          <div className="flex items-center gap-4 mt-1 text-xs text-[#64748B]">
                            <span className="flex items-center gap-1">
                              <Flag className="size-3 text-[#1F63E0]" /> Mốc: {renderDate(w.required_date)}
                            </span>
                            {activeTab === 'open' ? (
                              <span className="font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                                Chậm {w.overdue_days || 0} ngày
                              </span>
                            ) : (
                              <span className="font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                Đã khắc phục (Đóng: {renderDate(w.closed_at)})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button className="p-2 text-[#64748B] hover:text-[#0F1B3D]">
                        {isExpanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="p-5 bg-slate-50">
                        <h4 className="font-semibold text-[#0F1B3D] text-sm mb-3">Chuỗi công việc gây chậm trễ (Critical Path)</h4>
                        {pathLoading ? (
                          <div className="text-sm text-[#64748B]">Đang phân tích chuỗi...</div>
                        ) : criticalPath.length === 0 ? (
                          <div className="text-sm text-[#64748B] italic">Không có dữ liệu chuỗi công việc.</div>
                        ) : (
                          <div className="relative pl-6 border-l-2 border-[#E6EBF3] ml-2 space-y-4">
                            {criticalPath.map((task, idx) => (
                              <div key={idx} className="relative">
                                <div className="absolute -left-[31px] top-1 size-3 bg-red-400 rounded-full ring-4 ring-slate-50" />
                                <div className="text-sm font-medium text-[#0F1B3D]">{task.task_name || task.name}</div>
                                <div className="text-xs text-[#64748B] mt-0.5">
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
