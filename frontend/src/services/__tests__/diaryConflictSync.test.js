import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "../../lib/api";
import {
  clearDiaryDB,
  closeDiaryDB,
  createDiaryEntry,
  getDiaryEntryById,
  updateDiaryEntry,
  SYNC_STATUS,
} from "../../lib/diaryDb";
import { syncPendingDiaryEntries } from "../diarySync";

vi.mock("../../lib/api");

describe("S-32 diary conflict sync tests (T-76, T-77)", () => {
  const originalOnLine = navigator.onLine;

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
    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine,
      configurable: true,
      writable: true,
    });
    await closeDiaryDB();
  });

  it("1. Sync update sends version and expected fields to PUT endpoint", async () => {
    await createDiaryEntry({
      id: "entry-update-1",
      client_id: "entry-update-1",
      serverId: 101,
      projectId: 1,
      work_item_id: 10,
      content: "Updated client content",
      version: 1,
      serverVersion: 1,
      pendingOperation: "update",
      syncStatus: SYNC_STATUS.PENDING,
    });

    api.put.mockResolvedValueOnce({
      data: {
        id: 101,
        version: 2,
        content: "Updated client content",
      },
    });

    await syncPendingDiaryEntries();

    expect(api.put).toHaveBeenCalledWith(
      "/projects/1/diary-entries/101",
      expect.objectContaining({
        content: "Updated client content",
        version: 1,
        source: "offline_sync",
      })
    );
  });

  it("2. Update success saves the new version from the server into IndexedDB", async () => {
    await createDiaryEntry({
      id: "entry-update-2",
      client_id: "entry-update-2",
      serverId: 102,
      projectId: 1,
      work_item_id: 10,
      content: "Fresh update",
      version: 1,
      serverVersion: 1,
      pendingOperation: "update",
      syncStatus: SYNC_STATUS.PENDING,
    });

    api.put.mockResolvedValueOnce({
      data: {
        id: 102,
        version: 2,
        content: "Fresh update",
      },
    });

    await syncPendingDiaryEntries();

    const record = await getDiaryEntryById("entry-update-2");
    expect(record.syncStatus).toBe(SYNC_STATUS.SYNCED);
    expect(record.version).toBe(2);
    expect(record.serverVersion).toBe(2);
    expect(record.pendingOperation).toBeNull();
  });

  it("3. API 409 DIARY_VERSION_CONFLICT transitions entry to conflict status and preserves local content", async () => {
    await createDiaryEntry({
      id: "entry-conflict-1",
      client_id: "entry-conflict-1",
      serverId: 103,
      projectId: 1,
      work_item_id: 10,
      content: "Conflicted local content",
      version: 1,
      serverVersion: 1,
      pendingOperation: "update",
      syncStatus: SYNC_STATUS.PENDING,
    });

    const conflictError = {
      response: {
        status: 409,
        data: {
          code: "DIARY_VERSION_CONFLICT",
          message: "Phát hiện xung đột phiên bản nhật ký",
          conflictId: 999,
          serverVersion: 2,
        },
      },
    };
    api.put.mockRejectedValueOnce(conflictError);

    await syncPendingDiaryEntries();

    const record = await getDiaryEntryById("entry-conflict-1");
    expect(record.syncStatus).toBe(SYNC_STATUS.CONFLICT);
    expect(record.content).toBe("Conflicted local content");
    expect(record.conflictId).toBe(999);
    expect(record.serverVersion).toBe(2);
    expect(record.syncError).toContain("xung đột");
  });

  it("4. Entries in conflict status are not automatically retried in subsequent sync loops", async () => {
    await createDiaryEntry({
      id: "entry-conflict-2",
      client_id: "entry-conflict-2",
      serverId: 104,
      projectId: 1,
      work_item_id: 10,
      content: "Do not retry me automatically",
      version: 1,
      serverVersion: 2,
      conflictId: 888,
      pendingOperation: "update",
      syncStatus: SYNC_STATUS.CONFLICT,
    });

    await syncPendingDiaryEntries();

    expect(api.put).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("5. A conflicted entry does not block other pending entries in the queue", async () => {
    await createDiaryEntry({
      id: "entry-conflicted-first",
      client_id: "entry-conflicted-first",
      serverId: 105,
      projectId: 1,
      work_item_id: 10,
      content: "I will hit 409",
      version: 1,
      pendingOperation: "update",
      syncStatus: SYNC_STATUS.PENDING,
      updated_at: new Date(Date.now() - 1000).toISOString(),
    });

    await createDiaryEntry({
      id: "entry-normal-second",
      client_id: "entry-normal-second",
      projectId: 1,
      work_item_id: 10,
      content: "I should succeed",
      pendingOperation: "create",
      syncStatus: SYNC_STATUS.PENDING,
      updated_at: new Date().toISOString(),
    });

    api.put.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: "DIARY_VERSION_CONFLICT",
          conflictId: 777,
          serverVersion: 2,
        },
      },
    });

    api.post.mockResolvedValueOnce({
      data: {
        id: 205,
        version: 1,
      },
    });

    await syncPendingDiaryEntries();

    const recordA = await getDiaryEntryById("entry-conflicted-first");
    const recordB = await getDiaryEntryById("entry-normal-second");

    expect(recordA.syncStatus).toBe(SYNC_STATUS.CONFLICT);
    expect(recordB.syncStatus).toBe(SYNC_STATUS.SYNCED);
    expect(recordB.serverId).toBe(205);
  });
});
