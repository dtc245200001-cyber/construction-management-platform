import api from "../lib/api";
import {
  claimDiaryEntryForSync,
  getDiaryAttachmentsByLog,
  getPendingSyncEntries,
  releaseClaimToPending,
  SYNC_STATUS,
  updateDiaryAttachment,
  updateDiaryEntry,
} from "../lib/diaryDb";

const MAX_ATTEMPTS = 2;
const INITIAL_RETRY_DELAY_MS = 500;
// Backoff vòng quét hàng đợi (T-69): bắt đầu 2s, nhân đôi mỗi vòng, trần 60s.
// Khác với withRetry ở trên (retry trong-lần-gửi, 500ms x2, tối đa 2 lần).
const QUEUE_BASE_RETRY_DELAY_MS = 2000;
const QUEUE_MAX_RETRY_DELAY_MS = 60000;

/**
 * Thời gian chờ trước vòng quét lại thứ `attempt` (bắt đầu từ 0):
 * 2s, 4s, 8s, 16s, 32s, 60s, 60s, ...
 */
export function getQueueRetryDelay(attempt) {
  const safeAttempt = Number.isInteger(attempt) && attempt >= 0 ? attempt : 0;
  return Math.min(
    QUEUE_BASE_RETRY_DELAY_MS * 2 ** safeAttempt,
    QUEUE_MAX_RETRY_DELAY_MS,
  );
}

let activeSync = null;
let listenerCount = 0;
let retryTimer = null;
let queueRetryIndex = 0;

function notifySyncUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("diary-sync-updated"));
  }
}

function getErrorMessage(error) {
  const responseData = error?.response?.data;
  const responseMessage =
    typeof responseData === "string" ? responseData : responseData?.message;

  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage;
  }
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "Không thể đồng bộ nhật ký.";
}

function isRetryable(error) {
  const status = error?.response?.status;
  return (
    typeof status !== "number" ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

/**
 * Lỗi dữ liệu chắc chắn thất bại dù gửi lại (validate local trước khi gọi API).
 * Gắn status 400 để isRetryable() xếp vào lỗi vĩnh viễn → "failed", không retry
 * vô ích. getErrorMessage() đọc message từ response.data nên vẫn hiển thị đúng.
 */
function permanentError(message) {
  const error = new Error(message);
  error.response = { status: 400, data: { message } };
  return error;
}

async function withRetry(request) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (attempt + 1 >= MAX_ATTEMPTS || !isRetryable(error)) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, INITIAL_RETRY_DELAY_MS * 2 ** attempt),
      );
    }
  }
}

function getClientId(entry) {
  return entry.clientId || entry.client_id || entry.id;
}

function getLogType(entry) {
  const workItemId =
    entry.work_item_id !== undefined ? entry.work_item_id : entry.workItemId;
  if (workItemId !== undefined && workItemId !== null) {
    if (!Number.isInteger(workItemId) || workItemId <= 0) {
      throw permanentError("work_item_id phải là số nguyên dương.");
    }
    return "diaryEntry";
  }

  const taskId = Number(entry.taskId ?? entry.task_id);
  if (Number.isInteger(taskId) && taskId > 0) return "taskLog";
  return null;
}

function getImageBlob(attachment) {
  const blob = attachment.blob || attachment.file;
  if (blob && typeof blob.size === "number" && typeof blob.slice === "function") {
    return blob;
  }
  throw new Error(`Ảnh '${attachment.fileName || attachment.file_name}' không còn Blob cục bộ.`);
}

async function uploadDiaryAttachment(projectId, serverId, attachment) {
  const formData = new FormData();
  const blob = getImageBlob(attachment);
  const file = new File([await blob.arrayBuffer()], attachment.fileName || attachment.file_name || "anh-nhat-ky.jpg", {
    type: blob.type || attachment.mimeType || attachment.mime_type || "image/jpeg",
  });
  formData.append(
    "image",
    file,
  );
  formData.append("client_id", attachment.id);

  const response = await withRetry(() =>
    api.post(
      `/projects/${projectId}/diary-entries/${serverId}/attachments`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    ),
  );
  const uploadedAttachment = response?.data;
  if (!uploadedAttachment?.id) {
    throw new Error("Máy chủ không xác nhận đã lưu ảnh nhật ký.");
  }
  return uploadedAttachment;
}

