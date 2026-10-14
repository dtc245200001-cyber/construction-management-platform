import { useCallback, useEffect, useState } from "react";
import {
  getDiaryLogsByProject,
  getDiarySyncStats,
  SYNC_STATUS,
  isDiarySyncClaimStale,
} from "../lib/diaryDb";
import { requestDiarySync } from "../services/diarySync";

function getProjectId() {
  if (typeof window === "undefined") return 1;
  return Number(localStorage.getItem("currentProjectId") || 1);
}

export default function useDiarySyncStatus() {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [stats, setStats] = useState({
    pendingEntries: 0,
    pendingImages: 0,
    totalPending: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [lastError, setLastError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextStats, logs] = await Promise.all([
        getDiarySyncStats(),
        getDiaryLogsByProject(getProjectId()),
      ]);

      setStats(nextStats);

      const projectLogs = Array.isArray(logs) ? logs : [];
      const syncing = projectLogs.some(
        (log) =>
          log.syncStatus === SYNC_STATUS.SYNCING &&
          !isDiarySyncClaimStale(log),
      );
      setIsSyncing(syncing);

      const successfulLogs = projectLogs
        .filter((log) => log.syncStatus === SYNC_STATUS.SYNCED && log.syncedAt)
        .sort(
          (a, b) =>
            new Date(b.syncedAt).getTime() - new Date(a.syncedAt).getTime(),
        );
      setLastSyncedAt(successfulLogs[0]?.syncedAt || null);

      const failedLogs = projectLogs
        .filter(
          (log) =>
            log.syncStatus === SYNC_STATUS.FAILED && log.syncError,
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.updatedAt || a.createdAt || 0).getTime(),
        );
      setLastError(failedLogs[0]?.syncError || "");
      setLoadError("");
    } catch (error) {
      setLoadError(error?.message || "Không đọc được trạng thái đồng bộ.");
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleFocus = () => {
      refresh();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("diary-sync-updated", refresh);

    refresh();
    const intervalId = window.setInterval(refresh, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("diary-sync-updated", refresh);
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const retrySync = useCallback(async () => {
    if (!isOnline || retrying) return;

    setRetrying(true);
    setLoadError("");

    try {
      await requestDiarySync();
      await refresh();
    } catch (error) {
      setLoadError(
        error?.message || "Không thể bắt đầu đồng bộ lại.",
      );
    } finally {
      setRetrying(false);
      await refresh();
    }
  }, [isOnline, retrying, refresh]);

  return {
    isOnline,
    stats,
    isSyncing,
    lastSyncedAt,
    lastError,
    loadError,
    retrying,
    retrySync,
  };
}
