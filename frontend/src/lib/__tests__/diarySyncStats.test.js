
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SYNC_STATUS,
  clearDiaryDB,
  closeDiaryDB,
  createDiaryEntry,
  getDiarySyncStats,
  updateDiaryEntry,
  updateDiaryAttachment,
} from "../diaryDb";

describe("T-74 — Thống kê hàng đợi đồng bộ nhật ký", () => {
  beforeEach(async () => {
    await clearDiaryDB();
  });

  afterEach(async () => {
    await closeDiaryDB();
  });

  it("đếm nhật ký pending, syncing và failed nhưng bỏ qua synced", async () => {
    await createDiaryEntry({
      id: "stats-pending",
      projectId: 1,
      content: "Pending",
    });

    await createDiaryEntry({
      id: "stats-syncing",
      projectId: 1,
      content: "Syncing",
    });

    await createDiaryEntry({
      id: "stats-failed",
      projectId: 1,
      content: "Failed",
    });

    await createDiaryEntry({
      id: "stats-synced",
      projectId: 1,
      content: "Synced",
    });

    await updateDiaryEntry("stats-syncing", {
      syncStatus: SYNC_STATUS.SYNCING,
    });

    await updateDiaryEntry("stats-failed", {
      syncStatus: SYNC_STATUS.FAILED,
    });

    await updateDiaryEntry("stats-synced", {
      syncStatus: SYNC_STATUS.SYNCED,
    });

    const stats = await getDiarySyncStats();

    expect(stats.pendingEntries).toBe(3);
    expect(stats.pendingImages).toBe(0);
    expect(stats.totalPending).toBe(3);
  });

  it("chỉ đếm ảnh chưa đồng bộ thuộc nhật ký chưa đồng bộ", async () => {
    await createDiaryEntry(
      {
        id: "stats-parent-pending",
        projectId: 1,
        content: "Nhật ký đang chờ",
      },
      [
        {
          id: "stats-image-pending",
          blob: new Blob(["pending"], { type: "image/jpeg" }),
          fileName: "pending.jpg",
        },
        {
          id: "stats-image-synced",
          blob: new Blob(["synced"], { type: "image/jpeg" }),
          fileName: "synced.jpg",
        },
      ],
    );

    await updateDiaryAttachment("stats-image-synced", {
      syncStatus: SYNC_STATUS.SYNCED,
    });

    await createDiaryEntry(
      {
        id: "stats-parent-synced",
        projectId: 1,
        content: "Nhật ký đã đồng bộ",
      },
      [
        {
          id: "stats-image-parent-synced",
          blob: new Blob(["parent-synced"], { type: "image/jpeg" }),
          fileName: "parent-synced.jpg",
        },
      ],
    );

    await updateDiaryEntry("stats-parent-synced", {
      syncStatus: SYNC_STATUS.SYNCED,
    });

    const stats = await getDiarySyncStats();

    expect(stats.pendingEntries).toBe(1);
    expect(stats.pendingImages).toBe(1);
    expect(stats.totalPending).toBe(2);
  });

  it("trả về các bộ đếm bằng 0 khi hàng đợi trống", async () => {
    await clearDiaryDB();

    await expect(getDiarySyncStats()).resolves.toEqual({
      pendingEntries: 0,
      pendingImages: 0,
      totalPending: 0,
    });
  });
});
