import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Server,
  Smartphone,
  User,
  X,
  RefreshCw,
  AlertCircle,
  Tag,
} from "lucide-react";
import api from "../lib/api";
import { updateDiaryEntryByServerId, SYNC_STATUS } from "../lib/diaryDb";

function formatTimestamp(isoStr) {
  if (!isoStr) return "Chưa xác định";
  try {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    return d.toLocaleString("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return isoStr;
  }
}

export default function DiaryConflictDialog({
  isOpen = false,
  onClose,
  conflicts = [],
  projectId,
  canResolve = false,
  onResolved,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  if (!isOpen || !conflicts || conflicts.length === 0) return null;

  const safeIndex = Math.min(currentIndex, conflicts.length - 1);
  const currentConflict = conflicts[safeIndex];
  if (!currentConflict) return null;

  const serverSnap = currentConflict.server_snapshot || {};
  const clientSnap = currentConflict.client_snapshot || {};

  const isContentDiff = (serverSnap.content || "").trim() !== (clientSnap.content || "").trim();
  const isWorkItemDiff =
    serverSnap.work_item_id &&
    clientSnap.work_item_id &&
    String(serverSnap.work_item_id) !== String(clientSnap.work_item_id);
  const isDateDiff =
    serverSnap.entry_at &&
    clientSnap.entry_at &&
    new Date(serverSnap.entry_at).getTime() !== new Date(clientSnap.entry_at).getTime();

  const handleResolve = async (resolution) => {
    if (!canResolve || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await api.post(
        `/projects/${projectId}/diary-conflicts/${currentConflict.id}/resolve`,
        { resolution }
      );

      const resultingVersion = response.data?.resulting_version;
      const diaryEntry = response.data?.diary_entry;

      // Cập nhật lại IndexedDB nếu bản ghi cục bộ tồn tại
      try {
        if (currentConflict.diary_entry_id) {
          const localUpdates = {
            version: resultingVersion,
            serverVersion: resultingVersion,
            syncStatus: SYNC_STATUS.SYNCED,
            syncError: null,
            pendingOperation: null,
            conflictId: null,
          };
          if (diaryEntry?.content !== undefined) localUpdates.content = diaryEntry.content;
          if (diaryEntry?.work_item_id !== undefined) {
            localUpdates.work_item_id = diaryEntry.work_item_id;
            localUpdates.workItemId = diaryEntry.work_item_id;
          }
          if (diaryEntry?.entry_at !== undefined) {
            localUpdates.entry_at = diaryEntry.entry_at;
            localUpdates.entryAt = diaryEntry.entry_at;
          }
          await updateDiaryEntryByServerId(currentConflict.diary_entry_id, localUpdates);
        }
      } catch (idbErr) {
        console.warn("Không thể cập nhật IndexedDB sau khi giải quyết xung đột:", idbErr);
      }

      if (onResolved) {
        onResolved({
          conflictId: currentConflict.id,
          resolution,
          resultingVersion,
          diaryEntry,
        });
      }

      if (conflicts.length <= 1) {
        onClose?.();
      } else if (safeIndex >= conflicts.length - 1) {
        setCurrentIndex(Math.max(0, safeIndex - 1));
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Lỗi khi gửi yêu cầu giải quyết xung đột";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <h3 id="conflict-dialog-title" className="text-base font-bold text-foreground">
                Giải quyết xung đột phiên bản nhật ký
              </h3>
              <p className="text-xs text-muted-foreground">
                Phát hiện sửa đổi đồng thời trên cùng một mục nhật ký giữa máy chủ và thiết bị
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {conflicts.length > 1 && (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium">
                <button
                  type="button"
                  aria-label="Xung đột trước"
                  disabled={safeIndex === 0}
                  onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
                  className="rounded p-1 hover:bg-muted disabled:opacity-30"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span>
                  {safeIndex + 1} / {conflicts.length}
                </span>
                <button
                  type="button"
                  aria-label="Xung đột tiếp theo"
                  disabled={safeIndex === conflicts.length - 1}
                  onClick={() => setCurrentIndex((idx) => Math.min(conflicts.length - 1, idx + 1))}
                  className="rounded p-1 hover:bg-muted disabled:opacity-30"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng hộp thoại"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* ERROR NOTIFICATION */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-6 py-3 text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* COMPARISON BODY */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* SERVER COLUMN */}
            <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Server className="size-4 text-blue-600" />
                  <span>Bản trên máy chủ</span>
                </div>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  Version {currentConflict.server_version}
                </span>
              </div>

              <div className="flex flex-col gap-3 text-xs text-muted-foreground">
                {/* Work item */}
                <div
                  className={`rounded-lg p-2.5 ${
                    isWorkItemDiff
                      ? "border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                    <Tag className="size-3.5 text-muted-foreground" />
                    <span>Hạng mục:</span>
                  </div>
                  <div className="text-foreground">
                    {serverSnap.work_item_code ? `[${serverSnap.work_item_code}] ` : ""}
                    {serverSnap.work_item_name || currentConflict.current_work_item_name || "Chưa xác định"}
                  </div>
                </div>

                {/* Entry Date/Time */}
                <div
                  className={`rounded-lg p-2.5 ${
                    isDateDiff
                      ? "border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span>Thời gian nhật ký:</span>
                  </div>
                  <div className="text-foreground">{formatTimestamp(serverSnap.entry_at)}</div>
                </div>

                {/* Content */}
                <div
                  className={`flex-1 rounded-lg p-2.5 ${
                    isContentDiff
                      ? "border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span>Nội dung ghi chép:</span>
                  </div>
                  <p className="whitespace-pre-wrap font-sans text-sm text-foreground">
                    {serverSnap.content || "(Trống)"}
                  </p>
                </div>

                {/* Metadata */}
                <div className="border-t border-border pt-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <User className="size-3 text-muted-foreground" />
                      Người sửa:
                    </span>
                    <span className="font-medium text-foreground">
                      {serverSnap.updated_by_name || currentConflict.server_updated_by_name || "Hệ thống"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Thời gian sửa:</span>
                    <span>{formatTimestamp(currentConflict.server_updated_at || serverSnap.updated_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Nguồn:</span>
                    <span>Trực tuyến</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CLIENT COLUMN */}
            <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Smartphone className="size-4 text-emerald-600" />
                  <span>Bản trên thiết bị</span>
                </div>
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Dựa trên v{currentConflict.client_version}
                </span>
              </div>

              <div className="flex flex-col gap-3 text-xs text-muted-foreground">
                {/* Work item */}
                <div
                  className={`rounded-lg p-2.5 ${
                    isWorkItemDiff
                      ? "border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                    <Tag className="size-3.5 text-muted-foreground" />
                    <span>Hạng mục:</span>
                  </div>
                  <div className="text-foreground">
                    {clientSnap.work_item_code ? `[${clientSnap.work_item_code}] ` : ""}
                    {clientSnap.work_item_name || currentConflict.current_work_item_name || "Chưa xác định"}
                  </div>
                </div>

                {/* Entry Date/Time */}
                <div
                  className={`rounded-lg p-2.5 ${
                    isDateDiff
                      ? "border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span>Thời gian nhật ký:</span>
                  </div>
                  <div className="text-foreground">{formatTimestamp(clientSnap.entry_at)}</div>
                </div>

                {/* Content */}
                <div
                  className={`flex-1 rounded-lg p-2.5 ${
                    isContentDiff
                      ? "border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span>Nội dung ghi chép:</span>
                  </div>
                  <p className="whitespace-pre-wrap font-sans text-sm text-foreground">
                    {clientSnap.content || "(Trống)"}
                  </p>
                </div>

                {/* Metadata */}
                <div className="border-t border-border pt-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <User className="size-3 text-muted-foreground" />
                      Người sửa:
                    </span>
                    <span className="font-medium text-foreground">
                      {clientSnap.updated_by_name || currentConflict.client_updated_by_name || "Thiết bị này"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Thời gian sửa:</span>
                    <span>{formatTimestamp(currentConflict.client_updated_at || clientSnap.client_updated_at)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Nguồn:</span>
                    <span>{currentConflict.source || clientSnap.source || "Ngoại tuyến / Đồng bộ"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-4">
          <div className="text-xs text-muted-foreground">
            {!canResolve && (
              <span className="text-destructive font-medium">
                Bạn không có quyền giải quyết xung đột (cần quyền ghi nhật ký).
              </span>
            )}
            {canResolve && "Chọn phương án giải quyết phù hợp để cập nhật máy chủ."}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => handleResolve("server")}
              disabled={!canResolve || isSubmitting}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Server className="size-4 text-blue-600" />
              )}
              Giữ bản máy chủ
            </button>

            <button
              type="button"
              onClick={() => handleResolve("client")}
              disabled={!canResolve || isSubmitting}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Dùng bản thiết bị
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
