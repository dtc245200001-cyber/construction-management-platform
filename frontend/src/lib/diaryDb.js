/**
 * IndexedDB Service cho Lưu trữ Nhật ký và Ảnh ngoại tuyến (T65 / S-29)
 *
 * Cung cấp:
 * - Quản lý kết nối và nâng cấp version IndexedDB an toàn.
 * - Schema cho nhật ký (diary_entries / diaryLogs) và ảnh (diary_images / diaryAttachments).
 * - Định danh ổn định UUID (clientId) phía client.
 * - Quản lý trạng thái đồng bộ: pending, syncing, synced, failed.
 * - Lưu trữ Blob ảnh thực tế kèm quan hệ ngoại khóa chặt chẽ.
 * - Transaction nguyên tử (atomic) bảo đảm không để lại dữ liệu hoặc ảnh mồ côi.
 * - Tự động loại bỏ thông tin nhạy cảm (token, password) trước khi lưu.
 */

export const DB_NAME = "construction_diary_offline";
export const DB_VERSION = 3;

export const STORES = {
  DIARY_LOGS: "diaryLogs",
  DIARY_ATTACHMENTS: "diaryAttachments",
  OFFLINE_SNAPSHOTS: "offlineSnapshots",
  // Aliases theo quy ước đặc tả
  DIARY_ENTRIES: "diaryLogs",
  DIARY_IMAGES: "diaryAttachments",
};

export const SYNC_STATUS = {
  PENDING: "pending",
  SYNCING: "syncing",
  // Đặc tả S-30 gọi trạng thái đang gửi là "sending"; cài đặt giữ chuỗi
  // "syncing" để tương thích dữ liệu IndexedDB đã lưu ngoài hiện trường.
  SENDING: "syncing",
  SYNCED: "synced",
  FAILED: "failed",
  CONFLICT: "conflict",
};

// Sau khoảng này mà một claim "syncing" vẫn chưa xong (tab crash giữa chừng),
// vòng quét sau được phép nhặt lại mục đó. Giữ 2 phút để không giẫm chân lên
// lần gửi đang chạy (timeout axios 15s + withRetry 2 lần) ở tab khác.
export const STALE_CLAIM_TIMEOUT_MS = 2 * 60 * 1000;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// Giới hạn 5MB theo ràng buộc T49 của backend
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

let dbPromise = null;

function getWriteError(error, fallback) {
  if (error?.name === "QuotaExceededError") {
    return new Error(
      "Không đủ dung lượng lưu trữ cục bộ. Dữ liệu chưa được lưu đầy đủ; hãy giải phóng dung lượng rồi thử lại."
    );
  }
  if (error instanceof Error && error.message) return error;
  return new Error(fallback);
}

function watchTransaction(transaction, getResult, fallback) {
  let settled = false;
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const resolve = (result) => {
    if (settled) return;
    settled = true;
    resolvePromise(result);
  };
  const reject = (error) => {
    if (settled) return;
    settled = true;
    rejectPromise(getWriteError(error, fallback));
  };

  transaction.oncomplete = () => {
    try {
      resolve(getResult());
    } catch (error) {
      reject(error);
    }
  };
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () =>
    reject(
      transaction.error ||
      new Error(`${fallback} Transaction đã rollback.`),
    );

  return { promise, reject, isSettled: () => settled };
}

/**
 * Sinh UUID v4 ổn định phía client
 */
export function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Lấy đối tượng IndexedDB khả dụng trong môi trường hiện tại
 */
function getIDB() {
  if (typeof window !== "undefined" && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof indexedDB !== "undefined") {
    return indexedDB;
  }
  return null;
}

/**
 * Loại bỏ các thông tin nhạy cảm như token, mật khẩu trước khi lưu trữ
 */
export function sanitizeData(data) {
  if (!data || typeof data !== "object") return data;
  const sanitized = { ...data };
  const sensitiveKeys = [
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "password",
    "secret",
    "jwt",
    "authorization",
    "auth",
  ];
  for (const key of sensitiveKeys) {
    if (key in sanitized) {
      delete sanitized[key];
    }
  }
  return sanitized;
}

/**
 * Kiểm tra đối tượng có phải là Blob hoặc File (hỗ trợ cross-realm / JSDOM)
 */
export function isBlob(val) {
  if (!val) return false;
  if (typeof Blob !== "undefined" && val instanceof Blob) return true;
  if (typeof File !== "undefined" && val instanceof File) return true;
  if (typeof window !== "undefined" && window.Blob && val instanceof window.Blob) return true;
  if (typeof window !== "undefined" && window.File && val instanceof window.File) return true;
  return (
    val.constructor?.name === "Blob" ||
    val.constructor?.name === "File" ||
    (typeof val.size === "number" && typeof val.slice === "function")
  );
}

/**
 * Kiểm tra tính hợp lệ của Blob/File ảnh
 */
