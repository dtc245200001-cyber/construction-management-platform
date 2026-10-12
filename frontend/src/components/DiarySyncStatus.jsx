import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import useDiarySyncStatus from "../hooks/useDiarySyncStatus";

function formatTime(value) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có dữ liệu";

  return date.toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function DiarySyncStatus() {
  const {
    isOnline,
    stats,
    isSyncing,
    lastSyncedAt,
    lastError,
    loadError,
    retrying,
    retrySync,
  } = useDiarySyncStatus();

  const busy = retrying || isSyncing;

  return (
    <section
      aria-label="Trạng thái đồng bộ nhật ký"
      className="flex flex-col gap-3 border-b border-border bg-card px-4 py-3 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          className={`inline-flex items-center gap-2 text-sm font-medium ${isOnline ? "text-emerald-600" : "text-amber-600"
            }`}
          role="status"
        >
          {isOnline ? (
            <Wifi className="size-4" aria-hidden="true" />
          ) : (
            <WifiOff className="size-4" aria-hidden="true" />
          )}
          {isOnline ? "Đang trực tuyến" : "Ngoại tuyến"}
        </div>

        <span className="text-sm text-muted-foreground">
          {stats.pendingEntries} nhật ký chờ
        </span>
        <span className="text-sm text-muted-foreground">
          {stats.pendingImages} ảnh chờ
        </span>

        <button
          type="button"
          onClick={retrySync}
          disabled={!isOnline || busy}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={`size-4 ${busy ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {retrying ? "Đang yêu cầu..." : isSyncing ? "Đang đồng bộ..." : "Thử đồng bộ lại"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Clock3 className="size-3.5" aria-hidden="true" />
        <span>Đồng bộ thành công gần nhất: {formatTime(lastSyncedAt)}</span>
      </div>

      {lastError && (
        <p
          className="flex items-start gap-2 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Lỗi đồng bộ gần nhất: {lastError}</span>
        </p>
      )}
      {loadError && (
        <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{loadError}</span>
        </p>
      )}

      {!lastError && !loadError && stats.totalPending === 0 && !isSyncing && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Không có mục nào đang chờ đồng bộ trên thiết bị.
        </p>
      )}
    </section>
  );
}
