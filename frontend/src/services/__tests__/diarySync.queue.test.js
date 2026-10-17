import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "../../lib/api";
import {
  clearDiaryDB,
  closeDiaryDB,
  createDiaryEntry,
  getDiaryEntryById,
  getPendingSyncEntries,
  updateDiaryEntry,
  SYNC_STATUS,
} from "../../lib/diaryDb";
import { getQueueRetryDelay, syncPendingDiaryEntries } from "../diarySync";

vi.mock("../../lib/api");

describe("diary sync queue ordering and backoff (T-69)", () => {
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
    await closeDiaryDB();
  });

  it("sends queued entries in creation order, not insertion order", async () => {
    // Tạo 3 mục nhưng nhập vào DB theo thứ tự đảo (mới nhất trước),
    // createdAt đã cố định sẵn nên hàng đợi phải gửi theo createdAt tăng dần.
    const entries = [
      { id: "queue-newest", createdAt: "2026-10-03T08:00:00.000Z" },
      { id: "queue-oldest", createdAt: "2026-10-01T08:00:00.000Z" },
      { id: "queue-middle", createdAt: "2026-10-02T08:00:00.000Z" },
    ];
    for (const { id, createdAt } of entries) {
      await createDiaryEntry({
        id,
        client_id: id,
        projectId: 13,
        work_item_id: 101,
        content: `Entry ${id}`,
        createdAt,
      });
    }
    const postedClientIds = [];
    api.post.mockImplementation((url, body) => {
      postedClientIds.push(body?.client_id);
      return Promise.resolve({ data: { id: postedClientIds.length } });
    });

    await syncPendingDiaryEntries();

    expect(postedClientIds).toEqual([
      "queue-oldest",
      "queue-middle",
      "queue-newest",
    ]);
  });

  it("computes queue retry delays with exponential backoff capped at 60s", () => {
    expect([
      getQueueRetryDelay(0),
      getQueueRetryDelay(1),
      getQueueRetryDelay(2),
      getQueueRetryDelay(3),
      getQueueRetryDelay(4),
      getQueueRetryDelay(5),
      getQueueRetryDelay(6),
      getQueueRetryDelay(7),
    ]).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
    expect(getQueueRetryDelay(-1)).toBe(2000);
    expect(getQueueRetryDelay(Number.NaN)).toBe(2000);
  });

  it("reclaims a stale syncing claim but leaves a fresh claim alone", async () => {
    await createDiaryEntry({
      id: "stale-claim",
      client_id: "stale-claim",
      projectId: 13,
      work_item_id: 101,
      content: "Stale",
    });
    await createDiaryEntry({
      id: "fresh-claim",
      client_id: "fresh-claim",
      projectId: 13,
      work_item_id: 101,
      content: "Fresh",
    });
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const tenSecondsAgo = new Date(Date.now() - 10 * 1000).toISOString();
    await updateDiaryEntry("stale-claim", {
      syncStatus: SYNC_STATUS.SYNCING,
      syncStartedAt: threeMinutesAgo,
    });
    await updateDiaryEntry("fresh-claim", {
      syncStatus: SYNC_STATUS.SYNCING,
      syncStartedAt: tenSecondsAgo,
    });

    const pending = await getPendingSyncEntries();
    const ids = pending.map((entry) => entry.id);
    expect(ids).toContain("stale-claim");
    expect(ids).not.toContain("fresh-claim");
  });

  it("serializes concurrent sync calls so an entry is posted once", async () => {
    await createDiaryEntry({
      id: "queue-concurrent",
      client_id: "queue-concurrent",
      projectId: 13,
      work_item_id: 101,
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
    resolveRequest({ data: { id: 701 } });
    await Promise.all([first, second]);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect((await getDiaryEntryById("queue-concurrent")).serverId).toBe(701);
  });
});