export function validateImage(image) {
  if (!image) {
    throw new Error("Dữ liệu ảnh không được để trống.");
  }
  const blob = image.blob || image.file || (isBlob(image) ? image : null);
  if (!blob || !isBlob(blob)) {
    throw new Error("Ảnh đính kèm phải có dữ liệu Blob hợp lệ.");
  }
  if (blob.size > MAX_IMAGE_SIZE) {
    throw new Error(
      `Kích thước ảnh (${(blob.size / (1024 * 1024)).toFixed(2)}MB) vượt quá giới hạn 5MB.`
    );
  }
  const mimeType = image.mimeType || image.mime_type || blob.type;
  if (
    mimeType &&
    mimeType !== "application/octet-stream" &&
    !mimeType.startsWith("image/") &&
    !ALLOWED_IMAGE_TYPES.includes(mimeType)
  ) {
    throw new Error(
      `Định dạng ảnh '${mimeType}' không được hỗ trợ. Chỉ chấp nhận JPEG, PNG, GIF, WebP.`
    );
  }
  return true;
}

/**
 * Khởi tạo và mở kết nối IndexedDB
 */
export function openDiaryDB() {
  const idb = getIDB();
  if (!idb) {
    return Promise.reject(new Error("Trình duyệt không hỗ trợ IndexedDB"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // 1. Object store lưu nhật ký
      let logStore;
      if (!db.objectStoreNames.contains(STORES.DIARY_LOGS)) {
        logStore = db.createObjectStore(STORES.DIARY_LOGS, { keyPath: "id" });
      } else {
        logStore = request.transaction.objectStore(STORES.DIARY_LOGS);
      }

      const logIndexes = [
        { name: "clientId", keyPath: "clientId", unique: false },
        { name: "projectId", keyPath: "projectId", unique: false },
        { name: "taskId", keyPath: "taskId", unique: false },
        { name: "workItemId", keyPath: "workItemId", unique: false },
        { name: "syncStatus", keyPath: "syncStatus", unique: false },
        { name: "createdAt", keyPath: "createdAt", unique: false },
      ];

      for (const idx of logIndexes) {
        if (!logStore.indexNames.contains(idx.name)) {
          logStore.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
        }
      }

      // 2. Object store lưu ảnh / tệp đính kèm
      let attachStore;
      if (!db.objectStoreNames.contains(STORES.DIARY_ATTACHMENTS)) {
        attachStore = db.createObjectStore(STORES.DIARY_ATTACHMENTS, {
          keyPath: "id",
        });
      } else {
        attachStore = request.transaction.objectStore(STORES.DIARY_ATTACHMENTS);
      }

      const attachIndexes = [
        { name: "logId", keyPath: "logId", unique: false },
        { name: "diaryClientId", keyPath: "diaryClientId", unique: false },
        { name: "projectId", keyPath: "projectId", unique: false },
        { name: "taskId", keyPath: "taskId", unique: false },
        { name: "createdAt", keyPath: "createdAt", unique: false },
      ];

      for (const idx of attachIndexes) {
        if (!attachStore.indexNames.contains(idx.name)) {
          attachStore.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
        }
      }

      if (!db.objectStoreNames.contains(STORES.OFFLINE_SNAPSHOTS)) {
        db.createObjectStore(STORES.OFFLINE_SNAPSHOTS, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      const err = request.error;
      dbPromise = null;
      if (err?.name === "VersionError" && typeof idb.deleteDatabase === "function") {
        console.warn("Phát hiện xung đột version IndexedDB, tự động đặt lại cơ sở dữ liệu...");
        try {
          const delReq = idb.deleteDatabase(DB_NAME);
          delReq.onsuccess = () => {
            dbPromise = null;
            openDiaryDB().then(resolve).catch(reject);
          };
          delReq.onerror = () => reject(err);
          return;
        } catch {
          reject(err);
          return;
        }
      }
      reject(err);
    };

    request.onblocked = () => {
      console.warn("IndexedDB đang chờ tab khác đóng kết nối.");
    };
  });

  return dbPromise;
}

/**
 * Đóng kết nối IndexedDB và giải phóng tài nguyên
 */
export async function closeDiaryDB() {
  if (!dbPromise) return;
  const pendingDb = dbPromise;
  dbPromise = null;
  const db = await pendingDb;
  db.close();
}

/**
 * Tạo một mục nhật ký kèm danh sách ảnh tùy chọn trong transaction nguyên tử
 */
export async function createDiaryEntry(entryData, images = []) {
  const db = await openDiaryDB();
  const sanitized = sanitizeData(entryData);
  const now = new Date().toISOString();

  // Định danh clientId ổn định
  const clientId =
    sanitized.clientId ||
    sanitized.client_id ||
    sanitized.id ||
    generateUUID();

  // Validate toàn bộ ảnh trước khi thực hiện ghi để đảm bảo tính nguyên tử
  if (Array.isArray(images) && images.length > 0) {
    const imageIds = new Set();
    for (const img of images) {
      validateImage(img);
      if (img.id && imageIds.has(img.id)) {
        throw new Error(`Ảnh đính kèm bị trùng id '${img.id}'.`);
      }
      if (img.id) imageIds.add(img.id);
    }
  }

  const record = {
    ...sanitized,
    id: clientId,
    clientId,
    client_id: clientId,
    serverId: sanitized.serverId || sanitized.server_id || null,
    projectId:
      sanitized.projectId !== undefined && sanitized.projectId !== null
        ? Number(sanitized.projectId)
        : sanitized.project_id !== undefined && sanitized.project_id !== null
          ? Number(sanitized.project_id)
          : null,
    taskId:
      sanitized.taskId !== undefined && sanitized.taskId !== null
        ? Number(sanitized.taskId)
        : sanitized.task_id !== undefined && sanitized.task_id !== null
          ? Number(sanitized.task_id)
          : null,
    workItemId:
      sanitized.workItemId !== undefined
        ? sanitized.workItemId
        : sanitized.work_item_id !== undefined
          ? sanitized.work_item_id
          : null,
    categoryId: sanitized.categoryId || sanitized.category_id || null,
    content: (sanitized.content || "").trim(),
    entryAt: sanitized.entryAt || sanitized.entry_at || sanitized.createdAt || now,
    entry_at: sanitized.entryAt || sanitized.entry_at || sanitized.createdAt || now,
    createdAt: sanitized.createdAt || sanitized.created_at || now,
    created_at: sanitized.createdAt || sanitized.created_at || now,
    updatedAt: sanitized.updatedAt || sanitized.updated_at || now,
    localUpdatedAt: now,
    syncStatus: sanitized.syncStatus || SYNC_STATUS.PENDING,
    syncError: sanitized.syncError || null,
    createdBy: sanitized.createdBy || sanitized.created_by || sanitized.user_name || null,
    version: sanitized.version || sanitized.serverVersion || 1,
    serverVersion: sanitized.serverVersion || sanitized.version || null,
    pendingOperation:
      sanitized.pendingOperation !== undefined
        ? sanitized.pendingOperation
        : (sanitized.serverId || sanitized.server_id ? null : "create"),
    conflictId: sanitized.conflictId || null,
  };

  const transaction = db.transaction(
    [STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS],
    "readwrite",
  );
  const logStore = transaction.objectStore(STORES.DIARY_LOGS);
  const attachStore = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
  const savedAttachments = [];
  const fallback =
    "Lỗi khi lưu nhật ký và ảnh vào IndexedDB. Transaction đã rollback.";
  const completion = watchTransaction(
    transaction,
    () => ({
      ...record,
      entry: record,
      attachments: savedAttachments,
    }),
    fallback,
  );

  try {
    const logPutRequest = logStore.put(record);
    logPutRequest.onerror = () => completion.reject(logPutRequest.error);

    if (Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        const imgSanitized = sanitizeData(img);
        const imgId = imgSanitized.id || generateUUID();
        const blob = imgSanitized.blob || imgSanitized.file || (isBlob(imgSanitized) ? imgSanitized : null);
        const fileName =
          imgSanitized.fileName ||
          imgSanitized.file_name ||
          imgSanitized.name ||
          "anh-nhat-ky.jpg";
        const mimeType =
          imgSanitized.mimeType ||
          imgSanitized.mime_type ||
          blob?.type ||
          "image/jpeg";
        const size =
          imgSanitized.size !== undefined
            ? imgSanitized.size
            : imgSanitized.file_size !== undefined
              ? imgSanitized.file_size
              : blob?.size || 0;

        const attachRecord = {
          ...imgSanitized,
          id: imgId,
          diaryClientId: clientId,
          diary_client_id: clientId,
          logId: clientId,
          projectId: record.projectId,
          taskId: record.taskId,
          blob,
          fileName,
          file_name: fileName,
          name: fileName,
          mimeType,
          mime_type: mimeType,
          size,
          file_size: size,
          syncStatus: imgSanitized.syncStatus || SYNC_STATUS.PENDING,
          createdAt: imgSanitized.createdAt || now,
        };

        delete attachRecord.previewUrl;
        if (typeof attachRecord.url === "string" && attachRecord.url.startsWith("blob:")) {
          delete attachRecord.url;
        }

        const existingRequest = attachStore.get(imgId);
        existingRequest.onsuccess = () => {
          if (completion.isSettled()) return;
          const existing = existingRequest.result;
          const existingLogId =
            existing?.logId || existing?.diaryClientId || existing?.diary_client_id;
          if (existing && existingLogId !== clientId) {
            const error = new Error(
              `Ảnh '${imgId}' đã thuộc về một nhật ký khác và không thể ghi đè.`,
            );
            completion.reject(error);
            transaction.abort();
            return;
          }

          try {
            const putRequest = attachStore.put(attachRecord);
            putRequest.onsuccess = () => savedAttachments.push(attachRecord);
            putRequest.onerror = () => completion.reject(putRequest.error);
          } catch (error) {
            completion.reject(error);
            transaction.abort();
          }
        };
        existingRequest.onerror = () => completion.reject(existingRequest.error);
      }
    }
  } catch (err) {
    completion.reject(err);
    transaction.abort();
  }

  return completion.promise;
}

/**
 * Tương thích ngược: Lưu một bản ghi nhật ký đơn lẻ
 */
export async function saveDiaryLog(log) {
  return createDiaryEntry(log, []);
}

/**
 * Lưu một ảnh vào IndexedDB liên kết với nhật ký
 */
export async function saveDiaryAttachment(attachment) {
  const db = await openDiaryDB();
  const sanitized = sanitizeData(attachment);
  validateImage(sanitized);

  const id = sanitized.id || generateUUID();
  const now = new Date().toISOString();
  const blob = sanitized.blob || sanitized.file || (isBlob(sanitized) ? sanitized : null);
  const fileName =
    sanitized.fileName ||
    sanitized.file_name ||
    sanitized.name ||
    "anh-nhat-ky.jpg";
  const mimeType =
    sanitized.mimeType ||
    sanitized.mime_type ||
    blob?.type ||
    "image/jpeg";
  const size =
    sanitized.size !== undefined
      ? sanitized.size
      : sanitized.file_size !== undefined
        ? sanitized.file_size
        : blob?.size || 0;
  const logId =
    sanitized.diaryClientId ||
    sanitized.diary_client_id ||
    sanitized.logId ||
    null;

  const record = {
    ...sanitized,
    id,
    diaryClientId: logId,
    diary_client_id: logId,
    logId,
    blob,
    fileName,
    file_name: fileName,
    name: fileName,
    mimeType,
    mime_type: mimeType,
    size,
    file_size: size,
    syncStatus: sanitized.syncStatus || SYNC_STATUS.PENDING,
    createdAt: sanitized.createdAt || sanitized.created_at || now,
  };

  delete record.previewUrl;
  if (typeof record.url === "string" && record.url.startsWith("blob:")) {
    delete record.url;
  }

  const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readwrite");
  const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
  const completion = watchTransaction(
    transaction,
    () => record,
    "Lỗi khi lưu ảnh vào IndexedDB.",
  );
  try {
    const request = store.put(record);
    request.onerror = () => completion.reject(request.error);
  } catch (error) {
    completion.reject(error);
    transaction.abort();
  }
  return completion.promise;
}

export const saveDiaryImage = saveDiaryAttachment;

/**
 * Lưu nhiều ảnh cho một mục nhật ký đã có
 */
export async function saveDiaryAttachments(diaryClientId, images) {
  if (!diaryClientId) {
    throw new Error("Cần có diaryClientId để liên kết ảnh.");
  }
  if (!Array.isArray(images) || images.length === 0) {
    return [];
  }

  for (const img of images) {
    validateImage(img);
  }

  const db = await openDiaryDB();
  const now = new Date().toISOString();
  const saved = [];

  const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readwrite");
  const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
  const completion = watchTransaction(
    transaction,
    () => saved,
    "Lỗi khi lưu ảnh vào IndexedDB.",
  );

  try {
    for (const img of images) {
      const sanitized = sanitizeData(img);
      const id = sanitized.id || generateUUID();
      const blob = sanitized.blob || sanitized.file || (isBlob(sanitized) ? sanitized : null);
      const fileName =
        sanitized.fileName ||
        sanitized.file_name ||
        sanitized.name ||
        "anh-nhat-ky.jpg";
      const mimeType =
        sanitized.mimeType ||
        sanitized.mime_type ||
        blob?.type ||
        "image/jpeg";
      const size =
        sanitized.size !== undefined
          ? sanitized.size
          : sanitized.file_size !== undefined
            ? sanitized.file_size
            : blob?.size || 0;

      const record = {
        ...sanitized,
        id,
        diaryClientId,
        diary_client_id: diaryClientId,
        logId: diaryClientId,
        blob,
        fileName,
        file_name: fileName,
        name: fileName,
        mimeType,
        mime_type: mimeType,
        size,
        file_size: size,
        syncStatus: sanitized.syncStatus || SYNC_STATUS.PENDING,
        createdAt: sanitized.createdAt || now,
      };

      delete record.previewUrl;
      if (typeof record.url === "string" && record.url.startsWith("blob:")) {
        delete record.url;
      }

      const request = store.put(record);
      request.onerror = () => completion.reject(request.error);
      saved.push(record);
    }
  } catch (err) {
    completion.reject(err);
    transaction.abort();
  }
  return completion.promise;
}

/**
 * Lấy mục nhật ký theo clientId hoặc id
 */
export async function getDiaryEntryById(idOrClientId) {
  if (!idOrClientId) return null;
  const db = await openDiaryDB();

  const transaction = db.transaction(STORES.DIARY_LOGS, "readonly");
  const store = transaction.objectStore(STORES.DIARY_LOGS);
  let result = null;
  const completion = watchTransaction(
    transaction,
    () => result,
    "Lỗi khi đọc nhật ký từ IndexedDB.",
  );
  const request = store.get(idOrClientId);

  request.onsuccess = () => {
    if (request.result) {
      result = request.result;
    } else if (store.indexNames.contains("clientId")) {
      const clientReq = store.index("clientId").get(idOrClientId);
      clientReq.onsuccess = () => {
        result = clientReq.result || null;
      };
      clientReq.onerror = () => completion.reject(clientReq.error);
    }
  };
  request.onerror = () => completion.reject(request.error);
  return completion.promise;
}

export const getDiaryLogById = getDiaryEntryById;

/**
 * Tìm mục nhật ký cục bộ theo id phía server mà không cần tăng DB_VERSION.
 * IndexedDB đang dùng clientId làm keyPath nên phải quét store khi chỉ có serverId.
 */
export async function getDiaryEntryByServerId(serverId) {
  if (serverId === undefined || serverId === null) return null;
  const targetServerId = Number(serverId);
  if (!Number.isInteger(targetServerId) || targetServerId <= 0) return null;

  const db = await openDiaryDB();
  const transaction = db.transaction(STORES.DIARY_LOGS, "readonly");
  const store = transaction.objectStore(STORES.DIARY_LOGS);
  let result = null;
  const completion = watchTransaction(
    transaction,
    () => result,
    "Lỗi khi tìm nhật ký theo serverId trong IndexedDB.",
  );

  const request = store.openCursor();
  request.onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor || result) return;
    const value = cursor.value;
    const valueServerId = Number(value?.serverId ?? value?.server_id);
    if (Number.isInteger(valueServerId) && valueServerId === targetServerId) {
      result = value;
      return;
    }
    cursor.continue();
  };
  request.onerror = () => completion.reject(request.error);
  return completion.promise;
}

