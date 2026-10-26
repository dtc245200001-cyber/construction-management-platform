import React from "react";
import {
  X,
  Calendar,
  Clock,
  Layers,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Activity,
  FolderTree,
} from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";

function formatDate(dateStr) {
  if (!dateStr) return "--";
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

/**
 * GanttTaskDetailPanel
 * Side panel cố định bên phải hiển thị chi tiết công việc được chọn trên biểu đồ Gantt.
 * Thay thế popup nổi, giúp quan sát biểu đồ thông suốt không bị che khuất.
 */
export default function GanttTaskDetailPanel({
  task,
  onClose,
  onUpdateProgress,
  canUpdateProgress = true,
  isReadOnly = false,
  offlineMutationMessage = "Cần có mạng để thực hiện thao tác này",
  allTasks = [],
  dependencies = [],
  onSelectTask,
}) {
  if (!task) return null;

  const percent = Math.min(100, Math.max(0, task.percent_complete ?? 0));
  const isCompleted = percent === 100 || Boolean(task.actual_end_date);
  const isInProgress = (percent > 0 && percent < 100) || Boolean(task.actual_start_date);

  const isNewCritical = task.is_critical && task.was_critical_baseline === false;

  // So sánh tiến độ với kế hoạch gốc (nếu có baseline)
  let baselineDiffDays = null;
  if (task.planned_early_finish && task.early_finish) {
    try {
      baselineDiffDays = differenceInCalendarDays(
        parseISO(task.early_finish),
        parseISO(task.planned_early_finish)
      );
    } catch {
      baselineDiffDays = null;
    }
  }

  // Danh sách công việc tiên quyết (Predecessors) và kế tiếp (Successors)
  const predecessors = dependencies
    .filter((dep) => dep.successor_id === task.id)
    .map((dep) => {
      const pred = allTasks.find((t) => t.id === dep.predecessor_id);
      return {
        id: dep.predecessor_id,
        name: pred ? pred.name : `Công việc #${dep.predecessor_id}`,
        type: dep.dependency_type || "FS",
        task: pred,
      };
    });

  const successors = dependencies
    .filter((dep) => dep.predecessor_id === task.id)
    .map((dep) => {
      const succ = allTasks.find((t) => t.id === dep.successor_id);
      return {
        id: dep.successor_id,
        name: succ ? succ.name : `Công việc #${dep.successor_id}`,
        type: dep.dependency_type || "FS",
        task: succ,
      };
    });

  return (
    <>
      {/* Backdrop trên màn hình nhỏ điện thoại (chạm ra ngoài để đóng drawer) */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Side panel: fixed/drawer trên mobile, docked side-by-side trên tablet & desktop */}
      <aside
        role="region"
        aria-label="Chi tiết công việc"
        data-testid="gantt-side-panel"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm sm:max-w-md md:static md:w-[320px] lg:w-[350px] xl:w-[380px] md:z-10 bg-white md:border-l md:border-slate-200 flex flex-col h-full shadow-2xl md:shadow-none transition-all duration-200 ease-out shrink-0"
      >
        {/* Header của Side Panel */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200/60">
                <FolderTree className="size-3.5" />
                Mã: #{task.id}
              </span>
              {task.work_item_id && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200">
                  WBS #{task.work_item_id}
                </span>
              )}
            </div>

            <button
              type="button"
              aria-label="Đóng chi tiết công việc"
              onClick={onClose}
              title="Đóng panel (Esc)"
              className="size-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>

          <h3
            className="text-base sm:text-lg font-bold text-slate-900 leading-snug break-words"
            title={task.name}
          >
            {task.name}
          </h3>

          {/* Hàng nhãn trạng thái trực quan */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {/* Badge Đường găng */}
            {isNewCritical ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">
                <span className="size-1.5 rounded-full bg-orange-600 animate-pulse" />
                Việc găng mới (!)
              </span>
            ) : task.is_critical ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                <span className="size-1.5 rounded-full bg-red-600" />
                Đường găng (!)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                <span className="size-1.5 rounded-full bg-blue-500" />
                Không găng
              </span>
            )}

            {/* Badge Trạng thái thực tế */}
            {isCompleted ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="size-3 text-emerald-600" />
                Đã hoàn thành
              </span>
            ) : isInProgress ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <Activity className="size-3 text-blue-600" />
                Đang thực hiện
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                Chưa thực hiện
              </span>
            )}

            {/* Cảnh báo so với kế hoạch gốc */}
            {baselineDiffDays !== null && baselineDiffDays > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <AlertTriangle className="size-3 text-rose-500" />
                Trễ {baselineDiffDays} ngày
              </span>
            )}
          </div>
        </div>

        {/* Nội dung chi tiết có thanh cuộn riêng */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
          {/* 1. KHỐI TIẾN ĐỘ THỰC TẾ */}
          <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <TrendingUp className="size-3.5 text-blue-600" />
                Tiến độ thực tế
              </span>
              <span className="text-sm font-extrabold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                {percent}%
              </span>
            </div>

            {/* Thanh tiến độ trực quan */}
            <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  percent === 100
                    ? "bg-emerald-500"
                    : percent > 50
                    ? "bg-blue-600"
                    : "bg-blue-500"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200/60">
                <span className="text-slate-400 block text-[11px] mb-0.5">Bắt đầu thực tế</span>
                <span className="font-semibold text-slate-700">
                  {formatDate(task.actual_start_date)}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200/60">
                <span className="text-slate-400 block text-[11px] mb-0.5">Kết thúc thực tế</span>
                <span className="font-semibold text-slate-700">
                  {formatDate(task.actual_end_date)}
                </span>
              </div>
            </div>
          </div>

          {/* 2. KHỐI LỊCH TRÌNH TÍNH TOÁN CPM */}
          <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2.5">
              <Clock className="size-3.5 text-indigo-600" />
              Lịch trình kế hoạch (CPM)
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-500 block text-[11px]">Bắt đầu sớm (ES)</span>
                <span className="font-bold text-slate-800 text-[13px]">
                  {formatDate(task.early_start)}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-500 block text-[11px]">Kết thúc sớm (EF)</span>
                <span className="font-bold text-slate-800 text-[13px]">
                  {formatDate(task.early_finish)}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-500 block text-[11px]">Muộn nhất bắt đầu (LS)</span>
                <span className="font-semibold text-slate-700">
                  {formatDate(task.late_start)}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-500 block text-[11px]">Muộn nhất kết thúc (LF)</span>
                <span className="font-semibold text-slate-700">
                  {formatDate(task.late_finish)}
                </span>
              </div>
            </div>

            {/* Thời gian dự phòng (Float) */}
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">Thời gian dự phòng (Float):</span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-xs ${
                  task.total_float === 0
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                }`}
              >
                {task.total_float != null ? `${task.total_float} ngày` : "--"}
              </span>
            </div>
          </div>

          {/* 3. KHỐI WBS VÀ THỜI LƯỢNG */}
          <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2.5">
              <Layers className="size-3.5 text-blue-600" />
              WBS & Nhóm công việc
            </span>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500">Nhóm công việc:</span>
                <span className="font-semibold text-slate-800 text-right max-w-[200px] truncate" title={task.work_item_name}>
                  {task.work_item_name || "--"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500">Mã hạng mục:</span>
                <span className="font-medium text-slate-700">
                  {task.work_item_id ? `#${task.work_item_id}` : "--"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">Thời lượng dự kiến:</span>
                <span className="font-semibold text-slate-800">
                  {task.duration_days ? `${task.duration_days} ngày` : "--"}
                </span>
              </div>
            </div>
          </div>

          {/* 4. KHỐI KẾ HOẠCH GỐC (BASELINE) NẾU CÓ */}
          {(task.has_baseline || task.planned_early_start) && (
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2.5">
                <Calendar className="size-3.5 text-slate-600" />
                Kế hoạch gốc (Baseline)
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Bắt đầu gốc:</span>
                  <span className="font-semibold text-slate-700">
                    {formatDate(task.planned_early_start)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Kết thúc gốc:</span>
                  <span className="font-semibold text-slate-700">
                    {formatDate(task.planned_early_finish)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 5. CÔNG VIỆC LIÊN KẾT (PREDECESSORS & SUCCESSORS) */}
          {(predecessors.length > 0 || successors.length > 0) && (
            <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2.5">
                <Activity className="size-3.5 text-blue-600" />
                Mối quan hệ phụ thuộc
              </span>

              <div className="space-y-3 text-xs">
                {predecessors.length > 0 && (
                  <div>
                    <span className="text-slate-400 text-[11px] font-medium block mb-1">
                      Công việc tiên quyết (Predecessor):
                    </span>
                    <div className="space-y-1">
                      {predecessors.map((p) => (
                        <button
                          key={`pred-${p.id}`}
                          type="button"
                          onClick={() => onSelectTask && p.task && onSelectTask(p.task)}
                          className="w-full text-left p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-100 flex items-center justify-between text-slate-700 transition-colors cursor-pointer group"
                        >
                          <span className="truncate pr-2 font-medium">{p.name}</span>
                          <span className="shrink-0 text-[10px] text-slate-400 group-hover:text-blue-600 font-semibold">
                            {p.type} &rarr;
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {successors.length > 0 && (
                  <div>
                    <span className="text-slate-400 text-[11px] font-medium block mb-1">
                      Công việc kế tiếp (Successor):
                    </span>
                    <div className="space-y-1">
                      {successors.map((s) => (
                        <button
                          key={`succ-${s.id}`}
                          type="button"
                          onClick={() => onSelectTask && s.task && onSelectTask(s.task)}
                          className="w-full text-left p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-100 flex items-center justify-between text-slate-700 transition-colors cursor-pointer group"
                        >
                          <span className="truncate pr-2 font-medium">{s.name}</span>
                          <span className="shrink-0 text-[10px] text-slate-400 group-hover:text-blue-600 font-semibold">
                            {s.type} &rarr;
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer: Nút cập nhật tiến độ & Nút đóng */}
        <div className="p-4 border-t border-slate-200 bg-white flex flex-col gap-2 shrink-0">
          {canUpdateProgress && (
            <button
              type="button"
              data-testid="side-panel-update-progress-btn"
              disabled={isReadOnly}
              title={isReadOnly ? offlineMutationMessage : "Cập nhật tiến độ thực tế cho công việc này"}
              onClick={onUpdateProgress}
              className="w-full h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Edit3 className="size-4" />
              <span>Cập nhật tiến độ</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full h-9 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 active:bg-slate-100 text-slate-600 font-medium text-xs sm:text-sm flex items-center justify-center transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </aside>
    </>
  );
}
