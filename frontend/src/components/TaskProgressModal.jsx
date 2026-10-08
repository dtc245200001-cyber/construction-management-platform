import React, { useState, useEffect } from "react";
import api from "../lib/api";
import "./TaskForm.css";
import { AlertTriangle, CheckCircle2, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";

function formatPlannedDate(dateStr) {
  if (!dateStr) return "--";
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

/**
 * TaskProgressModal (T-35 / S-15)
 * Form cập nhật tiến độ thực tế (actual_start_date, actual_end_date, percent_complete),
 * kế thừa bố cục và style của TaskForm (T-12), hỗ trợ tốt trên điện thoại di động (mobile-friendly).
 */
export default function TaskProgressModal({
  projectId,
  task,
  isOpen = true,
  onClose,
  onSuccess,
}) {
  // Trích xuất chuỗi YYYY-MM-DD từ task
  const initialStartDate = task?.actual_start_date
    ? String(task.actual_start_date).substring(0, 10)
    : "";
  const initialEndDate = task?.actualEndDate || task?.actual_end_date
    ? String(task.actualEndDate || task.actual_end_date).substring(0, 10)
    : "";
  const initialPercent =
    task?.percent_complete != null ? Number(task.percent_complete) : 0;

  const plannedStart = task?.early_start || task?.start_date;
  const plannedEnd = task?.early_finish || task?.end_date;

  // Xác định xem ban đầu công việc đã xong chưa (100% hoặc có ngày kết thúc thực tế)
  const wasCompleted = initialPercent === 100 || Boolean(initialEndDate);

  const [actualStartDate, setActualStartDate] = useState(initialStartDate);
  const [actualEndDate, setActualEndDate] = useState(initialEndDate);
  const [percentComplete, setPercentComplete] = useState(String(initialPercent));
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);

  useEffect(() => {
    if (!task) return;
    setActualStartDate(
      task.actual_start_date ? String(task.actual_start_date).substring(0, 10) : ""
    );
    setActualEndDate(
      (task.actualEndDate || task.actual_end_date) ? String(task.actualEndDate || task.actual_end_date).substring(0, 10) : ""
    );
    setPercentComplete(
      task.percent_complete != null ? String(task.percent_complete) : "0"
    );
    setServerError("");
    setShowReopenConfirm(false);
  }, [task]);

  if (!isOpen || !task) return null;

  // Kiểm tra tính hợp lệ của ngày kết thúc thực tế:
  // Chặn kết thúc thực tế sớm hơn bắt đầu thực tế (ở cả ô nhập và máy chủ)
  const isEndDateEarlierThanStart = Boolean(
    actualStartDate &&
      actualEndDate &&
      actualEndDate < actualStartDate
  );

  // Kiểm tra tính hợp lệ của phần trăm hoàn thành: 0 - 100
  const parsedPercent = Number(percentComplete);
  const isPercentInvalid =
    percentComplete.trim() === "" ||
    isNaN(parsedPercent) ||
    !Number.isInteger(parsedPercent) ||
    parsedPercent < 0 ||
    parsedPercent > 100;

  const hasFormError = isEndDateEarlierThanStart || isPercentInvalid;

  // Kiểm tra xem người dùng có đang mở lại việc đã xong hay không:
  // Task trước đó đã hoàn thành (100% hoặc có actual_end_date)
  // và giờ người dùng giảm % < 100 hoặc xóa ngày kết thúc
  const isReopeningTask =
    wasCompleted &&
    (parsedPercent < 100 || !actualEndDate);

  const performSave = async () => {
    setLoading(true);
    setServerError("");

    try {
      const payload = {
        actualStartDate: actualStartDate.trim() ? actualStartDate : null,
        actualEndDate: actualEndDate.trim() ? actualEndDate : null,
        percentComplete: parsedPercent,
      };

      const res = await api.patch(
        `/projects/${projectId}/tasks/${task.id}/progress`,
        payload
      );

      if (onSuccess) {
        onSuccess(res.data?.task || res.data);
      }
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error("Lỗi cập nhật tiến độ thực tế:", err);
      setServerError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          "Đã xảy ra lỗi khi lưu tiến độ thực tế."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setServerError("");

    if (hasFormError) {
      return;
    }

    // Nếu công việc đã xong trước đó và giờ được cập nhật lại thành chưa xong (< 100%)
    // thì hiện hộp xác nhận mở lại việc đã xong
    if (isReopeningTask && !showReopenConfirm) {
      setShowReopenConfirm(true);
      return;
    }

    performSave();
  };

  const handleConfirmReopen = () => {
    setShowReopenConfirm(false);
    performSave();
  };

  const handleCancelReopen = () => {
    setShowReopenConfirm(false);
  };

  // Nút tắt nhanh phần trăm hoàn thành hỗ trợ chỉ huy trưởng thao tác trên điện thoại
  const quickPercents = [0, 25, 50, 75, 100];

  const setPresetPercent = (val) => {
    setPercentComplete(String(val));
    if (val === 100 && !actualEndDate) {
      const today = new Date().toISOString().substring(0, 10);
      setActualEndDate(today);
      if (!actualStartDate) {
        setActualStartDate(today);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-form-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose?.();
        }
      }}
    >
      <div
        className="task-form-card my-auto w-full max-w-[560px] shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER THEO BỐ CỤC T-12 */}
        <div className="task-form-header">
          <div>
            <span className="task-form-label">TIẾN ĐỘ THỰC TẾ (S-15)</span>
            <h2 id="progress-form-title" className="text-xl sm:text-2xl">
              Cập nhật tiến độ
            </h2>
            <p className="mt-1">
              Ghi nhận số liệu thực tế tại công trường cho:{" "}
              <strong className="text-slate-800">{task.name}</strong>
              {task.work_item_name ? (
                <span className="text-slate-500 block text-xs mt-0.5">
                  Hạng mục: {task.work_item_name}
                </span>
              ) : null}
            </p>
          </div>

          {onClose && (
            <button
              type="button"
              className="task-form-close"
              onClick={onClose}
              disabled={loading}
              aria-label="Đóng"
            >
              ×
            </button>
          )}
        </div>

        {/* HỘP XÁC NHẬN KHI MỞ LẠI VIỆC ĐÃ XONG */}
        {showReopenConfirm && (
          <div
            role="alertdialog"
            aria-labelledby="reopen-title"
            aria-describedby="reopen-desc"
            className="mb-5 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 shadow-sm animate-in fade-in"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 id="reopen-title" className="font-bold text-sm text-amber-800">
                  Xác nhận mở lại việc đã xong
                </h4>
                <p id="reopen-desc" className="text-xs text-amber-700 mt-1 leading-relaxed">
                  Công việc này trước đó đã được ghi nhận hoàn thành. Bạn có chắc chắn muốn mở lại việc đã xong và chuyển trạng thái về <strong>{parsedPercent}%</strong> không?
                </p>
                <div className="flex gap-2.5 mt-3.5">
                  <button
                    type="button"
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                    onClick={handleCancelReopen}
                    disabled={loading}
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="button"
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm cursor-pointer"
                    onClick={handleConfirmReopen}
                    disabled={loading}
                  >
                    {loading ? "Đang lưu..." : "Xác nhận mở lại"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleSubmit} noValidate>
          {/* 1. NGÀY BẮT ĐẦU THỰC TẾ */}
          <div className="task-form-group">
            <label htmlFor="actualStartDate" className="flex items-center justify-between">
              <span>Ngày bắt đầu thực tế</span>
              {plannedStart && (
                <button
                  type="button"
                  onClick={() => setActualStartDate(String(plannedStart).substring(0, 10))}
                  title="Nhấn để dùng ngày kế hoạch"
                  className="text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
                >
                  Kế hoạch: {formatPlannedDate(plannedStart)}
                </button>
              )}
            </label>
            <input
              id="actualStartDate"
              name="actualStartDate"
              type="date"
              value={actualStartDate}
              onChange={(e) => setActualStartDate(e.target.value)}
              disabled={loading}
              className="text-base sm:text-sm"
            />
            <small>Ngày thực tế đội thầu bắt đầu triển khai trên hiện trường.</small>
          </div>

          {/* 2. NGÀY KẾT THÚC THỰC TẾ */}
          <div className="task-form-group">
            <label htmlFor="actualEndDate" className="flex items-center justify-between">
              <span>Ngày kết thúc thực tế</span>
              {plannedEnd && (
                <button
                  type="button"
                  onClick={() => setActualEndDate(String(plannedEnd).substring(0, 10))}
                  title="Nhấn để dùng ngày kế hoạch"
                  className="text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
                >
                  Kế hoạch: {formatPlannedDate(plannedEnd)}
                </button>
              )}
            </label>
            <input
              id="actualEndDate"
              name="actualEndDate"
              type="date"
              value={actualEndDate}
              onChange={(e) => setActualEndDate(e.target.value)}
              disabled={loading}
              aria-invalid={isEndDateEarlierThanStart}
              aria-describedby="actualEndDateHint"
              style={
                isEndDateEarlierThanStart
                  ? { borderColor: "#dc2626", backgroundColor: "#fef2f2" }
                  : undefined
              }
              className="text-base sm:text-sm"
            />
            {isEndDateEarlierThanStart ? (
              <small
                id="actualEndDateHint"
                role="alert"
                style={{ color: "#dc2626", fontWeight: 600 }}
              >
                Ngày kết thúc thực tế không được sớm hơn ngày bắt đầu thực tế.
              </small>
            ) : (
              <small id="actualEndDateHint">
                Ngày thực tế hoàn thành toàn bộ công việc trên công trường.
              </small>
            )}
          </div>

          {/* 3. PHẦN TRĂM HOÀN THÀNH (%) */}
          <div className="task-form-group">
            <label htmlFor="percentComplete">
              Phần trăm hoàn thành (%) <span>*</span>
            </label>

            <div className="task-duration-input">
              <input
                id="percentComplete"
                name="percentComplete"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="0"
                value={percentComplete}
                onChange={(e) => setPercentComplete(e.target.value)}
                disabled={loading}
                aria-invalid={isPercentInvalid}
                aria-describedby="percentCompleteHint"
                style={
                  isPercentInvalid
                    ? { borderColor: "#dc2626", backgroundColor: "#fef2f2" }
                    : undefined
                }
                className="text-base sm:text-sm pr-12"
              />
              <span className="font-semibold text-slate-500">%</span>
            </div>

            {/* PHÍM CHỌN NHANH DÀNH CHO DI ĐỘNG */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className="text-xs text-slate-500 mr-1">Chọn nhanh:</span>
              {quickPercents.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setPresetPercent(pct)}
                  disabled={loading}
                  className={`h-7 px-2.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                    parsedPercent === pct
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {isPercentInvalid ? (
              <small
                id="percentCompleteHint"
                role="alert"
                style={{ color: "#dc2626", fontWeight: 600 }}
              >
                Phần trăm hoàn thành phải là số nguyên từ 0 đến 100.
              </small>
            ) : (
              <small id="percentCompleteHint">
                Tiến độ thực tế ước tính từ 0% đến 100%.
              </small>
            )}
          </div>

          {/* LỖI TỪ PHÍA MÁY CHỦ */}
          {serverError && (
            <div className="task-form-error" role="alert">
              {serverError}
            </div>
          )}

          {/* HÀNH ĐỘNG */}
          <div className="task-form-actions pt-2">
            {onClose && (
              <button
                type="button"
                className="task-btn-cancel"
                onClick={onClose}
                disabled={loading}
              >
                Hủy
              </button>
            )}

            <button
              type="submit"
              className="task-btn-submit flex items-center justify-center gap-2"
              disabled={loading || hasFormError}
            >
              {loading ? (
                "Đang lưu..."
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>Lưu tiến độ</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
