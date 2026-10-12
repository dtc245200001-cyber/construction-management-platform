import api from "../lib/api";
import {
  claimDiaryEntryForSync,
  getDiaryAttachmentsByLog,
  getPendingSyncEntries,
  SYNC_STATUS,
  updateDiaryAttachment,
  updateDiaryEntry,
} from "../lib/diaryDb";

const MAX_ATTEMPTS = 2;
const INITIAL_RETRY_DELAY_MS = 500;
const QUEUE_RETRY_DELAYS_MS = [2000, 10000, 30000];

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
  if (Number.isInteger(workItemId) && workItemId > 0) return "diaryEntry";

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
    throw new Error("project_id của nhật ký không hợp lệ.");
  }
  if (!Number.isInteger(workItemId) || workItemId <= 0) {
    throw new Error("work_item_id phải là số nguyên dương.");
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
      await updateDiaryAttachment(attachment.id, {
        syncStatus: SYNC_STATUS.FAILED,
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
    throw new Error("project_id của nhật ký công việc không hợp lệ.");
  }
  if (!Number.isInteger(taskId) || taskId <= 0) {
    throw new Error("task_id của nhật ký không hợp lệ.");
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
    await updateDiaryEntry(clientId, {
      syncStatus: SYNC_STATUS.FAILED,
      syncError: getErrorMessage(error),
      syncStartedAt: null,
    });
    console.error(`Đồng bộ nhật ký ${clientId} thất bại:`, error);
  } finally {
    notifySyncUpdated();
  }
}

export function syncPendingDiaryEntries() {
  if (activeSync) return activeSync;

  activeSync = (async () => {
    const entries = await getPendingSyncEntries();
    for (const entry of entries) {
      await syncEntry(entry);
    }
    return entries.length;
  })().finally(() => {
    activeSync = null;
  });
  return activeSync;
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
      if (
        listenerCount === 0 ||
        remaining.length === 0 ||
        queueRetryIndex >= QUEUE_RETRY_DELAYS_MS.length
      ) {
        return;
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        queueRetryIndex += 1;
        runQueueAndScheduleRetry();
      }, QUEUE_RETRY_DELAYS_MS[queueRetryIndex]);
    })
    .catch((error) => {
      console.error("Không thể chạy hàng đợi đồng bộ nhật ký:", error);
    });
}

export function startDiarySync() {
  if (typeof window === "undefined") return () => {};
  listenerCount += 1;
  if (listenerCount === 1) {
    window.addEventListener("online", triggerSync);
  }
  triggerSync();

  return () => {
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0) {
      window.removeEventListener("online", triggerSync);
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
