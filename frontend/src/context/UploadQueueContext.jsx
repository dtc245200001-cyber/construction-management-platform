/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import uploadQueueManager from "../services/uploadQueue";

const UploadQueueContext = createContext(null);

export function UploadQueueProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    // Đăng ký nhận cập nhật từ UploadQueueManager
    const unsubscribe = uploadQueueManager.subscribe((items) => {
      setQueue(items);
    });
    return () => unsubscribe();
  }, []);

  const activeCount = useMemo(
    () =>
      queue.filter(
        (it) =>
          it.status === "uploading" ||
          it.status === "calculating_hash" ||
          it.status === "initializing"
      ).length,
    [queue]
  );

  const queuedCount = useMemo(
    () => queue.filter((it) => it.status === "queued").length,
    [queue]
  );

  const completedCount = useMemo(
    () => queue.filter((it) => it.status === "completed").length,
    [queue]
  );

  const failedCount = useMemo(
    () => queue.filter((it) => it.status === "error").length,
    [queue]
  );

  const isUploading = activeCount > 0 || queuedCount > 0;

  // Tính tiến độ tổng thể của các ảnh chưa hoàn thành
  const overallProgress = useMemo(() => {
    if (queue.length === 0) return 0;
    const totalBytes = queue.reduce((sum, it) => sum + (it.fileSize || 0), 0);
    const uploadedBytes = queue.reduce((sum, it) => sum + (it.bytesUploaded || 0), 0);
    if (totalBytes === 0) return 0;
    return Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
  }, [queue]);

  const enqueueImages = useCallback(async (params) => {
    const res = await uploadQueueManager.enqueueImages(params);
    // Tự động mở drawer hoặc hiển thị thông báo nếu có ảnh mới
    return res;
  }, []);

  const retry = useCallback((itemId) => {
    return uploadQueueManager.retry(itemId);
  }, []);

  const retryAll = useCallback(() => {
    return uploadQueueManager.retryAll();
  }, []);

  const removeItem = useCallback((itemId) => {
    return uploadQueueManager.removeItem(itemId);
  }, []);

  const clearCompleted = useCallback(() => {
    return uploadQueueManager.clearCompleted();
  }, []);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((prev) => !prev), []);

  const value = {
    queue,
    activeCount,
    queuedCount,
    completedCount,
    failedCount,
    totalCount: queue.length,
    isUploading,
    overallProgress,
    isDrawerOpen,
    setIsDrawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    enqueueImages,
    retry,
    retryAll,
    removeItem,
    clearCompleted,
  };

  return (
    <UploadQueueContext.Provider value={value}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const context = useContext(UploadQueueContext);
  if (!context) {
    throw new Error("useUploadQueue phải được dùng bên trong UploadQueueProvider");
  }
  return context;
}

export default UploadQueueContext;
