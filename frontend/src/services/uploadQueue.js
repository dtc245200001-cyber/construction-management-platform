import api from "../lib/api";
import { calculateSHA256 } from "../utils/fileChecksum";

const DB_NAME = "cmp_image_upload_queue";
const DB_VERSION = 1;
const STORE_NAME = "queue_items";

export const MAX_QUEUE_ITEMS = 30;
export const CONCURRENCY_LIMIT = 2;
export const CHUNK_SIZE = 512 * 1024; // 512KB per chunk

// IndexedDB Helper
class QueueDB {
  static dbPromise = null;

  static async getDB() {
    if (this.dbPromise) return this.dbPromise;

    if (typeof indexedDB === "undefined") {
      return null; // Môi trường không hỗ trợ IndexedDB (như SSR hoặc test)
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("Không thể mở IndexedDB, chuyển sang in-memory:", request.error);
        resolve(null);
      };
    });

    return this.dbPromise;
  }

  static async getAll() {
    const db = await this.getDB();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (err) {
        console.warn("Lỗi đọc IndexedDB:", err);
        resolve([]);
      }
    });
  }

  static async put(item) {
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        // Chú ý: File/Blob có thể lưu được trong IndexedDB
        store.put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }

  static async delete(id) {
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }

  static async clear() {
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }
}

/**
 * UploadQueueManager: Quản lý hàng đợi tải ảnh nền độc lập với nhật ký (T-80, T-81, T-82)
 */
