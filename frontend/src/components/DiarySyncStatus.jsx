import React, { useState, useRef, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Wifi,
  WifiOff,
  ChevronDown,
  X,
  Cloud,
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
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

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
  const hasError = Boolean(lastError || loadError);
  const hasPending = stats.totalPending > 0;

  // Tự động đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Màu sắc và trạng thái cho nút gọn ở header
  let buttonStyle = "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100";
  let label = "Trực tuyến";

  if (hasError) {
    buttonStyle = "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100";
    label = "Lỗi đồng bộ";
  } else if (busy) {
    buttonStyle = "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100";
    label = "Đang đồng bộ";
  } else if (!isOnline) {
    buttonStyle = "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100";
    label = "Ngoại tuyến";
  } else if (hasPending) {
    buttonStyle = "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100";
    label = `${stats.totalPending} chờ gửi`;
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Nút bấm nhỏ gọn đặt trên Header / góc màn hình */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Trạng thái đồng bộ nhật ký"
        aria-expanded={isOpen}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all shadow-sm outline-none cursor-pointer ${buttonStyle}`}
      >
        {hasError ? (
          <AlertCircle className="size-3.5 shrink-0 text-rose-600" />
        ) : busy ? (
          <RefreshCw className="size-3.5 shrink-0 animate-spin text-blue-600" />
        ) : !isOnline ? (
          <WifiOff className="size-3.5 shrink-0 text-amber-600" />
        ) : (
          <Wifi className="size-3.5 shrink-0 text-emerald-600" />
        )}

        <span className="hidden sm:inline font-semibold">{label}</span>

        {hasPending && !hasError && (
          <span className="flex size-2 rounded-full bg-blue-600 animate-pulse" />
        )}

        <ChevronDown
          className={`size-3 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Popover chi tiết mở ra khi bấm vào nút */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Cloud className="size-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">
                Đồng bộ nhật ký
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-accent/60 transition-colors"
              aria-label="Đóng"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-3 space-y-3 text-xs">
            {/* Trạng thái kết nối */}
            <div className="flex items-center justify-between rounded-xl bg-muted/40 p-2.5">
              <span className="text-muted-foreground">Kết nối mạng:</span>
              <div
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  isOnline ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {isOnline ? (
                  <>
                    <Wifi className="size-3.5" />
                    <span>Đang trực tuyến</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="size-3.5" />
                    <span>Ngoại tuyến</span>
                  </>
                )}
              </div>
            </div>

            {/* Hàng đợi dữ liệu */}
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-border/80 bg-background p-2">
                <p className="text-[11px] text-muted-foreground">Nhật ký chờ</p>
                <p className="mt-0.5 text-base font-bold text-foreground">
                  {stats.pendingEntries}
                </p>
              </div>
              <div className="rounded-xl border border-border/80 bg-background p-2">
                <p className="text-[11px] text-muted-foreground">Ảnh chờ tải</p>
                <p className="mt-0.5 text-base font-bold text-foreground">
                  {stats.pendingImages}
                </p>
              </div>
            </div>

            {/* Lần đồng bộ gần nhất */}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock3 className="size-3.5 shrink-0" />
              <span>Đồng bộ gần nhất: {formatTime(lastSyncedAt)}</span>
            </div>

            {/* Thông báo lỗi nếu có */}
            {(lastError || loadError) && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-2.5 text-rose-800 space-y-1">
                <div className="flex items-start gap-1.5 font-semibold">
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5 text-rose-600" />
                  <span>{loadError ? "Lỗi cơ sở dữ liệu" : "Lỗi đồng bộ"}</span>
                </div>
                <p className="text-[11px] leading-relaxed break-words text-rose-700">
                  {loadError || lastError}
                </p>
              </div>
            )}

            {!hasError && stats.totalPending === 0 && !isSyncing && (
              <div className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="size-3.5 shrink-0" />
                <span>Dữ liệu trên thiết bị đã được đồng bộ đầy đủ.</span>
              </div>
            )}

            {/* Nút hành động */}
            <button
              type="button"
              onClick={retrySync}
              disabled={!isOnline || busy}
              className="w-full inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw
                className={`size-3.5 ${busy ? "animate-spin" : ""}`}
              />
              {retrying
                ? "Đang gửi yêu cầu..."
                : isSyncing
                ? "Đang đồng bộ..."
                : "Thử đồng bộ lại ngay"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
