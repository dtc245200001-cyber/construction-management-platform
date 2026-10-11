const DB_NAME = "construction_diary_offline";
const DB_VERSION = 1;

let dbPromise = null;

export function openDiaryDB() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Trình duyệt không hỗ trợ IndexedDB"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("diaryLogs")) {
        const store = db.createObjectStore("diaryLogs", {
          keyPath: "id",
        });

        store.createIndex("projectId", "projectId", {
          unique: false,
        });

        store.createIndex("syncStatus", "syncStatus", {
          unique: false,
        });

        store.createIndex("createdAt", "createdAt", {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains("diaryAttachments")) {
        const store = db.createObjectStore("diaryAttachments", {
          keyPath: "id",
        });

        store.createIndex("logId", "logId", {
          unique: false,
        });
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

export async function saveDiaryLog(log) {
  const db = await openDiaryDB();

  const record = {
    ...log,
    id: log.id || crypto.randomUUID(),
    syncStatus: log.syncStatus || "pending",
    createdAt: log.createdAt || new Date().toISOString(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("diaryLogs", "readwrite");
    const store = transaction.objectStore("diaryLogs");

    store.put(record);

    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getDiaryLogsByProject(projectId) {
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("diaryLogs", "readonly");
    const store = transaction.objectStore("diaryLogs");
    const request = store.index("projectId").getAll(projectId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDiaryAttachment(attachment) {
  const db = await openDiaryDB();

  const record = {
    ...attachment,
    id: attachment.id || crypto.randomUUID(),
    createdAt: attachment.createdAt || new Date().toISOString(),
  };

  if (!(record.blob instanceof Blob)) {
    throw new Error("Ảnh đính kèm phải có dữ liệu Blob hợp lệ.");
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("diaryAttachments", "readwrite");
    const store = transaction.objectStore("diaryAttachments");

    store.put(record);

    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getDiaryAttachmentsByLog(logId) {
  const db = await openDiaryDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("diaryAttachments", "readonly");
    const store = transaction.objectStore("diaryAttachments");
    const request = store.index("logId").getAll(logId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
