import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDiaryDB,
  closeDiaryDB,
  createDiaryEntry,
  getDiaryEntryById,
  getDiaryEntryByServerId,
  SYNC_STATUS,
  updateDiaryEntryByServerId,
} from "../diaryDb";

describe("S-32 diary IndexedDB conflict helpers", () => {
  beforeEach(async () => {
    await clearDiaryDB();
  });

  afterEach(async () => {
    await closeDiaryDB();
  });

  it("treats a server-backed record without an explicit edit as attachment-only", async () => {
    await createDiaryEntry({
      id: "local-attachment-only",
      client_id: "local-attachment-only",
      serverId: 501,
      projectId: 1,
      work_item_id: 10,
      content: "Already created on server",
      syncStatus: SYNC_STATUS.PENDING,
    });

    const entry = await getDiaryEntryById("local-attachment-only");
    expect(entry.pendingOperation).toBeNull();
  });

  it("finds and updates the local record by server id after conflict resolution", async () => {
    await createDiaryEntry({
      id: "local-conflict-key",
      client_id: "local-conflict-key",
      serverId: 777,
      projectId: 1,
      work_item_id: 10,
      content: "Local conflict content",
      version: 1,
      serverVersion: 2,
      pendingOperation: "update",
      conflictId: 44,
      syncStatus: SYNC_STATUS.CONFLICT,
    });

    expect((await getDiaryEntryByServerId(777))?.id).toBe("local-conflict-key");

    const updated = await updateDiaryEntryByServerId(777, {
      version: 3,
      serverVersion: 3,
      pendingOperation: null,
      conflictId: null,
      syncStatus: SYNC_STATUS.SYNCED,
      syncError: null,
    });
    expect(updated).toBe(true);

    const entry = await getDiaryEntryById("local-conflict-key");
    expect(entry.version).toBe(3);
    expect(entry.serverVersion).toBe(3);
    expect(entry.syncStatus).toBe(SYNC_STATUS.SYNCED);
    expect(entry.conflictId).toBeNull();
  });
});