class UploadQueueManager {
  constructor() {
    this.items = []; // Danh sách các mục trong hàng đợi
    this.listeners = new Set();
    this.activeUploads = 0;
    this.initialized = false;
    this.throttleTimer = null;

    // Tự động khôi phục hàng đợi khi khởi động
    this.init();

    // Tự động tiếp tục khi kết nối mạng phục hồi
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        console.log("Mạng đã phục hồi. Tự động tiếp tục hàng đợi tải ảnh...");
        this.retryAll();
      });
    }
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const savedItems = await QueueDB.getAll();
      if (savedItems && savedItems.length > 0) {
        // Cập nhật các mục đang 'uploading' trước đó về 'queued' để tiếp tục tải
        this.items = savedItems.map((item) => {
          let previewUrl = item.previewUrl;
          if (item.file && typeof URL !== "undefined" && URL.createObjectURL) {
            try {
              previewUrl = URL.createObjectURL(item.file);
            } catch (e) {
              // ignore
            }
          }
          if (
            item.status === "uploading" ||
            item.status === "calculating_hash" ||
            item.status === "initializing"
          ) {
            return { ...item, previewUrl, status: "queued" };
          }
          return { ...item, previewUrl };
        });
        this.notify();
        this.processQueue();
      }
    } catch (e) {
      console.warn("Không thể nạp hàng đợi từ IndexedDB:", e);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getItems());
    return () => this.listeners.delete(listener);
  }

  notify() {
    if (this.throttleTimer) return;
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      const snapshot = this.getItems();
      this.listeners.forEach((listener) => {
        try {
          listener(snapshot);
        } catch (e) {
          console.error("Lỗi trong upload queue subscriber:", e);
        }
      });
    }, 30);
  }

  getItems() {
    return [...this.items];
  }

  /**
   * Thêm nhiều ảnh vào hàng đợi (T-80: tối đa 30 ảnh)
   *
   * @param {Object} params
   * @param {number|string} params.projectId
   * @param {number|string} params.taskId
   * @param {number|string} params.logId (ID của nhật ký đã tạo thành công trên server)
   * @param {File[]} params.files Danh sách tệp ảnh
   * @returns {Promise<{ enqueued: number, rejected: number }>}
   */
  async enqueueImages({ projectId, taskId, logId, files }) {
    await this.init();

    if (!files || files.length === 0) return { enqueued: 0, rejected: 0 };

    let enqueued = 0;
    let rejected = 0;

    for (const file of files) {
      // Kiểm tra trần hàng đợi 30 ảnh (AC T-80)
      const currentActiveOrQueued = this.items.filter(
        (it) => it.status === "queued" || it.status === "uploading" || it.status === "error"
      ).length;

      if (currentActiveOrQueued >= MAX_QUEUE_ITEMS) {
        rejected++;
        continue;
      }

      const id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      let previewUrl = "";
      try {
        previewUrl = URL.createObjectURL(file);
      } catch (e) {
        // ignore
      }

      const queueItem = {
        id,
        projectId: Number(projectId),
        taskId: Number(taskId),
        logId: Number(logId),
        file,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "image/jpeg",
        previewUrl,
        checksum: null,
        sessionId: null,
        status: "queued", // 'queued' | 'calculating_hash' | 'initializing' | 'uploading' | 'completed' | 'error'
        progress: 0,
        bytesUploaded: 0,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.items.push(queueItem);
      await QueueDB.put(queueItem);
      enqueued++;
    }

    this.notify();
    this.processQueue();

    return { enqueued, rejected };
  }

  /**
   * Bộ điều phối xử lý hàng đợi với giới hạn đồng thời (Concurrency Limit = 2)
   */
  async processQueue() {
    while (this.activeUploads < CONCURRENCY_LIMIT) {
      // Tìm ảnh đang chờ tải
      const nextItem = this.items.find((item) => item.status === "queued");
      if (!nextItem) break;

      // Đánh dấu ngay trạng thái đang xử lý để vòng lặp kế tiếp không chọn trùng
      nextItem.status = "initializing";
      this.activeUploads++;

      this.uploadItem(nextItem)
        .catch((err) => {
          console.error(`Lỗi tải ảnh [${nextItem.fileName}]:`, err);
        })
        .finally(() => {
          if (nextItem.status === "aborted" || !this.items.some((it) => it.id === nextItem.id)) {
            return;
          }
          this.activeUploads = Math.max(0, this.activeUploads - 1);
          this.processQueue();
        });
    }
  }

  /**
   * Thực hiện tải một ảnh từng phần (T-81 chunked resumable upload)
   */
  async uploadItem(item) {
    try {
      if (!this.items.some((it) => it.id === item.id) || item.status === "aborted") return;

      // 1. Tính mã băm SHA-256 nếu chưa có
      if (!item.checksum) {
        item.status = "calculating_hash";
        item.updatedAt = new Date().toISOString();
        this.notify();
        await QueueDB.put(item);

        item.checksum = await calculateSHA256(item.file);
        if (!this.items.some((it) => it.id === item.id) || item.status === "aborted") return;
      }

      // 2. Khởi tạo upload session nếu chưa có
      if (!item.sessionId) {
        item.status = "initializing";
        item.updatedAt = new Date().toISOString();
        this.notify();
        await QueueDB.put(item);

        const initRes = await api.post(`/projects/${item.projectId}/upload-sessions`, {
          file_name: item.fileName,
          file_size: item.fileSize,
          mime_type: item.mimeType,
          checksum: item.checksum,
          task_log_id: item.logId,
          chunk_size: CHUNK_SIZE,
        });

        if (!this.items.some((it) => it.id === item.id) || item.status === "aborted") return;

        item.sessionId = initRes.data?.session_id;
        item.bytesUploaded = initRes.data?.bytes_uploaded || 0;
        item.progress = Math.round((item.bytesUploaded / item.fileSize) * 100);
        await QueueDB.put(item);
      } else {
        // 3. Nếu đã có session (ví dụ khi kết nối lại / resume): kiểm tra offset hiện tại trên server
        try {
          const sessionStatusRes = await api.get(
            `/projects/${item.projectId}/upload-sessions/${item.sessionId}`
          );

          if (sessionStatusRes.data.is_completed) {
            // Đã hoàn thành trên server từ trước (chống nhân đôi ảnh!)
            item.status = "completed";
            item.progress = 100;
            item.bytesUploaded = item.fileSize;
            item.attachment = sessionStatusRes.data.attachment;
            item.updatedAt = new Date().toISOString();
            await QueueDB.put(item);
            this.notify();
            return;
          }

          if (
            sessionStatusRes.data.status === "aborted" ||
            sessionStatusRes.data.status === "expired"
          ) {
            // Session trên server đã bị hủy hoặc hết hạn -> Khởi tạo lại session mới
            item.sessionId = null;
            item.bytesUploaded = 0;
            return this.uploadItem(item);
          }

          item.bytesUploaded = sessionStatusRes.data.bytes_uploaded || 0;
          item.progress = Math.round((item.bytesUploaded / item.fileSize) * 100);
        } catch (statusErr) {
          // Nếu session cũ hết hạn hoặc bị xóa trên server (404), tạo lại session mới
          if (statusErr.response?.status === 404) {
            item.sessionId = null;
            item.bytesUploaded = 0;
            return this.uploadItem(item);
          }
          throw statusErr;
        }
      }

      // 4. Bắt đầu gửi từng chunk từ vị trí offset hiện tại
      item.status = "uploading";
      item.error = null;
      item.updatedAt = new Date().toISOString();
      this.notify();
      await QueueDB.put(item);

      let currentOffset = item.bytesUploaded;
      const totalSize = item.fileSize;

      while (currentOffset < totalSize) {
        // Kiểm tra nếu người dùng đã hủy mục này giữa chừng
        const currentRef = this.items.find((it) => it.id === item.id);
        if (!currentRef || currentRef.status === "aborted") {
          return;
        }

        const nextChunkEnd = Math.min(currentOffset + CHUNK_SIZE, totalSize);
        const chunkBlob = item.file.slice(currentOffset, nextChunkEnd);

        // Đọc chunk dưới dạng ArrayBuffer để gửi qua binary
        const chunkArrayBuffer = await chunkBlob.arrayBuffer();

        let patchRes;
        try {
          patchRes = await api.patch(
            `/projects/${item.projectId}/upload-sessions/${item.sessionId}/chunk`,
            chunkArrayBuffer,
            {
              headers: {
                "Content-Type": "application/octet-stream",
                "Upload-Offset": currentOffset.toString(),
              },
            }
          );
        } catch (patchErr) {
          // Tự hồi phục nếu bị lệch offset (OFFSET_MISMATCH) hoặc mất tệp tạm (TEMP_FILE_MISSING)
          if (
            patchErr.response?.status === 409 &&
            (patchErr.response?.data?.code === "OFFSET_MISMATCH" ||
              patchErr.response?.data?.code === "TEMP_FILE_MISSING")
          ) {
            const expectedOffset = Number(patchErr.response.data.expected_offset);
            if (Number.isInteger(expectedOffset) && expectedOffset <= totalSize) {
              currentOffset = expectedOffset;
              item.bytesUploaded = currentOffset;
              item.progress = Math.round((currentOffset / totalSize) * 100);
              await QueueDB.put(item);
              this.notify();
              continue;
            }
          }
          throw patchErr;
        }

        if (patchRes.data.is_completed || patchRes.data.status === "completed") {
          item.status = "completed";
          item.progress = 100;
          item.bytesUploaded = totalSize;
          item.attachment = patchRes.data.attachment;
          item.updatedAt = new Date().toISOString();
          await QueueDB.put(item);
          this.notify();
          return;
        }

        currentOffset = patchRes.data.bytes_uploaded || nextChunkEnd;
        item.bytesUploaded = currentOffset;
        item.progress = Math.round((currentOffset / totalSize) * 100);
        item.updatedAt = new Date().toISOString();

        // Cập nhật tiến độ mượt mà
        this.notify();
        await QueueDB.put(item);
      }

      // Đánh dấu hoàn tất nếu offset đã đạt 100%
      item.status = "completed";
      item.progress = 100;
      item.updatedAt = new Date().toISOString();
      await QueueDB.put(item);
      this.notify();
    } catch (err) {
      console.warn(`Lỗi khi tải ảnh ${item.fileName}:`, err);
      item.status = "error";
      item.error =
        err.response?.data?.message ||
        err.message ||
        "Mất kết nối mạng khi đang tải ảnh. Bạn có thể bấm Thử lại.";
      item.updatedAt = new Date().toISOString();
      await QueueDB.put(item);
      this.notify();
    }
  }

  /**
   * Thử lại một ảnh bị lỗi (T-82: Resume từ offset, không nhân đôi ảnh)
   */
  async retry(itemId) {
    const item = this.items.find((it) => it.id === itemId);
    if (!item) return;

    item.status = "queued";
    item.error = null;
    item.updatedAt = new Date().toISOString();
    await QueueDB.put(item);
    this.notify();
    this.processQueue();
  }

  /**
   * Thử lại toàn bộ các ảnh bị lỗi
   */
  async retryAll() {
    let hasRetried = false;
    for (const item of this.items) {
      if (item.status === "error") {
        item.status = "queued";
        item.error = null;
        item.updatedAt = new Date().toISOString();
        await QueueDB.put(item);
        hasRetried = true;
      }
    }
    if (hasRetried) {
      this.notify();
      this.processQueue();
    }
  }

  /**
   * Xóa một mục khỏi hàng đợi
   */
  async removeItem(itemId) {
    const index = this.items.findIndex((it) => it.id === itemId);
    if (index !== -1) {
      const [removed] = this.items.splice(index, 1);
      if (removed.previewUrl && removed.previewUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(removed.previewUrl);
        } catch (e) {
          // ignore
        }
      }
      await QueueDB.delete(itemId);
      this.notify();
    }
  }

  /**
   * Xóa tất cả các ảnh đã hoàn tất khỏi hàng đợi
   */
  async clearCompleted() {
    const completedItems = this.items.filter((it) => it.status === "completed");
    for (const it of completedItems) {
      if (it.previewUrl && it.previewUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(it.previewUrl);
        } catch (e) {
          // ignore
        }
      }
      await QueueDB.delete(it.id);
    }
    this.items = this.items.filter((it) => it.status !== "completed");
    this.notify();
  }

  /**
   * Xóa toàn bộ hàng đợi và bộ nhớ IndexedDB
   */
  async clearAll() {
    for (const it of this.items) {
      if (it.previewUrl && it.previewUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(it.previewUrl);
        } catch (e) {
          // ignore
        }
      }
    }
    this.items = [];
    this.activeUploads = 0;
    await QueueDB.clear();
    this.notify();
  }
}

// Export singleton instance
export const uploadQueueManager = new UploadQueueManager();
export default uploadQueueManager;