export async function updateDiaryEntryByServerId(serverId, updates) {
  const entry = await getDiaryEntryByServerId(serverId);
  if (!entry) return false;
  await updateDiaryEntry(entry.id || entry.clientId || entry.client_id, updates);
  return true;
}

/**
 * Lấy danh sách nhật ký theo projectId
 */
export async function getDiaryLogsByProject(projectId) {
  const db = await openDiaryDB();

  const transaction = db.transaction(STORES.DIARY_LOGS, "readonly");
  let result = [];
  const completion = watchTransaction(
    transaction,
    () => result,
    "Lỗi khi đọc nhật ký dự án từ IndexedDB.",
  );
  const request = transaction
    .objectStore(STORES.DIARY_LOGS)
    .index("projectId")
    .getAll(Number(projectId));

  request.onsuccess = () => {
    result = request.result || [];
  };
  request.onerror = () => completion.reject(request.error);
  return completion.promise;
}

export const getDiaryEntriesByProject = getDiaryLogsByProject;

/**
 * Lấy danh sách nhật ký theo taskId
 */
export async function getDiaryLogsByTask(taskId) {
  const db = await openDiaryDB();

  const transaction = db.transaction(STORES.DIARY_LOGS, "readonly");
  let result = [];
  const completion = watchTransaction(
    transaction,
    () => result,
    "Lỗi khi đọc nhật ký công việc từ IndexedDB.",
  );
  const request = transaction
    .objectStore(STORES.DIARY_LOGS)
    .index("taskId")
    .getAll(Number(taskId));

  request.onsuccess = () => {
    result = request.result || [];
  };
  request.onerror = () => completion.reject(request.error);
  return completion.promise;
}

