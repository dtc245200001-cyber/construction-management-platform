import React from "react";
import { WifiOff, AlertCircle } from "lucide-react";

function formatCachedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export default function OfflineSnapshotBanner({ isFromCache, cachedAt, cacheMiss, pageName }) {
  if (isFromCache) {
    return <div role="status" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><WifiOff className="size-4 shrink-0" /> Đang ngoại tuyến — hiển thị dữ liệu lưu lúc {formatCachedAt(cachedAt)}</div>;
  }
  if (cacheMiss) {
    return <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><AlertCircle className="mt-0.5 size-4 shrink-0" /> Chưa có dữ liệu lưu sẵn cho {pageName} — cần mở trang này ít nhất 1 lần khi có mạng.</div>;
  }
  return null;
}
