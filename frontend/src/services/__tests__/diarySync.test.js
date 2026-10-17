import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "../../lib/api";
import {
  clearDiaryDB,
  closeDiaryDB,
  createDiaryEntry,
  getDiaryAttachmentsByLog,
  getDiaryEntryById,
} from "../../lib/diaryDb";
import { startDiarySync, syncPendingDiaryEntries } from "../diarySync";

vi.mock("../../lib/api");

describe("diary offline synchronization", () => {
  const originalOnLine = navigator.onLine;
  let stopSync;

  beforeEach(async () => {
    vi.resetAllMocks();
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
      writable: true,
    });
    await clearDiaryDB();
  });

  afterEach(async () => {
    stopSync?.();
    stopSync = null;
    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
    await closeDiaryDB();
  });

  it("syncs pending records on startup and after the browser online event", async () => {
    await createDiaryEntry({
      id: "startup-diary",
      client_id: "startup-diary",
      projectId: 13,
      work_item_id: 101,
      content: "Startup",
    });
    api.post.mockResolvedValue({ data: { id: 501 } });

    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    stopSync = startDiarySync();
    expect(api.post).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    window.dispatchEvent(new Event("online"));

    await vi.waitFor(async () => {
      expect((await getDiaryEntryById("startup-diary")).syncStatus).toBe("synced");
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("starts synchronization on app startup while online", async () => {
    await createDiaryEntry({
      id: "reload-diary",
      client_id: "reload-diary",
      projectId: 13,
      work_item_id: 102,
      content: "Reload",
    });
    api.post.mockResolvedValue({ data: { id: 502 } });

    stopSync = startDiarySync();
    await vi.waitFor(async () => {
      expect((await getDiaryEntryById("reload-diary")).syncStatus).toBe("synced");
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("shares concurrent sync calls so a diary entry is not posted twice", async () => {
    await createDiaryEntry({
      id: "single-diary",
      client_id: "single-diary",
      projectId: 13,
      work_item_id: 103,
      content: "Concurrent",
    });
    let resolveRequest;
    api.post.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const first = syncPendingDiaryEntries();
    const second = syncPendingDiaryEntries();
    await vi.waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    resolveRequest({ data: { id: 503 } });
    await Promise.all([first, second]);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect((await getDiaryEntryById("single-diary")).serverId).toBe(503);
  });

  it("keeps the server ID and Blob after an image failure, then retries only the image", async () => {
    const clientId = "diary-with-image";
    const blob = new Blob(["photo-data"], { type: "image/jpeg" });
    await createDiaryEntry(
      {
        id: clientId,
        client_id: clientId,
        projectId: 13,
        work_item_id: 104,
        content: "Photo",
      },
      [{ id: "image-1", blob, fileName: "photo.jpg" }],
    );

    let attachmentRequests = 0;
    api.post.mockImplementation((url) => {
      if (url.includes("/attachments")) {
        attachmentRequests += 1;
        if (attachmentRequests <= 2) {
          return Promise.reject(new Error("Network Error"));
        }
        return Promise.resolve({
          data: { id: 901, url: "/api/diary-attachment/901" },
        });
      }
      return Promise.resolve({ data: { id: 601 } });
    });

    await syncPendingDiaryEntries();
    // T-72: lỗi mạng khi upload ảnh → entry về pending (không phải failed),
    // giữ serverId để vòng sau chỉ retry ảnh, không POST log lại.
    const failedEntry = await getDiaryEntryById(clientId);
    let [failedAttachment] = await getDiaryAttachmentsByLog(clientId);
    expect(failedEntry.syncStatus).toBe("pending");
    expect(failedEntry.serverId).toBe(601);
    expect(failedAttachment.syncStatus).toBe("pending");
    expect(failedAttachment.blob).toBeInstanceOf(Blob);

    await syncPendingDiaryEntries();
    const syncedEntry = await getDiaryEntryById(clientId);
    const [syncedAttachment] = await getDiaryAttachmentsByLog(clientId);
    expect(syncedEntry.syncStatus).toBe("synced");
    expect(syncedAttachment.syncStatus).toBe("synced");
    expect(syncedAttachment.blob).toBeInstanceOf(Blob);
    expect(api.post.mock.calls.filter(([url]) => url.endsWith("/diary-entries"))).toHaveLength(1);
    expect(attachmentRequests).toBe(3);
  });

  it("sends task-log photos as multipart and marks them synced only after confirmation", async () => {
    const clientId = "task-log-client";
    const blob = new Blob(["task-photo"], { type: "image/png" });
    await createDiaryEntry(
      {
        id: clientId,
        client_id: clientId,
        projectId: 13,
        taskId: 5,
        entryType: "taskLog",
        content: "Task photo",
      },
      [{ id: "task-image-1", blob, fileName: "task.png" }],
    );
    api.post.mockResolvedValue({
      data: {
        log: {
          id: 701,
          attachments: [{ id: 702, url: "/api/task-attachment/702" }],
        },
      },
    });

    await syncPendingDiaryEntries();

    const [url, formData] = api.post.mock.calls[0];
    expect(url).toBe("/projects/13/tasks/5/logs");
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("client_id")).toBe(clientId);
    expect(formData.getAll("images")).toHaveLength(1);
    expect((await getDiaryEntryById(clientId)).syncStatus).toBe("synced");
    const [attachment] = await getDiaryAttachmentsByLog(clientId);
    expect(attachment.syncStatus).toBe("synced");
    expect(attachment.blob).toBeInstanceOf(Blob);
  });

  it("keeps a task-log and its Blob after a network error without a response, then retries", async () => {
    const clientId = "task-log-network-error";
    const blob = new Blob(["task-photo"], { type: "image/png" });
    await createDiaryEntry(
      {
        id: clientId,
        client_id: clientId,
        projectId: 13,
        taskId: 6,
        entryType: "taskLog",
        content: "Retry task photo",
      },
      [{ id: "task-image-network-error", blob, fileName: "task.png" }],
    );
    api.post
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockRejectedValueOnce(new Error("Network Error"))
      .mockResolvedValueOnce({
        data: {
          log: {
            id: 801,
            attachments: [{ id: 802, url: "/api/task-attachment/802" }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          log: {
            id: 801,
            attachments: [{ id: 802, url: "/api/task-attachment/802" }],
          },
        },
      });

    await syncPendingDiaryEntries();

    // T-72: lỗi mạng không response → pending (giữ log + Blob để retry),
    // không phải failed.
    const failedEntry = await getDiaryEntryById(clientId);
    const [failedAttachment] = await getDiaryAttachmentsByLog(clientId);
    expect(failedEntry.syncStatus).toBe("pending");
    expect(failedEntry.syncError).toBe("Network Error");
    expect(failedEntry.serverId).toBeNull();
    expect(failedAttachment.syncStatus).toBe("pending");
    expect(failedAttachment.blob).toBeInstanceOf(Blob);

    await syncPendingDiaryEntries();

    const syncedEntry = await getDiaryEntryById(clientId);
    const [syncedAttachment] = await getDiaryAttachmentsByLog(clientId);
    expect(syncedEntry.syncStatus).toBe("synced");
    expect(syncedEntry.serverId).toBe(801);
    expect(syncedAttachment.syncStatus).toBe("synced");
    expect(syncedAttachment.blob).toBeInstanceOf(Blob);
    expect(api.post).toHaveBeenCalledTimes(3);
    for (const [, formData] of api.post.mock.calls) {
      expect(formData.get("client_id")).toBe(clientId);
      expect(formData.getAll("images")).toHaveLength(1);
    }
  });

  it("handles an undefined task-log response without losing the entry or image", async () => {
    const clientId = "task-log-empty-response";
    const blob = new Blob(["task-photo"], { type: "image/png" });
    await createDiaryEntry(
      {
        id: clientId,
        client_id: clientId,
        projectId: 13,
        taskId: 7,
        entryType: "taskLog",
        content: "Empty response",
      },
      [{ id: "task-image-empty-response", blob, fileName: "task.png" }],
    );
    api.post
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        data: {
          log: {
            id: 803,
            attachments: [{ id: 804, url: "/api/task-attachment/804" }],
          },
        },
      });

    await syncPendingDiaryEntries();

    // T-72: server không xác nhận (không response dùng được) → pending để retry,
    // Blob giữ nguyên, không mất mục.
    const failedEntry = await getDiaryEntryById(clientId);
    const [failedAttachment] = await getDiaryAttachmentsByLog(clientId);
    expect(failedEntry.syncStatus).toBe("pending");
    expect(failedEntry.syncError).toBe(
      "Máy chủ không xác nhận đã lưu nhật ký công việc.",
    );
    expect(failedAttachment.blob).toBeInstanceOf(Blob);

    await syncPendingDiaryEntries();

    expect((await getDiaryEntryById(clientId)).syncStatus).toBe("synced");
    expect((await getDiaryAttachmentsByLog(clientId))[0].blob).toBeInstanceOf(
      Blob,
    );
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("keeps the confirmed task-log ID when the server response omits an image", async () => {
    const clientId = "task-log-missing-image";
    const blob = new Blob(["task-photo"], { type: "image/png" });
    await createDiaryEntry(
      {
        id: clientId,
        client_id: clientId,
        projectId: 13,
        taskId: 8,
        entryType: "taskLog",
        content: "Missing image response",
      },
      [{ id: "task-image-missing-response", blob, fileName: "task.png" }],
    );
    api.post.mockResolvedValue({
      data: { log: { id: 805, attachments: [] } },
    });

    await syncPendingDiaryEntries();

    // T-72: server trả thiếu ảnh (response không đầy đủ) → pending để retry
    // ảnh còn thiếu, nhưng giữ serverId đã xác nhận.
    const failedEntry = await getDiaryEntryById(clientId);
    const [failedAttachment] = await getDiaryAttachmentsByLog(clientId);
    expect(failedEntry.syncStatus).toBe("pending");
    expect(failedEntry.serverId).toBe(805);
    expect(failedAttachment.syncStatus).toBe("pending");
    expect(failedAttachment.blob).toBeInstanceOf(Blob);
  });

  it("does not send a malformed work_item_id to the server", async () => {
    await createDiaryEntry({
      id: "invalid-work-item",
      client_id: "invalid-work-item",
      projectId: 13,
      work_item_id: "task-5",
      content: "Invalid ID",
    });

    await syncPendingDiaryEntries();

    expect(api.post).not.toHaveBeenCalled();
    expect((await getDiaryEntryById("invalid-work-item")).syncStatus).toBe("failed");
  });

  it("registers background sync when supported and still syncs", async () => {
    await createDiaryEntry({
      id: "bgsync-diary",
      client_id: "bgsync-diary",
      projectId: 13,
      work_item_id: 105,
      content: "BGSync",
    });
    api.post.mockResolvedValue({ data: { id: 504 } });
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve({ sync: { register } }) },
      configurable: true,
    });

    stopSync = startDiarySync();
    await vi.waitFor(async () => {
      expect((await getDiaryEntryById("bgsync-diary")).syncStatus).toBe("synced");
    });
    await vi.waitFor(() => expect(register).toHaveBeenCalledWith("diary-sync"));

    delete navigator.serviceWorker;
  });

  it("syncs normally when background sync is unsupported or rejected", async () => {
    await createDiaryEntry({
      id: "no-bgsync-diary",
      client_id: "no-bgsync-diary",
      projectId: 13,
      work_item_id: 106,
      content: "NoBGSync",
    });
    api.post.mockResolvedValue({ data: { id: 505 } });
    // Không có serviceWorker trong navigator (jsdom mặc định) + register reject
    // cũng không được làm hỏng vòng sync chính — đây là fallback bắt buộc.
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          sync: { register: vi.fn().mockRejectedValue(new Error("QuotaExceeded")) },
        }),
      },
      configurable: true,
    });

    stopSync = startDiarySync();
    await vi.waitFor(async () => {
      expect((await getDiaryEntryById("no-bgsync-diary")).syncStatus).toBe("synced");
    });

    delete navigator.serviceWorker;
  });

  it("triggers a sync when the tab becomes visible again", async () => {
    await createDiaryEntry({
      id: "visibility-diary",
      client_id: "visibility-diary",
      projectId: 13,
      work_item_id: 107,
      content: "Visibility",
    });
    api.post.mockResolvedValue({ data: { id: 506 } });

    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    stopSync = startDiarySync();
    expect(api.post).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(async () => {
      expect((await getDiaryEntryById("visibility-diary")).syncStatus).toBe("synced");
    });
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