export const getDiaryEntriesByTask = getDiaryLogsByTask;

/**
 * Lấy danh sách ảnh thuộc về một nhật ký
 */
export async function getDiaryAttachmentsByLog(logIdOrClientId) {
  if (!logIdOrClientId) return [];
  const db = await openDiaryDB();

  const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readonly");
  const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
  let results = [];
  const completion = watchTransaction(
    transaction,
    () => results,
    "Lỗi khi đọc ảnh nhật ký từ IndexedDB.",
  );
  const request = store.index("logId").getAll(logIdOrClientId);

  request.onsuccess = () => {
    results = request.result || [];
    if (results.length > 0) return;

    try {
      const fallbackRequest = store
        .index("diaryClientId")
        .getAll(logIdOrClientId);
      fallbackRequest.onsuccess = () => {
        results = fallbackRequest.result || [];
      };
      fallbackRequest.onerror = () =>
        completion.reject(fallbackRequest.error);
    } catch (error) {
      completion.reject(error);
    }
  };
  request.onerror = () => completion.reject(request.error);
  return completion.promise;
}

export const getDiaryImages = getDiaryAttachmentsByLog;

/**
 * Lấy toàn bộ nhật ký kèm danh sách ảnh của nó
 */
export async function getDiaryEntryWithImages(clientId) {
  const entry = await getDiaryEntryById(clientId);
  if (!entry) return null;
  const attachments = await getDiaryAttachmentsByLog(clientId);
  return {
    ...entry,
    attachments,
  };
}

