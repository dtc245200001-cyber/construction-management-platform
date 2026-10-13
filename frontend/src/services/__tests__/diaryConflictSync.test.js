import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "../../lib/api";
import {
  clearDiaryDB,
  closeDiaryDB,
  createDiaryEntry,
  getDiaryEntryById,
  SYNC_STATUS,
} from "../../lib/diaryDb";
import { syncPendingDiaryEntries } from "../diarySync";

vi.mock("../../lib/api");

describe("S-32 offline diary conflict synchronization", () => {
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

  it("sends the base version for an offline update and stores the returned version", async () => {
    await createDiaryEntry({
      id: "s32-update",
      client_id: "s32-update",
      serverId: 101,
      projectId: 1,
      work_item_id: 10,
      content: "Client update",
      version: 1,
      serverVersion: 1,
      pendingOperation: "update",
      syncStatus: SYNC_STATUS.PENDING,
    });

    api.put.mockResolvedValueOnce({
      data: { id: 101, content: "Client update", version: 2 },
    });

    await syncPendingDiaryEntries();

    expect(api.put).toHaveBeenCalledWith(
      "/projects/1/diary-entries/101",
      expect.objectContaining({
        content: "Client update",
        version: 1,
        source: "offline_sync",
      }),
    );

    const entry = await getDiaryEntryById("s32-update");
    expect(entry.syncStatus).toBe(SYNC_STATUS.SYNCED);
    expect(entry.version).toBe(2);
    expect(entry.serverVersion).toBe(2);
    expect(entry.pendingOperation).toBeNull();
  });

  it("preserves local content and stops automatic retry after DIARY_VERSION_CONFLICT", async () => {
    await createDiaryEntry({
      id: "s32-conflict",
      client_id: "s32-conflict",
      serverId: 102,
      projectId: 1,
      work_item_id: 10,
      content: "Unsynced client content",
      version: 1,
      serverVersion: 1,
      pendingOperation: "update",
      syncStatus: SYNC_STATUS.PENDING,
    });

    api.put.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: "DIARY_VERSION_CONFLICT",
          message: "Version conflict",
          conflict_id: 900,
          server_version: 2,
        },
      },
    });

    await syncPendingDiaryEntries();

    const conflicted = await getDiaryEntryById("s32-conflict");
    expect(conflicted.content).toBe("Unsynced client content");
    expect(conflicted.syncStatus).toBe(SYNC_STATUS.CONFLICT);
    expect(conflicted.conflictId).toBe(900);
    expect(conflicted.serverVersion).toBe(2);

    api.put.mockClear();
    await syncPendingDiaryEntries();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("continues syncing other entries after one entry becomes conflicted", async () => {
    await createDiaryEntry({
      id: "s32-conflict-first",
      client_id: "s32-conflict-first",
      serverId: 103,
      projectId: 1,
      work_item_id: 10,
      content: "First entry",
      version: 1,
      pendingOperation: "update",
      syncStatus: SYNC_STATUS.PENDING,
      createdAt: "2026-10-13T01:00:00.000Z",
    });
    await createDiaryEntry({
      id: "s32-create-second",
      client_id: "s32-create-second",
      projectId: 1,
      work_item_id: 10,
      content: "Second entry",
      syncStatus: SYNC_STATUS.PENDING,
      createdAt: "2026-10-13T01:01:00.000Z",
    });

    api.put.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: "DIARY_VERSION_CONFLICT",
          conflict_id: 901,
          server_version: 2,
        },
      },
    });
    api.post.mockResolvedValueOnce({ data: { id: 201, version: 1 } });

    await syncPendingDiaryEntries();

    expect((await getDiaryEntryById("s32-conflict-first")).syncStatus).toBe(SYNC_STATUS.CONFLICT);
    const second = await getDiaryEntryById("s32-create-second");
    expect(second.syncStatus).toBe(SYNC_STATUS.SYNCED);
    expect(second.serverId).toBe(201);
  });

  it("does not PUT diary content when only attachments remain after an online create", async () => {
    const blob = new Blob(["image-data"], { type: "image/png" });
    await createDiaryEntry(
      {
        id: "s32-attachment-only",
        client_id: "s32-attachment-only",
        serverId: 301,
        server_id: 301,
        projectId: 1,
        work_item_id: 10,
        content: "Already on server",
        version: 1,
        serverVersion: 1,
        syncStatus: SYNC_STATUS.PENDING,
      },
      [{ id: "s32-image", blob, fileName: "proof.png", syncStatus: SYNC_STATUS.PENDING }],
    );

    api.post.mockResolvedValueOnce({
      data: { id: 777, url: "/api/projects/1/diary-entries/301/attachments/777" },
    });

    await syncPendingDiaryEntries();

    expect(api.put).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe("/projects/1/diary-entries/301/attachments");
    expect((await getDiaryEntryById("s32-attachment-only")).syncStatus).toBe(SYNC_STATUS.SYNCED);
  });
});
