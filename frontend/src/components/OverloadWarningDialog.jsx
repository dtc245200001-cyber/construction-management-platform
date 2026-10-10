import React from "react";
import {
  AlertTriangle,
  Calendar,
  Clock,
  Layers,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

function formatDisplayDate(dateStr) {
  if (!dateStr) return "Chưa xác định";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * OverloadWarningDialog (T-57 / S-25)
 * Hộp thoại cảnh báo quá tải đội thi công khi có hơn 3 công việc chồng nhau.
 * Nêu rõ khoảng thời gian bị chồng, danh sách công việc và cho phép xác nhận vẫn giao việc.
 */
export default function OverloadWarningDialog({
  isOpen = false,
  onClose,
  onConfirm,
  warning,
  teamName = "Đội thi công",
  taskName = "Công việc",
  isSubmitting = false,
}) {
  if (!isOpen || !warning) return null;

  const intervals = Array.isArray(warning.overloaded_intervals)
    ? warning.overloaded_intervals
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <h3 className="font-bold text-amber-950">
                Cảnh báo quá tải đội thi công
              </h3>
              <p className="text-xs text-amber-800">
                Phát hiện hơn 3 công việc bị chồng lịch trong cùng khoảng thời gian
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-amber-700 hover:bg-amber-200/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-5 text-sm text-site-dark">
          <div>
            <p className="text-site-dark">
              Giao công việc <strong className="text-site-primary">"{taskName}"</strong> cho đội{" "}
              <strong className="text-amber-900">"{teamName}"</strong> sẽ làm phát sinh tình trạng quá tải lịch trình (hơn 3 việc cùng diễn ra đồng thời).
            </p>
          </div>

          {/* OVERLOADED INTERVALS LIST */}
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 font-semibold text-amber-900 text-xs uppercase tracking-wider">
              <Calendar className="size-4 text-amber-600" />
              Chi tiết các khoảng thời gian bị chồng lịch ({intervals.length} khoảng)
            </h4>

            {intervals.map((interval, idx) => (
              <div
                key={idx}
                className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm"
              >
                {/* Interval Banner */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 bg-amber-100/70 px-4 py-2.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-amber-950">
                    <Clock className="size-3.5 text-amber-700" />
                    <span>
                      Từ {formatDisplayDate(interval.start_date)} đến{" "}
                      {formatDisplayDate(interval.end_date)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 font-semibold text-amber-900">
                      {interval.duration_days} ngày
                    </span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">
                      {interval.concurrent_count} việc đồng thời
                    </span>
                  </div>
                </div>

                {/* Overlapping Tasks */}
                <div className="divide-y divide-amber-100 bg-white p-3">
                  <p className="mb-2 text-xs font-semibold text-site-baseline">
                    Danh sách các công việc chạy song song trong khoảng này:
                  </p>

                  <div className="space-y-2">
                    {interval.tasks.map((task, tIdx) => (
                      <div
                        key={task.id || tIdx}
                        className="flex items-start justify-between gap-3 py-1.5 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-site-dark truncate">
                            {tIdx + 1}. {task.name}
                          </p>
                          {task.work_item_name && (
                            <p className="text-[11px] text-site-baseline">
                              Hạng mục: {task.work_item_name}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <span className="text-[11px] text-site-baseline">
                            {formatDisplayDate(task.start_date)} - {formatDisplayDate(task.end_date)}
                          </span>
                          {task.is_critical && (
                            <div className="mt-0.5">
                              <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600 border border-red-200">
                                ĐƯỜNG GĂNG
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* POLICY NOTE */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-800">
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-blue-600" />
              <span>
                <strong>Quy tắc chấp nhận:</strong> Cảnh báo này nhằm nhắc nhở Chỉ huy trưởng về áp lực thi công của đội. Bạn vẫn có thể tiếp tục phân công công việc này theo đúng kế hoạch.
              </span>
            </p>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 border-t border-site-border bg-site-bg/30 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-site-border bg-white px-4 text-sm font-semibold text-site-dark hover:bg-site-surface transition-colors disabled:opacity-50"
          >
            Hủy / Chọn đội khác
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              "Đang lưu phân công..."
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Tôi đã hiểu, vẫn giao việc
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