/**
 * Lấy danh sách các nhật ký đang chờ đồng bộ (pending hoặc failed).
 * Kết quả sắp xếp theo thời điểm tạo (createdAt) tăng dần để hàng đợi gửi
 * đúng thứ tự tạo (AC S-30), vì keyPath "id" là UUID ngẫu nhiên nên thứ tự
 * duyệt cursor của IndexedDB không phản ánh thứ tự tạo.
 */
export async function getPendingSyncEntries() {
  const db = await openDiaryDB();

  const transaction = db.transaction(STORES.DIARY_LOGS, "readonly");
  const store = transaction.objectStore(STORES.DIARY_LOGS);
  const results = [];
  const completion = watchTransaction(
    transaction,
    () => sortByCreatedAt(results),
    "Lỗi khi đọc hàng đợi đồng bộ từ IndexedDB.",
  );
  const request = store.openCursor();
  request.onsuccess = (e) => {
    const cursor = e.target.result;
    if (!cursor) return;
    const val = cursor.value;
    if (
      val &&
      typeof val === "object" &&
      (val.syncStatus === SYNC_STATUS.PENDING ||
        val.syncStatus === SYNC_STATUS.FAILED ||
        (val.syncStatus === SYNC_STATUS.SYNCING &&
          Date.now() - Date.parse(val.syncStartedAt || 0) > STALE_CLAIM_TIMEOUT_MS))
    ) {
      results.push(val);
    }
    cursor.continue();
  };
  request.onerror = () => completion.reject(request.error);
  return completion.promise;
}

