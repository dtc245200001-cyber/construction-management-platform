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
export const DB_VERSION = 2;

export const STORES = {
  DIARY_LOGS: "diaryLogs",
  DIARY_ATTACHMENTS: "diaryAttachments",
  // Aliases theo quy ước đặc tả
  DIARY_ENTRIES: "diaryLogs",
  DIARY_IMAGES: "diaryAttachments",
};

export const SYNC_STATUS = {
  PENDING: "pending",
  SYNCING: "syncing",
  SYNCED: "synced",
  FAILED: "failed",
};

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// Giới hạn 5MB theo ràng buộc T49 của backend
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

let dbPromise = null;

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
      dbPromise = null;
      reject(request.error);
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
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* ignore */
    }
    dbPromise = null;
  }
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
    for (const img of images) {
      validateImage(img);
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
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS],
      "readwrite"
    );
    const logStore = transaction.objectStore(STORES.DIARY_LOGS);
    const attachStore = transaction.objectStore(STORES.DIARY_ATTACHMENTS);

    const savedAttachments = [];

    transaction.onabort = () => {
      const err = transaction.error;
      if (err?.name === "QuotaExceededError") {
        reject(new Error("Không đủ dung lượng lưu trữ cục bộ trên thiết bị (QuotaExceededError)."));
      } else {
        reject(err || new Error("Transaction bị hủy. Dữ liệu đã được rollback."));
      }
    };
    transaction.onerror = () => {
      const err = transaction.error;
      if (err?.name === "QuotaExceededError") {
        reject(new Error("Không đủ dung lượng lưu trữ cục bộ trên thiết bị (QuotaExceededError)."));
      } else {
        reject(err || new Error("Lỗi khi lưu nhật ký vào IndexedDB."));
      }
    };
    transaction.oncomplete = () => {
      resolve({
        ...record,
        entry: record,
        attachments: savedAttachments,
      });
    };

    try {
      logStore.put(record);

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

          // Không lưu chuỗi URL blob tạm thời vào cơ sở dữ liệu IndexedDB
          delete attachRecord.previewUrl;
          if (typeof attachRecord.url === "string" && attachRecord.url.startsWith("blob:")) {
            delete attachRecord.url;
          }

          attachStore.put(attachRecord);
          savedAttachments.push(attachRecord);
        }

        // Dọn dẹp ảnh cũ của clientId này nếu không nằm trong danh sách ảnh mới để tránh trùng lặp
        if (attachStore.indexNames.contains("logId")) {
          const logIndex = attachStore.index("logId");
          const existingKeysReq = logIndex.getAllKeys(clientId);
          existingKeysReq.onsuccess = () => {
            const oldKeys = existingKeysReq.result || [];
            const newKeys = new Set(savedAttachments.map((a) => a.id));
            for (const oldKey of oldKeys) {
              if (!newKeys.has(oldKey)) {
                attachStore.delete(oldKey);
              }
            }
          };
        }
      }
    } catch (err) {
      transaction.abort();
      reject(err);
    }
  });
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

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readwrite");
    const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);

    store.put(record);

    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => {
      const err = transaction.error;
      if (err?.name === "QuotaExceededError") {
        reject(new Error("Không đủ dung lượng lưu trữ cục bộ trên thiết bị (QuotaExceededError)."));
      } else {
        reject(err || new Error("Lỗi khi lưu ảnh vào IndexedDB."));
      }
    };
    transaction.onabort = () => {
      const err = transaction.error;
      if (err?.name === "QuotaExceededError") {
        reject(new Error("Không đủ dung lượng lưu trữ cục bộ trên thiết bị (QuotaExceededError)."));
      } else {
        reject(err || new Error("Lỗi khi lưu ảnh vào IndexedDB."));
      }
    };
  });
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

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readwrite");
    const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);

    transaction.onabort = () => {
      const err = transaction.error;
      if (err?.name === "QuotaExceededError") {
        reject(new Error("Không đủ dung lượng lưu trữ cục bộ trên thiết bị (QuotaExceededError)."));
      } else {
        reject(err || new Error("Lỗi khi lưu ảnh vào IndexedDB."));
      }
    };
    transaction.onerror = () => {
      const err = transaction.error;
      if (err?.name === "QuotaExceededError") {
        reject(new Error("Không đủ dung lượng lưu trữ cục bộ trên thiết bị (QuotaExceededError)."));
      } else {
        reject(err || new Error("Lỗi khi lưu ảnh vào IndexedDB."));
      }
    };
    transaction.oncomplete = () => resolve(saved);

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

        store.put(record);
        saved.push(record);
      }
    } catch (err) {
      transaction.abort();
      reject(err);
    }
  });
}