async function syncDiaryEntry(entry, attachments) {
  const clientId = getClientId(entry);
  const projectId = Number(entry.projectId ?? entry.project_id);
  const workItemId =
    entry.work_item_id !== undefined ? entry.work_item_id : entry.workItemId;
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw permanentError("project_id của nhật ký không hợp lệ.");
  }
  if (!Number.isInteger(workItemId) || workItemId <= 0) {
    throw permanentError("work_item_id phải là số nguyên dương.");
  }

  let serverId = entry.serverId || entry.server_id;
  if (!serverId) {
    const response = await withRetry(() =>
      api.post(`/projects/${projectId}/diary-entries`, {
        work_item_id: workItemId,
        content: entry.content,
        client_id: clientId,
        entry_at: entry.entry_at || entry.entryAt || entry.created_at,
      }),
    );
    const serverEntry = response?.data?.entry || response?.data;
    serverId = serverEntry?.id;
    if (!serverId) {
      throw new Error("Máy chủ không trả về định danh nhật ký đã tạo.");
    }
    await updateDiaryEntry(clientId, { serverId, server_id: serverId });
    notifySyncUpdated();
  }

  for (const attachment of attachments) {
    if (attachment.syncStatus === SYNC_STATUS.SYNCED) continue;
    await updateDiaryAttachment(attachment.id, {
      syncStatus: SYNC_STATUS.SYNCING,
      syncError: null,
    });
    try {
      const uploaded = await uploadDiaryAttachment(projectId, serverId, attachment);
      await updateDiaryAttachment(attachment.id, {
        serverId: uploaded.id,
        url: uploaded.url,
        syncStatus: SYNC_STATUS.SYNCED,
        syncError: null,
      });
      notifySyncUpdated();
    } catch (error) {
      // Nhất quán với entry: lỗi mạng/timeout → attachment về pending để retry
      // cùng entry ở vòng sau; chỉ lỗi dữ liệu bị server từ chối mới failed.
      await updateDiaryAttachment(attachment.id, {
        syncStatus: isRetryable(error) ? SYNC_STATUS.PENDING : SYNC_STATUS.FAILED,
        syncError: getErrorMessage(error),
      });
      throw error;
    }
  }
}

async function syncTaskLog(entry, attachments) {
  const clientId = getClientId(entry);
  const projectId = Number(entry.projectId ?? entry.project_id);
  const taskId = Number(entry.taskId ?? entry.task_id);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw permanentError("project_id của nhật ký công việc không hợp lệ.");
  }
  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw permanentError("task_id của nhật ký không hợp lệ.");
  }

  const formData = new FormData();
  if (entry.content?.trim()) formData.append("content", entry.content.trim());
  formData.append("client_id", clientId);
  for (const attachment of attachments) {
    if (attachment.syncStatus === SYNC_STATUS.SYNCED) continue;
    const blob = getImageBlob(attachment);
    const fileName =
      attachment.fileName || attachment.file_name || "anh-hien-truong.jpg";
    const file = new File([await blob.arrayBuffer()], fileName, {
      type: blob.type || attachment.mimeType || attachment.mime_type || "image/jpeg",
    });
    formData.append(
      "images",
      file,
    );
  }

  const response = await withRetry(() =>
    api.post(
      `/projects/${projectId}/tasks/${taskId}/logs`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    ),
  );
  const serverLog = response?.data?.log;
  if (!serverLog?.id) {
    throw new Error("Máy chủ không xác nhận đã lưu nhật ký công việc.");
  }
  await updateDiaryEntry(clientId, {
    serverId: serverLog.id,
    server_id: serverLog.id,
    syncError: null,
  });
  notifySyncUpdated();

  const uploadedAttachments = Array.isArray(serverLog.attachments)
    ? serverLog.attachments
    : [];
  if (uploadedAttachments.length !== attachments.length) {
    throw new Error("Máy chủ chưa xác nhận đầy đủ ảnh đính kèm.");
  }

  for (const [index, attachment] of attachments.entries()) {
    if (attachment.syncStatus === SYNC_STATUS.SYNCED) continue;
    const uploadedAttachment = uploadedAttachments[index];
    if (!uploadedAttachment?.id) {
      throw new Error("Máy chủ chưa xác nhận ảnh đính kèm.");
    }
    await updateDiaryAttachment(attachment.id, {
      serverId: uploadedAttachment.id,
      url: uploadedAttachment.url,
      syncStatus: SYNC_STATUS.SYNCED,
      syncError: null,
    });
  }
}