export async function saveOfflineSnapshot(projectId, type, payload) {
  const db = await openDiaryDB();
  const key = `${Number(projectId)}:${String(type)}`;
  const record = { key, projectId: Number(projectId), type: String(type), payload, cachedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OFFLINE_SNAPSHOTS, "readwrite");
    tx.objectStore(STORES.OFFLINE_SNAPSHOTS).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error || new Error("Không thể lưu dữ liệu ngoại tuyến."));
    tx.onabort = () => reject(tx.error || new Error("Không thể lưu dữ liệu ngoại tuyến."));
  });
}

export async function getOfflineSnapshot(projectId, type) {
  const db = await openDiaryDB();
  const key = `${Number(projectId)}:${String(type)}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.OFFLINE_SNAPSHOTS, "readonly");
    const request = tx.objectStore(STORES.OFFLINE_SNAPSHOTS).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Không thể đọc dữ liệu ngoại tuyến."));
  });
}

/**
 * Sắp xếp mục hàng đợi theo thời điểm tạo tăng dần.
 * createdAt là chuỗi ISO nên so sánh chuỗi tương đương so sánh thời gian;
 * dùng Date.parse kèm fallback 0 để mục thiếu createdAt lên đầu, không vỡ sort.
 */
function sortByCreatedAt(entries) {
  return entries.sort((a, b) => {
    const aTime = Date.parse(a?.createdAt || a?.created_at || 0);
    const bTime = Date.parse(b?.createdAt || b?.created_at || 0);
    return (Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime);
  });
}

export const getPendingDiaryLogs = getPendingSyncEntries;

/**
 * Đánh dấu một mục đang chờ để gửi (claim).
 * LƯU Ý: đây là read-then-write trong một transaction, KHÔNG đảm bảo nguyên tử
 * liên tab (hai tab có thể cùng đọc "pending" trước khi bên nào ghi "syncing").
 * Tầng gọi (diarySync) phải bọc bằng navigator.locks; server khử trùng bằng
 * UNIQUE constraint nên POST kép chỉ tốn request, không sinh dòng trùng.
 */
export async function claimDiaryEntryForSync(clientId) {
  if (!clientId) return null;
  const db = await openDiaryDB();

  const transaction = db.transaction(STORES.DIARY_LOGS, "readwrite");
  const store = transaction.objectStore(STORES.DIARY_LOGS);
  let claimed = null;
  const completion = watchTransaction(
    transaction,
    () => claimed,
    "Lỗi khi cập nhật trạng thái đồng bộ.",
  );
  const request = store.get(clientId);

  request.onsuccess = () => {
    const entry = request.result;
    if (!entry || entry.syncStatus === SYNC_STATUS.SYNCED) return;

    const staleSync =
      entry.syncStatus === SYNC_STATUS.SYNCING &&
      Date.now() - Date.parse(entry.syncStartedAt || 0) > STALE_CLAIM_TIMEOUT_MS;
    if (
      entry.syncStatus !== SYNC_STATUS.PENDING &&
      entry.syncStatus !== SYNC_STATUS.FAILED &&
      !staleSync
    ) {
      return;
    }

    claimed = {
      ...entry,
      syncStatus: SYNC_STATUS.SYNCING,
      syncStartedAt: new Date().toISOString(),
      syncError: null,
    };
    try {
      const putRequest = store.put(claimed);
      putRequest.onerror = () => completion.reject(putRequest.error);
    } catch (error) {
      completion.reject(error);
      transaction.abort();
    }
  };
  request.onerror = () => completion.reject(request.error);

  return completion.promise;
}

/**
 * Nhả claim của một mục đang gửi về lại "pending" (dùng khi lỗi mạng/timeout,
 * xem T-72): giữ nguyên syncError để hiển thị, xóa syncStartedAt để vòng quét
 * sau nhặt ngay mà không phải chờ stale timeout.
 */
export async function releaseClaimToPending(clientId, errorMessage) {
  if (!clientId) return false;
  const db = await openDiaryDB();
  const sanitized = sanitizeData({
    syncStatus: SYNC_STATUS.PENDING,
    syncError: typeof errorMessage === "string" ? errorMessage : null,
    syncStartedAt: null,
  });

  const transaction = db.transaction(STORES.DIARY_LOGS, "readwrite");
  const store = transaction.objectStore(STORES.DIARY_LOGS);
  let released = false;
  const completion = watchTransaction(
    transaction,
    () => released,
    "Lỗi khi nhả claim đồng bộ về pending.",
  );
  const request = store.get(clientId);

  request.onsuccess = () => {
    const entry = request.result;
    if (!entry || entry.syncStatus !== SYNC_STATUS.SYNCING) return;
    try {
      const putRequest = store.put({ ...entry, ...sanitized });
      putRequest.onsuccess = () => {
        released = true;
      };
      putRequest.onerror = () => completion.reject(putRequest.error);
    } catch (error) {
      completion.reject(error);
      transaction.abort();
    }
  };
  request.onerror = () => completion.reject(request.error);

  return completion.promise;
}

export async function updateDiaryAttachment(attachmentId, updates) {
  if (!attachmentId) throw new Error("Cần attachmentId để cập nhật ảnh.");
  const db = await openDiaryDB();
  const sanitized = sanitizeData(updates);

  const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readwrite");
  const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
  const completion = watchTransaction(
    transaction,
    () => true,
    "Lỗi khi cập nhật ảnh trong IndexedDB.",
  );
  const request = store.get(attachmentId);

  request.onsuccess = () => {
    if (!request.result) {
      completion.reject(
        new Error(`Không tìm thấy ảnh với id '${attachmentId}' để cập nhật.`),
      );
      transaction.abort();
      return;
    }
    try {
      const putRequest = store.put({
        ...request.result,
        ...sanitized,
        id: request.result.id,
      });
      putRequest.onerror = () => completion.reject(putRequest.error);
    } catch (error) {
      completion.reject(error);
      transaction.abort();
    }
  };
  request.onerror = () => completion.reject(request.error);

  return completion.promise;
}

/**
 * Cập nhật nội dung hoặc trạng thái đồng bộ của mục nhật ký
 */
export async function updateDiaryEntry(clientId, updates) {
  if (!clientId) throw new Error("Cần clientId để cập nhật mục nhật ký.");
  const db = await openDiaryDB();
  const sanitized = sanitizeData(updates);

  const transaction = db.transaction(STORES.DIARY_LOGS, "readwrite");
  const store = transaction.objectStore(STORES.DIARY_LOGS);
  const completion = watchTransaction(
    transaction,
    () => true,
    "Lỗi khi cập nhật nhật ký trong IndexedDB.",
  );
  const getReq = store.get(clientId);

  getReq.onsuccess = () => {
    const existing = getReq.result;
    if (!existing) {
      completion.reject(
        new Error(`Không tìm thấy nhật ký với id '${clientId}' để cập nhật.`),
      );
      transaction.abort();
      return;
    }

    const updated = {
      ...existing,
      ...sanitized,
      id: existing.id,
      clientId: existing.clientId || existing.id,
      localUpdatedAt: new Date().toISOString(),
    };

    try {
      const putRequest = store.put(updated);
      putRequest.onerror = () => completion.reject(putRequest.error);
    } catch (error) {
      completion.reject(error);
      transaction.abort();
    }
  };

  getReq.onerror = () => completion.reject(getReq.error);

  return completion.promise;
}

export const updateDiaryLog = updateDiaryEntry;

/**
 * Xóa một mục nhật ký và toàn bộ ảnh liên quan trong transaction nguyên tử
 */
export async function deleteDiaryEntry(clientId) {
  if (!clientId) return false;
  const db = await openDiaryDB();

  const transaction = db.transaction(
    [STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS],
    "readwrite",
  );
  const logStore = transaction.objectStore(STORES.DIARY_LOGS);
  const attachStore = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
  const completion = watchTransaction(
    transaction,
    () => true,
    "Lỗi khi xóa nhật ký và ảnh khỏi IndexedDB.",
  );

  try {
    const logDeleteRequest = logStore.delete(clientId);
    logDeleteRequest.onerror = () =>
      completion.reject(logDeleteRequest.error);
    const cursorReq = attachStore.index("logId").openCursor(clientId);
    cursorReq.onsuccess = (e) => {
      try {
        const cursor = e.target.result;
        if (!cursor) return;
        const deleteRequest = cursor.delete();
        deleteRequest.onerror = () => completion.reject(deleteRequest.error);
        cursor.continue();
      } catch (error) {
        completion.reject(error);
        transaction.abort();
      }
    };
    cursorReq.onerror = () => completion.reject(cursorReq.error);
  } catch (error) {
    completion.reject(error);
    transaction.abort();
  }

  return completion.promise;
}

export const deleteDiaryLog = deleteDiaryEntry;

/**
 * Xóa sạch toàn bộ dữ liệu trong IndexedDB (dành cho dọn dẹp hoặc test)
 */
export async function clearDiaryDB() {
  const db = await openDiaryDB();

  const transaction = db.transaction(
    [STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS],
    "readwrite",
  );
  const logStore = transaction.objectStore(STORES.DIARY_LOGS);
  const attachStore = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
  const completion = watchTransaction(
    transaction,
    () => true,
    "Lỗi khi xóa dữ liệu nhật ký trong IndexedDB.",
  );
  try {
    const logRequest = logStore.clear();
    const attachmentRequest = attachStore.clear();
    logRequest.onerror = () => completion.reject(logRequest.error);
    attachmentRequest.onerror = () =>
      completion.reject(attachmentRequest.error);
  } catch (error) {
    completion.reject(error);
    transaction.abort();
  }
  return completion.promise;
}

/**
 * Xóa một ảnh đính kèm riêng lẻ khỏi IndexedDB
 */
export async function deleteDiaryAttachment(attachmentId) {
  if (!attachmentId) return false;
  const db = await openDiaryDB();

  const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readwrite");
  const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
  const completion = watchTransaction(
    transaction,
    () => true,
    "Lỗi khi xóa ảnh khỏi IndexedDB.",
  );
  try {
    const request = store.delete(attachmentId);
    request.onerror = () => completion.reject(request.error);
  } catch (error) {
    completion.reject(error);
    transaction.abort();
  }
  return completion.promise;
}

export const deleteDiaryImage = deleteDiaryAttachment;

/**
 * Dọn dẹp các ảnh đính kèm mồ côi (ảnh mà nhật ký cha đã bị xóa)
 */
export async function cleanOrphanAttachments() {
  const db = await openDiaryDB();
  const transaction = db.transaction(
    [STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS],
    "readwrite",
  );
  const logStore = transaction.objectStore(STORES.DIARY_LOGS);
  const attachStore = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
  const completion = watchTransaction(
    transaction,
    () => true,
    "Lỗi khi dọn ảnh mồ côi trong IndexedDB.",
  );
  const logKeysReq = logStore.getAllKeys();
  logKeysReq.onsuccess = () => {
    try {
      const validLogIds = new Set(logKeysReq.result || []);
      const cursorReq = attachStore.openCursor();
      cursorReq.onsuccess = (e) => {
        try {
          const cursor = e.target.result;
          if (!cursor) return;
          const logId = cursor.value.logId || cursor.value.diaryClientId;
          if (
            cursor.value.syncStatus === SYNC_STATUS.SYNCED &&
            logId &&
            !validLogIds.has(logId)
          ) {
            const deleteRequest = cursor.delete();
            deleteRequest.onerror = () =>
              completion.reject(deleteRequest.error);
          }
          cursor.continue();
        } catch (error) {
          completion.reject(error);
          transaction.abort();
        }
      };
      cursorReq.onerror = () => completion.reject(cursorReq.error);
    } catch (error) {
      completion.reject(error);
      transaction.abort();
    }
  };
  logKeysReq.onerror = () => completion.reject(logKeysReq.error);
  return completion.promise;
}

/**
 * Thống kê nhật ký và ảnh chưa đồng bộ.
 * Có thể chạy khi offline vì chỉ đọc dữ liệu trong IndexedDB.
 */
export async function getDiarySyncStats() {
  const db = await openDiaryDB();

  const transaction = db.transaction(
    [STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS],
    "readonly",
  );

  const logStore = transaction.objectStore(STORES.DIARY_LOGS);
  const attachmentStore = transaction.objectStore(
    STORES.DIARY_ATTACHMENTS,
  );

  const logsRequest = logStore.getAll();
  const attachmentsRequest = attachmentStore.getAll();

  return new Promise((resolve, reject) => {
    let logs;
    let attachments;

    logsRequest.onsuccess = () => {
      logs = logsRequest.result || [];
    };

    attachmentsRequest.onsuccess = () => {
      attachments = attachmentsRequest.result || [];
    };

    logsRequest.onerror = () => reject(logsRequest.error);
    attachmentsRequest.onerror = () =>
      reject(attachmentsRequest.error);

    transaction.oncomplete = () => {
      const unsentStatuses = new Set([
        SYNC_STATUS.PENDING,
        SYNC_STATUS.SYNCING,
        SYNC_STATUS.FAILED,
      ]);

      const unsentLogs = (logs || []).filter((log) =>
        unsentStatuses.has(log.syncStatus),
      );

      const unsentLogIds = new Set();

      unsentLogs.forEach((log) => {
        if (log.clientId) unsentLogIds.add(log.clientId);
        if (log.id) unsentLogIds.add(log.id);
      });

      const pendingImages = (attachments || []).filter((image) => {
        const parentId = image.logId || image.diaryClientId;

        return (
          parentId &&
          unsentLogIds.has(parentId) &&
          image.syncStatus !== SYNC_STATUS.SYNCED
        );
      }).length;

      resolve({
        pendingEntries: unsentLogs.length,
        pendingImages,
        totalPending: unsentLogs.length + pendingImages,
      });
    };

    transaction.onerror = () => {
      reject(
        transaction.error ||
        new Error("Không thể thống kê hàng đợi đồng bộ nhật ký."),
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ||
        new Error("Giao dịch thống kê đồng bộ đã bị hủy."),
      );
    };
  });
}