/**
 * Lấy mục nhật ký theo clientId hoặc id
 */
export async function getDiaryEntryById(idOrClientId) {
  if (!idOrClientId) return null;
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_LOGS, "readonly");
    const store = transaction.objectStore(STORES.DIARY_LOGS);
    const request = store.get(idOrClientId);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result);
      } else {
        // Thử tìm theo index clientId nếu keyPath id không khớp
        if (store.indexNames.contains("clientId")) {
          const clientReq = store.index("clientId").get(idOrClientId);
          clientReq.onsuccess = () => resolve(clientReq.result || null);
          clientReq.onerror = () => reject(clientReq.error);
        } else {
          resolve(null);
        }
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export const getDiaryLogById = getDiaryEntryById;

/**
 * Lấy danh sách nhật ký theo projectId
 */
export async function getDiaryLogsByProject(projectId) {
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_LOGS, "readonly");
    const store = transaction.objectStore(STORES.DIARY_LOGS);
    const numId = Number(projectId);
    const request = store.index("projectId").getAll(numId);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export const getDiaryEntriesByProject = getDiaryLogsByProject;

/**
 * Lấy danh sách nhật ký theo taskId
 */
export async function getDiaryLogsByTask(taskId) {
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_LOGS, "readonly");
    const store = transaction.objectStore(STORES.DIARY_LOGS);
    const numId = Number(taskId);
    const request = store.index("taskId").getAll(numId);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export const getDiaryEntriesByTask = getDiaryLogsByTask;

/**
 * Lấy danh sách ảnh thuộc về một nhật ký
 */
export async function getDiaryAttachmentsByLog(logIdOrClientId) {
  if (!logIdOrClientId) return [];
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readonly");
    const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
    const request = store.index("logId").getAll(logIdOrClientId);

    request.onsuccess = () => {
      const results = request.result || [];
      if (results.length > 0) {
        resolve(results);
      } else {
        // Fallback kiểm tra index diaryClientId nếu query bằng clientId khác logId
        try {
          const req2 = store.index("diaryClientId").getAll(logIdOrClientId);
          req2.onsuccess = () => resolve(req2.result || []);
          req2.onerror = () => resolve(results);
        } catch {
          resolve(results);
        }
      }
    };
    request.onerror = () => reject(request.error);
  });
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
 * Lấy danh sách các nhật ký đang chờ đồng bộ (pending hoặc failed)
 */
