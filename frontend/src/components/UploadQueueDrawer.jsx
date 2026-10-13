import React from "react";
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  FileImage,
  Trash2,
  Loader2,
  Check,
} from "lucide-react";
import { useUploadQueue } from "../context/UploadQueueContext";
import { formatBytes } from "../utils/fileChecksum";

export default function UploadQueueDrawer() {
  const {
    queue,
    activeCount,
    queuedCount,
    completedCount,
    failedCount,
    totalCount,
    isUploading,
    overallProgress,
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    retry,
    retryAll,
    removeItem,
    clearCompleted,
  } = useUploadQueue();

  if (totalCount === 0) return null;

  return (
    <div className="fixed z-50 bottom-4 right-4 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] sm:w-96 select-none pointer-events-auto">
      {/* ─────────────────────────────────────────────────────────────
          1. Thanh thu gọn (Floating Pill)
      ───────────────────────────────────────────────────────────── */}
      {!isDrawerOpen && (
        <div
          onClick={openDrawer}
          className={`flex items-center justify-between p-3 rounded-2xl shadow-2xl border backdrop-blur-md cursor-pointer transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
            failedCount > 0
              ? "bg-amber-900/95 text-white border-amber-600 shadow-amber-950/30"
              : isUploading
              ? "bg-slate-900/95 text-white border-blue-500/50 shadow-blue-950/30 ring-1 ring-blue-500/30"
              : "bg-emerald-900/95 text-white border-emerald-600 shadow-emerald-950/30"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`p-2 rounded-xl flex items-center justify-center shrink-0 ${
                failedCount > 0
                  ? "bg-amber-700/80"
                  : isUploading
                  ? "bg-blue-600/80"
                  : "bg-emerald-700/80"
              }`}
            >
              {failedCount > 0 ? (
                <AlertTriangle className="w-4 h-4 text-amber-200 animate-pulse" />
              ) : isUploading ? (
                <Loader2 className="w-4 h-4 text-blue-200 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              )}
            </div>

            <div className="min-w-0">
              <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                {failedCount > 0 ? (
                  <span>{failedCount} ảnh bị lỗi khi tải</span>
                ) : isUploading ? (
                  <span>
                    Đang tải {completedCount + 1}/{totalCount} ảnh ({overallProgress}%)
                  </span>
                ) : (
                  <span>Đã tải xong {completedCount} ảnh</span>
                )}
              </div>

              {isUploading && (
                <div className="w-36 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            {failedCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  retryAll();
                }}
                className="px-2 py-1 bg-amber-700 hover:bg-amber-600 active:bg-amber-800 text-white rounded-lg text-[11px] font-medium flex items-center gap-1 transition"
                title="Thử lại tất cả"
              >
                <RefreshCw className="w-3 h-3" />
                Thử lại
              </button>
            )}

            {!isUploading && failedCount === 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearCompleted();
                }}
                className="p-1 hover:bg-white/10 rounded-lg text-emerald-200 transition"
                title="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              className="p-1 hover:bg-white/10 rounded-lg text-slate-300 transition"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. Khung chi tiết mở rộng (Expanded Drawer)
      ───────────────────────────────────────────────────────────── */}
      {isDrawerOpen && (
        <div className="bg-slate-900 text-white border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[500px] animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Hàng đợi tải ảnh nền</h3>
              <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                {totalCount}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {failedCount > 0 && (
                <button
                  type="button"
                  onClick={retryAll}
                  className="px-2 py-1 bg-amber-600/90 hover:bg-amber-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  Thử lại ({failedCount})
                </button>
              )}

              {completedCount > 0 && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition"
                  title="Xóa ảnh đã hoàn thành"
                >
                  Dọn xong ({completedCount})
                </button>
              )}

              <button
                type="button"
                onClick={closeDrawer}
                className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition"
                title="Thu gọn"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress bar tổng thể */}
          {isUploading && (
            <div className="px-4 py-2 bg-slate-800/40 border-b border-slate-800 text-xs flex flex-col gap-1 shrink-0">
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Tiến độ tổng thể</span>
                <span className="font-mono text-blue-400 font-semibold">{overallProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Danh sách các ảnh trong hàng đợi */}
          <div className="p-3 overflow-y-auto space-y-2 divide-y divide-slate-800/60 max-h-96">
            {queue.map((item) => (
              <div
                key={item.id}
                className="pt-2 first:pt-0 flex items-center gap-3 text-xs group"
              >
                {/* Preview Thumbnail */}
                <div className="w-11 h-11 rounded-lg bg-slate-800 border border-slate-700/70 overflow-hidden shrink-0 flex items-center justify-center relative">
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={item.fileName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileImage className="w-5 h-5 text-slate-500" />
                  )}

                  {/* Icon trạng thái nhỏ */}
                  {item.status === "completed" && (
                    <div className="absolute inset-0 bg-emerald-900/60 flex items-center justify-center">
                      <Check className="w-4 h-4 text-emerald-300 stroke-[3]" />
                    </div>
                  )}
                  {item.status === "uploading" && (
                    <div className="absolute inset-0 bg-blue-900/40 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-blue-300 animate-spin" />
                    </div>
                  )}
                </div>

                {/* Info & Progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className="font-medium text-slate-200 truncate max-w-[140px] sm:max-w-[170px]" title={item.fileName}>
                      {item.fileName}
                    </p>
                    <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                      {formatBytes(item.fileSize)}
                    </span>
                  </div>

                  {/* Status label */}
                  <div className="flex items-center justify-between text-[11px]">
                    {item.status === "queued" && (
                      <span className="text-slate-400">Đang chờ lượt...</span>
                    )}
                    {item.status === "calculating_hash" && (
                      <span className="text-purple-400">Kiểm tra SHA-256...</span>
                    )}
                    {item.status === "initializing" && (
                      <span className="text-blue-400">Khởi tạo phiên...</span>
                    )}
                    {item.status === "uploading" && (
                      <span className="text-blue-400 font-semibold flex items-center gap-1">
                        Đang tải {item.progress}%
                      </span>
                    )}
                    {item.status === "completed" && (
                      <span className="text-emerald-400 font-medium">Hoàn tất</span>
                    )}
                    {item.status === "error" && (
                      <span className="text-rose-400 truncate max-w-[160px]" title={item.error}>
                        {item.error || "Lỗi tải ảnh"}
                      </span>
                    )}
                  </div>

                  {/* Progress bar per image */}
                  {(item.status === "uploading" || item.status === "initializing") && (
                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {item.status === "error" && (
                    <button
                      type="button"
                      onClick={() => retry(item.id)}
                      className="p-2 min-w-[32px] min-h-[32px] flex items-center justify-center hover:bg-slate-700 active:scale-95 text-amber-400 hover:text-amber-300 rounded-lg transition"
                      title="Thử lại ảnh này"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-2 min-w-[32px] min-h-[32px] flex items-center justify-center hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-rose-400 rounded-lg transition"
                    title="Xóa khỏi hàng đợi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
