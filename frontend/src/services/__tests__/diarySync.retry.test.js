import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "../../lib/api";
import {
  clearDiaryDB,
  closeDiaryDB,
  createDiaryEntry,
  getDiaryEntryById,
} from "../../lib/diaryDb";
import { syncPendingDiaryEntries } from "../diarySync";

vi.mock("../../lib/api");

// T-72 (S-30): giữ client_uuid khi retry, timeout/mất mạng → pending,
// chỉ failed khi server thực sự từ chối dữ liệu (400/404/422).
describe("diary sync retry classification (T-72)", () => {
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

  it("marks a timeout without response as pending and retries with the same client_id", async () => {
    const clientId = "retry-timeout-entry";
    await createDiaryEntry({
      id: clientId,
      client_id: clientId,
      projectId: 13,
      work_item_id: 101,
      content: "Timeout retry",
    });
    const timeoutError = new Error("timeout of 15000ms exceeded");
    timeoutError.code = "ECONNABORTED";
    api.post
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(timeoutError) // withRetry lần 2 trong cùng vòng
      .mockResolvedValueOnce({ data: { id: 801 } });

    await syncPendingDiaryEntries();

    const pending = await getDiaryEntryById(clientId);
    expect(pending.syncStatus).toBe("pending");
    expect(pending.syncError).toContain("timeout");

    await syncPendingDiaryEntries();

    const synced = await getDiaryEntryById(clientId);
    expect(synced.syncStatus).toBe("synced");
    expect(synced.serverId).toBe(801);
    const sentClientIds = api.post.mock.calls.map(([, body]) => body?.client_id);
    expect(sentClientIds.length).toBeGreaterThanOrEqual(2);
    for (const sent of sentClientIds) {
      expect(sent).toBe(clientId);
    }
  });

  it("marks a 400 rejection as failed with a displayable reason", async () => {
    const clientId = "retry-rejected-entry";
    await createDiaryEntry({
      id: clientId,
      client_id: clientId,
      projectId: 13,
      work_item_id: 101,
      content: "Rejected",
    });
    api.post.mockRejectedValue({
      response: { status: 400, data: { message: "content không hợp lệ" } },
    });

    await syncPendingDiaryEntries();

    const failed = await getDiaryEntryById(clientId);
    expect(failed.syncStatus).toBe("failed");
    expect(failed.syncError).toBe("content không hợp lệ");

    // Vòng quét sau không crash, mục vẫn failed (không tự mất khỏi hàng đợi).
    await syncPendingDiaryEntries();
    expect((await getDiaryEntryById(clientId)).syncStatus).toBe("failed");
  });

  it("converges when the server already saved but the client lost the response", async () => {
    const clientId = "retry-lost-response";
    await createDiaryEntry({
      id: clientId,
      client_id: clientId,
      projectId: 13,
      work_item_id: 101,
      content: "Lost response",
    });
    const networkError = new Error("Network Error");
    api.post
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError) // withRetry lần 2 trong cùng vòng
      // Lần 2: server nhận ra client_id đã có (fix T-70), trả 200 bản đã ghi.
      .mockResolvedValueOnce({ data: { id: 902, client_id: clientId } });

    await syncPendingDiaryEntries();
    expect((await getDiaryEntryById(clientId)).syncStatus).toBe("pending");

    await syncPendingDiaryEntries();

    const synced = await getDiaryEntryById(clientId);
    expect(synced.syncStatus).toBe("synced");
    expect(synced.serverId).toBe(902);
    const sentClientIds = api.post.mock.calls.map(([, body]) => body?.client_id);
    expect(new Set(sentClientIds)).toEqual(new Set([clientId]));
  });
});