export async function getPendingSyncEntries() {
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_LOGS, "readonly");
    const store = transaction.objectStore(STORES.DIARY_LOGS);
    const results = [];

    const request = store.openCursor();
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const val = cursor.value;
        if (
          val.syncStatus === SYNC_STATUS.PENDING ||
          val.syncStatus === SYNC_STATUS.FAILED ||
          (val.syncStatus === SYNC_STATUS.SYNCING &&
            Date.now() - Date.parse(val.syncStartedAt || 0) > 2 * 60 * 1000)
        ) {
          results.push(val);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export const getPendingDiaryLogs = getPendingSyncEntries;

export async function claimDiaryEntryForSync(clientId) {
  if (!clientId) return null;
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_LOGS, "readwrite");
    const store = transaction.objectStore(STORES.DIARY_LOGS);
    let claimed = null;
    const request = store.get(clientId);

    request.onsuccess = () => {
      const entry = request.result;
      if (!entry || entry.syncStatus === SYNC_STATUS.SYNCED) return;

      const staleSync =
        entry.syncStatus === SYNC_STATUS.SYNCING &&
        Date.now() - Date.parse(entry.syncStartedAt || 0) > 2 * 60 * 1000;
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
      store.put(claimed);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(claimed);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function updateDiaryAttachment(attachmentId, updates) {
  if (!attachmentId) throw new Error("Cần attachmentId để cập nhật ảnh.");
  const db = await openDiaryDB();
  const sanitized = sanitizeData(updates);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readwrite");
    const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
    const request = store.get(attachmentId);

    request.onsuccess = () => {
      if (!request.result) {
        reject(new Error(`Không tìm thấy ảnh với id '${attachmentId}' để cập nhật.`));
        return;
      }
      store.put({ ...request.result, ...sanitized, id: request.result.id });
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * Cập nhật nội dung hoặc trạng thái đồng bộ của mục nhật ký
 */
export async function updateDiaryEntry(clientId, updates) {
  if (!clientId) throw new Error("Cần clientId để cập nhật mục nhật ký.");
  const db = await openDiaryDB();
  const sanitized = sanitizeData(updates);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_LOGS, "readwrite");
    const store = transaction.objectStore(STORES.DIARY_LOGS);
    const getReq = store.get(clientId);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error(`Không tìm thấy nhật ký với id '${clientId}' để cập nhật.`));
        return;
      }

      const updated = {
        ...existing,
        ...sanitized,
        id: existing.id,
        clientId: existing.clientId || existing.id,
        localUpdatedAt: new Date().toISOString(),
      };

      store.put(updated);
    };

    getReq.onerror = () => reject(getReq.error);
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const updateDiaryLog = updateDiaryEntry;

/**
 * Xóa một mục nhật ký và toàn bộ ảnh liên quan trong transaction nguyên tử
 */
export async function deleteDiaryEntry(clientId) {
  if (!clientId) return false;
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS],
      "readwrite"
    );
    const logStore = transaction.objectStore(STORES.DIARY_LOGS);
    const attachStore = transaction.objectStore(STORES.DIARY_ATTACHMENTS);

    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve(true);

    try {
      // 1. Xóa bản ghi nhật ký
      logStore.delete(clientId);

      // 2. Tìm và xóa toàn bộ ảnh liên quan qua index logId
      const attachIndex = attachStore.index("logId");
      const cursorReq = attachIndex.openCursor(clientId);

      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    } catch (err) {
      transaction.abort();
      reject(err);
    }
  });
}

export const deleteDiaryLog = deleteDiaryEntry;

/**
 * Xóa sạch toàn bộ dữ liệu trong IndexedDB (dành cho dọn dẹp hoặc test)
 */
export async function clearDiaryDB() {
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS],
      "readwrite"
    );
    const logStore = transaction.objectStore(STORES.DIARY_LOGS);
    const attachStore = transaction.objectStore(STORES.DIARY_ATTACHMENTS);

    logStore.clear();
    attachStore.clear();

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * Xóa một ảnh đính kèm riêng lẻ khỏi IndexedDB
 */
export async function deleteDiaryAttachment(attachmentId) {
  if (!attachmentId) return false;
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.DIARY_ATTACHMENTS, "readwrite");
    const store = transaction.objectStore(STORES.DIARY_ATTACHMENTS);
    store.delete(attachmentId);

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const deleteDiaryImage = deleteDiaryAttachment;

/**
 * Dọn dẹp các ảnh đính kèm mồ côi (ảnh mà nhật ký cha đã bị xóa)
 */
export async function cleanOrphanAttachments() {
  const db = await openDiaryDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS],
      "readwrite"
    );
    const logStore = transaction.objectStore(STORES.DIARY_LOGS);
    const attachStore = transaction.objectStore(STORES.DIARY_ATTACHMENTS);

    const logKeysReq = logStore.getAllKeys();
    logKeysReq.onsuccess = () => {
      const validLogIds = new Set(logKeysReq.result || []);
      const cursorReq = attachStore.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const logId = cursor.value.logId || cursor.value.diaryClientId;
          if (logId && !validLogIds.has(logId)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    };
    logKeysReq.onerror = () => reject(logKeysReq.error);

    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