async function syncEntry(localEntry) {
  const clientId = getClientId(localEntry);
  const entry = await claimDiaryEntryForSync(clientId);
  if (!entry) return;

  notifySyncUpdated();
  try {
    const attachments = await getDiaryAttachmentsByLog(clientId);
    const type = getLogType(entry);
    if (type === "diaryEntry") {
      await syncDiaryEntry(entry, attachments);
    } else if (type === "taskLog") {
      await syncTaskLog(entry, attachments);
    } else {
      throw new Error("Không xác định được loại nhật ký cần đồng bộ.");
    }

    await updateDiaryEntry(clientId, {
      syncStatus: SYNC_STATUS.SYNCED,
      syncError: null,
      syncStartedAt: null,
      syncedAt: new Date().toISOString(),
      isOffline: false,
    });
  } catch (error) {
    // T-72/S-30: phân loại lỗi. Chỉ server THỰC SỰ TỪ CHỐI vì dữ liệu sai
    // (400/404/422 có response) mới đánh "failed" vĩnh viễn. Timeout, mất mạng
    // (không có response) hay 408/429/5xx → nhả claim về "pending" để retry ở
    // vòng sau theo backoff T-69, giữ nguyên client_id (không sinh UUID mới),
    // giữ serverId đã có và Blob ảnh.
    if (isRetryable(error)) {
      await releaseClaimToPending(clientId, getErrorMessage(error));
    } else {
      await updateDiaryEntry(clientId, {
        syncStatus: SYNC_STATUS.FAILED,
        syncError: getErrorMessage(error),
        syncStartedAt: null,
      });
    }
    // Chỉ log mã định danh, không log nội dung nhật ký (NFR log T-73).
    console.error(`Đồng bộ nhật ký ${clientId} thất bại:`, error?.code || error?.response?.status || error?.message);
  } finally {
    notifySyncUpdated();
  }
}

export function syncPendingDiaryEntries() {
  if (activeSync) return activeSync;

  activeSync = runQueueLocked().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

/**
 * Chạy một vòng quét hàng đợi, serialize liên tab bằng Web Locks API khi có.
 * Fallback chạy thẳng trên trình duyệt cũ (Safari <15.4): chấp nhận POST kép,
 * server khử trùng bằng UNIQUE constraint nên không sinh dòng trùng.
 */
async function runQueueLocked() {
  if (
    typeof navigator !== "undefined" &&
    navigator.locks &&
    typeof navigator.locks.request === "function"
  ) {
    return navigator.locks.request("diary-sync", async () => runQueueOnce());
  }
  return runQueueOnce();
}

async function runQueueOnce() {
  const entries = await getPendingSyncEntries();
  for (const entry of entries) {
    await syncEntry(entry);
  }
  return entries.length;
}

function triggerSync() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  queueRetryIndex = 0;
  runQueueAndScheduleRetry();
}

function runQueueAndScheduleRetry() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  syncPendingDiaryEntries()
    .then(async () => {
      const remaining = await getPendingSyncEntries();
      // Retry vô hạn với backoff có trần, chỉ dừng khi hết hàng đợi,
      // listener đã cleanup, hoặc mất mạng. Reset chỉ số khi quét sạch để
      // đợt mất mạng tiếp theo bắt đầu lại từ 2s thay vì kẹt ở trần 60s.
      if (listenerCount === 0 || remaining.length === 0) {
        queueRetryIndex = 0;
        return;
      }
      const delay = getQueueRetryDelay(queueRetryIndex);
      queueRetryIndex += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        runQueueAndScheduleRetry();
      }, delay);
    })
    .catch((error) => {
      console.error("Không thể chạy hàng đợi đồng bộ nhật ký:", error);
    });
}

function handleVisibilitySync() {
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    triggerSync();
  }
}

function handleFocusSync() {
  triggerSync();
}

/**
 * Đăng ký Background Sync best-effort (T-71/S-30).
 * Chỉ là gợi ý cho trình duyệt tự chạy hàng đợi khi có mạng, KHÔNG phải cam kết:
 * SyncManager không tồn tại trên iOS Safari và nhiều WebView, và service worker
 * generateSW hiện tại không xử lý sự kiện "sync". Hàng đợi vẫn chạy chắc chắn qua
 * online event + mở app/focus (fallback bắt buộc). Mọi lỗi đều nuốt, không throw ra UI.
 */
async function registerBackgroundSync() {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    if (registration && registration.sync && typeof registration.sync.register === "function") {
      await registration.sync.register("diary-sync");
    }
  } catch (error) {
    console.debug("Bỏ qua Background Sync (trình duyệt không hỗ trợ):", error?.message || error);
  }
}

export function startDiarySync() {
  if (typeof window === "undefined") return () => {};
  listenerCount += 1;
  if (listenerCount === 1) {
    window.addEventListener("online", triggerSync);
    // Bổ sung cho "online": người dùng mở lại app / chuyển tab về mà không bắn
    // online event (ví dụ mạng đã có sẵn từ trước) thì vẫn kích hoạt quét hàng đợi.
    document.addEventListener("visibilitychange", handleVisibilitySync);
    window.addEventListener("focus", handleFocusSync);
  }
  triggerSync();
  // Fire-and-forget: không chặn vòng quét chính nếu SW chưa ready.
  registerBackgroundSync();

  return () => {
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0) {
      window.removeEventListener("online", triggerSync);
      document.removeEventListener("visibilitychange", handleVisibilitySync);
      window.removeEventListener("focus", handleFocusSync);
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      queueRetryIndex = 0;
    }
  };
}

export function requestDiarySync() {
  triggerSync();
  return activeSync || Promise.resolve(0);
}
