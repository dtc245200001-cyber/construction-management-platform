import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../utils/fileChecksum", () => ({
  calculateSHA256: vi.fn().mockResolvedValue("mocked_sha256_hash_64chars_0123456789abcdef0123456789abcdef01234567"),
  formatBytes: vi.fn((bytes) => `${bytes} B`),
}));

import api from "../../lib/api";
import { uploadQueueManager, MAX_QUEUE_ITEMS, CONCURRENCY_LIMIT } from "../uploadQueue";

function createMockFile(name, size, type = "image/jpeg") {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
}

describe("UploadQueueManager (T-80, T-81, T-82)", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await uploadQueueManager.clearAll();
    globalThis.URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  test("T-80 AC: Xếp hàng tối đa 30 ảnh mà không chặn tạo nhật ký mới", async () => {
    const files = Array.from({ length: 35 }, (_, i) =>
      createMockFile(`photo_${i + 1}.jpg`, 1000)
    );

    // Mock API init session để không thực sự chạy network
    api.post.mockImplementation(() => new Promise(() => {}));

    const result = await uploadQueueManager.enqueueImages({
      projectId: 1,
      taskId: 10,
      logId: 100,
      files,
    });

    expect(result.enqueued).toBe(MAX_QUEUE_ITEMS); // Tối đa 30 ảnh
    expect(result.rejected).toBe(5); // 5 ảnh vượt quá 30 bị từ chối
    expect(uploadQueueManager.items.length).toBe(30);
  });

  test("T-80 Ghi chú: Giới hạn số upload đồng thời (Concurrency limit = 2)", async () => {
    const files = [
      createMockFile("img1.jpg", 2000),
      createMockFile("img2.jpg", 2000),
      createMockFile("img3.jpg", 2000),
      createMockFile("img4.jpg", 2000),
    ];

    // Treo API post để mô phỏng đang upload
    api.post.mockImplementation(() => new Promise(() => {}));

    await uploadQueueManager.enqueueImages({
      projectId: 1,
      taskId: 10,
      logId: 100,
      files,
    });

    // Concurrency limit = 2 -> Đúng 2 upload đồng thời được khởi động
    expect(uploadQueueManager.activeUploads).toBe(CONCURRENCY_LIMIT);
    await vi.waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
    });
  });

  test("T-81: Tải ảnh từng phần (chunked), cập nhật offset và hoàn tất", async () => {
    const file = createMockFile("pavement.jpg", 1024 * 1024); // 1MB = 2 chunks (512KB each)

    // 1. Mock init session
    api.post.mockResolvedValueOnce({
      data: {
        session_id: "session-uuid-1234",
        bytes_uploaded: 0,
        status: "active",
      },
    });

    // 2. Mock chunk 1 (512KB)
    api.patch.mockResolvedValueOnce({
      data: {
        session_id: "session-uuid-1234",
        bytes_uploaded: 512 * 1024,
        status: "active",
      },
    });

    // 3. Mock chunk 2 (1MB - hoàn thành)
    api.patch.mockResolvedValueOnce({
      data: {
        session_id: "session-uuid-1234",
        bytes_uploaded: 1024 * 1024,
        status: "completed",
        is_completed: true,
        attachment: { id: 99, file_name: "pavement.jpg" },
      },
    });

    await uploadQueueManager.enqueueImages({
      projectId: 1,
      taskId: 10,
      logId: 100,
      files: [file],
    });

    // Đợi xử lý hoàn thành
    await vi.waitFor(() => {
      const item = uploadQueueManager.items[0];
      expect(item.status).toBe("completed");
      expect(item.progress).toBe(100);
      expect(item.attachment?.id).toBe(99);
    });

    expect(api.post).toHaveBeenCalledWith(
      "/projects/1/upload-sessions",
      expect.objectContaining({
        file_name: "pavement.jpg",
        file_size: 1024 * 1024,
        task_log_id: 100,
      })
    );
    expect(api.patch).toHaveBeenCalledTimes(2);
  });

  test("T-81 AC: Đứt mạng giữa chừng, kết nối lại tiếp tục từ phần chưa gửi (Resume from offset)", async () => {
    const file = createMockFile("resume_test.jpg", 1024 * 1024);

    // Giả lập item đã có sessionId từ lần tải trước và đã gửi được 512KB
    const mockItem = {
      id: "item-resume-1",
      projectId: 1,
      taskId: 10,
      logId: 100,
      file,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      checksum: "mock_checksum",
      sessionId: "existing-session-456",
      status: "queued",
      bytesUploaded: 0,
      progress: 0,
    };

    uploadQueueManager.items = [mockItem];

    // Server báo đã nhận được 512KB
    api.get.mockResolvedValueOnce({
      data: {
        session_id: "existing-session-456",
        bytes_uploaded: 512 * 1024,
        status: "active",
        is_completed: false,
      },
    });

    // Gửi chunk tiếp theo (512KB còn lại) và hoàn tất
    api.patch.mockResolvedValueOnce({
      data: {
        session_id: "existing-session-456",
        bytes_uploaded: 1024 * 1024,
        status: "completed",
        is_completed: true,
        attachment: { id: 101, file_name: "resume_test.jpg" },
      },
    });

    await uploadQueueManager.processQueue();

    await vi.waitFor(() => {
      const item = uploadQueueManager.items[0];
      expect(item.status).toBe("completed");
    });

    // Xác nhận gọi PATCH với Upload-Offset là 524288 (bắt đầu từ vị trí đã ngắt mạng)
    expect(api.patch).toHaveBeenCalledWith(
      "/projects/1/upload-sessions/existing-session-456/chunk",
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Upload-Offset": (512 * 1024).toString(),
        }),
      })
    );
  });

  test("T-82: Khi lỗi mạng, đánh dấu error và Thử lại (retry) không nhân đôi ảnh", async () => {
    const file = createMockFile("error_photo.jpg", 500);

    // Giả lập API init lỗi mạng
    api.post.mockRejectedValueOnce(new Error("Network Error"));

    await uploadQueueManager.enqueueImages({
      projectId: 1,
      taskId: 10,
      logId: 100,
      files: [file],
    });

    await vi.waitFor(() => {
      const item = uploadQueueManager.items[0];
      expect(item.status).toBe("error");
      expect(item.error).toContain("Network Error");
    });

    // Thử lại (Retry)
    api.post.mockResolvedValueOnce({
      data: {
        session_id: "retry-session-789",
        bytes_uploaded: 0,
        status: "active",
      },
    });
    api.patch.mockResolvedValueOnce({
      data: {
        status: "completed",
        is_completed: true,
        bytes_uploaded: 500,
        attachment: { id: 102, file_name: "error_photo.jpg" },
      },
    });

    const targetId = uploadQueueManager.items[0].id;
    await uploadQueueManager.retry(targetId);

    await vi.waitFor(() => {
      const item = uploadQueueManager.items[0];
      expect(item.status).toBe("completed");
      expect(item.attachment?.id).toBe(102);
    });
  });
});
