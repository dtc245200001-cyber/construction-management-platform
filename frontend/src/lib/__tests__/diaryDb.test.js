import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DB_NAME,
  DB_VERSION,
  STORES,
  SYNC_STATUS,
  generateUUID,
  sanitizeData,
  validateImage,
  isBlob,
  openDiaryDB,
  closeDiaryDB,
  clearDiaryDB,
  createDiaryEntry,
  saveDiaryLog,
  saveDiaryAttachment,
  saveDiaryAttachments,
  getDiaryEntryById,
  getDiaryLogsByProject,
  getDiaryLogsByTask,
  getDiaryAttachmentsByLog,
  getDiaryEntryWithImages,
  getPendingSyncEntries,
  updateDiaryEntry,
  deleteDiaryEntry,
} from "../diaryDb";

describe("T65 — IndexedDB Service cho Nhật ký và Ảnh ngoại tuyến", () => {
  beforeEach(async () => {
    await clearDiaryDB();
  });

  afterEach(async () => {
    await closeDiaryDB();
  });

  describe("1. Khởi tạo Database và Schema", () => {
    it("mở database thành công và schema có đúng các store và index", async () => {
      const db = await openDiaryDB();
      expect(db.name).toBe(DB_NAME);
      expect(db.version).toBe(DB_VERSION);

      // Kiểm tra Object Stores
      expect(db.objectStoreNames.contains(STORES.DIARY_LOGS)).toBe(true);
      expect(db.objectStoreNames.contains(STORES.DIARY_ATTACHMENTS)).toBe(true);

      const tx = db.transaction([STORES.DIARY_LOGS, STORES.DIARY_ATTACHMENTS], "readonly");
      const logStore = tx.objectStore(STORES.DIARY_LOGS);
      const attachStore = tx.objectStore(STORES.DIARY_ATTACHMENTS);

      // Kiểm tra indexes của diaryLogs
      expect(logStore.indexNames.contains("clientId")).toBe(true);
      expect(logStore.indexNames.contains("projectId")).toBe(true);
      expect(logStore.indexNames.contains("taskId")).toBe(true);
      expect(logStore.indexNames.contains("syncStatus")).toBe(true);
      expect(logStore.indexNames.contains("createdAt")).toBe(true);

      // Kiểm tra indexes của diaryAttachments
      expect(attachStore.indexNames.contains("logId")).toBe(true);
      expect(attachStore.indexNames.contains("diaryClientId")).toBe(true);
      expect(attachStore.indexNames.contains("createdAt")).toBe(true);
    });
  });

  describe("2. Client ID UUID và Bảo mật dữ liệu", () => {
    it("sinh UUID hợp lệ theo chuẩn RFC4122", () => {
      const id1 = generateUUID();
      const id2 = generateUUID();
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      // Kiểm tra định dạng UUID xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(id1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it("loại bỏ token nhạy cảm trước khi lưu", () => {
      const input = {
        projectId: 1,
        content: "Báo cáo ngày",
        token: "secret-token-123",
        accessToken: "bearer-token",
        password: "secretpassword",
      };
      const sanitized = sanitizeData(input);
      expect(sanitized.projectId).toBe(1);
      expect(sanitized.content).toBe("Báo cáo ngày");
      expect(sanitized.token).toBeUndefined();
      expect(sanitized.accessToken).toBeUndefined();
      expect(sanitized.password).toBeUndefined();
    });

    it("giữ nguyên clientId ổn định khi được truyền vào", async () => {
      const predefinedClientId = "11111111-2222-4333-8444-555555555555";
      const result = await createDiaryEntry({
        clientId: predefinedClientId,
        projectId: 10,
        content: "Kiểm tra giữ clientId",
      });

      expect(result.clientId).toBe(predefinedClientId);
      expect(result.id).toBe(predefinedClientId);

      const saved = await getDiaryEntryById(predefinedClientId);
      expect(saved).not.toBeNull();
      expect(saved.clientId).toBe(predefinedClientId);
    });
  });

  describe("3. Lưu Nhật ký và Trạng thái đồng bộ", () => {
    it("tạo mục nhật ký thành công với syncStatus mặc định là pending", async () => {
      const entry = await createDiaryEntry({
        projectId: 5,
        taskId: 12,
        workItemId: 3,
        content: "Đổ bê tông sàn tầng 2",
        createdBy: "Kỹ sư Nguyễn Văn A",
      });

      expect(entry.clientId).toBeDefined();
      expect(entry.projectId).toBe(5);
      expect(entry.taskId).toBe(12);
      expect(entry.workItemId).toBe(3);
      expect(entry.content).toBe("Đổ bê tông sàn tầng 2");
      expect(entry.syncStatus).toBe(SYNC_STATUS.PENDING);
      expect(entry.serverId).toBeNull();
      expect(entry.createdAt).toBeDefined();

      const retrieved = await getDiaryEntryById(entry.clientId);
      expect(retrieved.content).toBe("Đổ bê tông sàn tầng 2");
    });

    it("truy vấn danh sách nhật ký theo projectId và taskId", async () => {
      await createDiaryEntry({ projectId: 1, taskId: 101, content: "Việc 1" });
      await createDiaryEntry({ projectId: 1, taskId: 102, content: "Việc 2" });
      await createDiaryEntry({ projectId: 2, taskId: 103, content: "Việc 3 dự án khác" });

      const projectLogs = await getDiaryLogsByProject(1);
      expect(projectLogs.length).toBe(2);

      const taskLogs = await getDiaryLogsByTask(101);
      expect(taskLogs.length).toBe(1);
      expect(taskLogs[0].content).toBe("Việc 1");
    });

    it("lọc các bản ghi đang chờ đồng bộ (pending hoặc failed)", async () => {
      const e1 = await createDiaryEntry({
        projectId: 1,
        content: "Chờ đồng bộ 1",
        syncStatus: SYNC_STATUS.PENDING,
      });
      const e2 = await createDiaryEntry({
        projectId: 1,
        content: "Thất bại đồng bộ",
        syncStatus: SYNC_STATUS.FAILED,
      });
      await createDiaryEntry({
        projectId: 1,
        content: "Đã đồng bộ xong",
        syncStatus: SYNC_STATUS.SYNCED,
      });

      const pending = await getPendingSyncEntries();
      expect(pending.length).toBe(2);
      const pendingIds = pending.map((p) => p.clientId);
      expect(pendingIds).toContain(e1.clientId);
      expect(pendingIds).toContain(e2.clientId);
    });

    it("cập nhật trạng thái đồng bộ thành công", async () => {
      const entry = await createDiaryEntry({
        projectId: 1,
        content: "Cần đồng bộ",
      });

      await updateDiaryEntry(entry.clientId, {
        syncStatus: SYNC_STATUS.SYNCED,
        serverId: 9999,
      });

      const updated = await getDiaryEntryById(entry.clientId);
      expect(updated.syncStatus).toBe(SYNC_STATUS.SYNCED);
      expect(updated.serverId).toBe(9999);
      expect(updated.localUpdatedAt).toBeDefined();
    });
  });

  describe("4. Lưu trữ Blob ảnh và Quan hệ Ngoại khóa", () => {
    it("tạo nhật ký kèm danh sách Blob ảnh trong transaction nguyên tử", async () => {
      const imageBlob1 = new Blob(["image-binary-data-1"], { type: "image/jpeg" });
      const imageBlob2 = new Blob(["image-binary-data-2"], { type: "image/png" });

      const result = await createDiaryEntry(
        {
          projectId: 8,
          content: "Nhật ký có 2 ảnh",
        },
        [
          { blob: imageBlob1, fileName: "anh1.jpg", mimeType: "image/jpeg" },
          { blob: imageBlob2, fileName: "anh2.png", mimeType: "image/png" },
        ]
      );

      expect(result.clientId).toBeDefined();
      expect(result.attachments.length).toBe(2);

      // Đọc lại từ object store diaryAttachments
      const attachments = await getDiaryAttachmentsByLog(result.clientId);
      expect(attachments.length).toBe(2);
      const fileNames = attachments.map((a) => a.fileName);
      expect(fileNames).toContain("anh1.jpg");
      expect(fileNames).toContain("anh2.png");
      expect(attachments.every((a) => isBlob(a.blob))).toBe(true);

      // Đọc toàn bộ nhật ký kèm ảnh
      const fullEntry = await getDiaryEntryWithImages(result.clientId);
      expect(fullEntry.attachments.length).toBe(2);
      expect(fullEntry.content).toBe("Nhật ký có 2 ảnh");
    });

    it("lưu thêm ảnh riêng lẻ qua saveDiaryAttachment", async () => {
      const entry = await createDiaryEntry({ projectId: 1, content: "Chưa có ảnh" });

      const imageBlob = new Blob(["single-photo"], { type: "image/jpeg" });
      const attach = await saveDiaryAttachment({
        diaryClientId: entry.clientId,
        blob: imageBlob,
        fileName: "single.jpg",
        mimeType: "image/jpeg",
      });

      expect(attach.id).toBeDefined();
      expect(attach.diaryClientId).toBe(entry.clientId);

      const attachments = await getDiaryAttachmentsByLog(entry.clientId);
      expect(attachments.length).toBe(1);
      expect(attachments[0].id).toBe(attach.id);
    });

    it("lưu nhiều ảnh qua saveDiaryAttachments", async () => {
      const entry = await createDiaryEntry({ projectId: 1, content: "Gốc" });

      const blobA = new Blob(["photo-a"], { type: "image/jpeg" });
      const blobB = new Blob(["photo-b"], { type: "image/webp" });

      const saved = await saveDiaryAttachments(entry.clientId, [
        { blob: blobA, fileName: "a.jpg" },
        { blob: blobB, fileName: "b.webp" },
      ]);

      expect(saved.length).toBe(2);
      const attachments = await getDiaryAttachmentsByLog(entry.clientId);
      expect(attachments.length).toBe(2);
    });

    it("từ chối ảnh không phải Blob hợp lệ", () => {
      expect(() => {
        validateImage({ blob: "not-a-blob" });
      }).toThrow("Ảnh đính kèm phải có dữ liệu Blob hợp lệ.");
    });

    it("từ chối ảnh vượt quá giới hạn 5MB", () => {
      // Giả lập blob lớn hơn 5MB
      const hugeBlob = new Blob([new Uint8Array(5 * 1024 * 1024 + 10)], {
        type: "image/jpeg",
      });
      expect(() => {
        validateImage({ blob: hugeBlob });
      }).toThrow("vượt quá giới hạn 5MB");
    });

    it("từ chối định dạng tệp không phải ảnh", () => {
      const pdfBlob = new Blob(["fake-pdf"], { type: "application/pdf" });
      expect(() => {
        validateImage({ blob: pdfBlob, mimeType: "application/pdf" });
      }).toThrow("không được hỗ trợ");
    });
  });

  describe("5. Tính nguyên tử và Rollback khi Thao tác thất bại", () => {
    it("rollback toàn bộ transaction nếu một ảnh trong danh sách không hợp lệ", async () => {
      const validBlob = new Blob(["ok-image"], { type: "image/jpeg" });
      const invalidImage = { blob: "invalid-blob-not-instance" };

      // Gọi createDiaryEntry với 1 ảnh hợp lệ và 1 ảnh lỗi
      await expect(
        createDiaryEntry(
          {
            clientId: "test-rollback-entry",
            projectId: 1,
            content: "Nhật ký sẽ bị hủy",
          },
          [{ blob: validBlob, fileName: "ok.jpg" }, invalidImage]
        )
      ).rejects.toThrow();

      // Kiểm tra nhật ký KHÔNG được lưu (không để lại bản ghi mồ côi)
      const entry = await getDiaryEntryById("test-rollback-entry");
      expect(entry).toBeNull();

      // Kiểm tra không có ảnh mồ côi nào được lưu
      const attachments = await getDiaryAttachmentsByLog("test-rollback-entry");
      expect(attachments.length).toBe(0);
    });
  });

  describe("6. Xóa Nhật ký và Xóa sạch Ảnh liên quan (Cascade Delete)", () => {
    it("xóa nhật ký sẽ tự động xóa sạch các ảnh đính kèm liên quan", async () => {
      const blob = new Blob(["test-image"], { type: "image/jpeg" });
      const entry = await createDiaryEntry(
        { projectId: 3, content: "Nhật ký sắp xóa" },
        [{ blob, fileName: "del.jpg" }]
      );

      // Xác nhận dữ liệu đã được lưu
      expect((await getDiaryAttachmentsByLog(entry.clientId)).length).toBe(1);

      // Thực hiện xóa
      const deleted = await deleteDiaryEntry(entry.clientId);
      expect(deleted).toBe(true);

      // Xác nhận bản ghi nhật ký đã biến mất
      const checkEntry = await getDiaryEntryById(entry.clientId);
      expect(checkEntry).toBeNull();

      // Xác nhận các ảnh liên quan cũng đã bị xóa sạch (không có ảnh mồ côi)
      const checkAttach = await getDiaryAttachmentsByLog(entry.clientId);
      expect(checkAttach.length).toBe(0);
    });
  });

  describe("7. Độ bền dữ liệu khi Đóng và Mở lại Database", () => {
    it("dữ liệu nhật ký và ảnh vẫn đọc được sau khi đóng và mở lại kết nối", async () => {
      const blob = new Blob(["persist-data"], { type: "image/jpeg" });
      const entry = await createDiaryEntry(
        { projectId: 99, content: "Dữ liệu bền vững" },
        [{ blob, fileName: "persist.jpg" }]
      );

      // Đóng kết nối
      await closeDiaryDB();

      // Mở lại kết nối và đọc lại
      const reopenedEntry = await getDiaryEntryWithImages(entry.clientId);
      expect(reopenedEntry).not.toBeNull();
      expect(reopenedEntry.content).toBe("Dữ liệu bền vững");
      expect(reopenedEntry.attachments.length).toBe(1);
      expect(reopenedEntry.attachments[0].fileName).toBe("persist.jpg");
    });
  });

  describe("8. Tương thích ngược với saveDiaryLog", () => {
    it("saveDiaryLog hoạt động tương thích với code hiện tại", async () => {
      const legacyLog = await saveDiaryLog({
        projectId: 7,
        content: "Gọi qua saveDiaryLog",
        work_item_id: 15,
      });

      expect(legacyLog.id).toBeDefined();
      expect(legacyLog.projectId).toBe(7);
      expect(legacyLog.workItemId).toBe(15);

      const found = await getDiaryEntryById(legacyLog.id);
      expect(found).not.toBeNull();
      expect(found.content).toBe("Gọi qua saveDiaryLog");
    });
  });
});
