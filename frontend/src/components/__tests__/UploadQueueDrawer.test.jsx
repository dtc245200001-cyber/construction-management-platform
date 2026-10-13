import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadQueueDrawer from "../UploadQueueDrawer";
import { UploadQueueProvider } from "../../context/UploadQueueContext";
import uploadQueueManager from "../../services/uploadQueue";

describe("UploadQueueDrawer (T-82 Giao diện tiến độ và thử lại tải ảnh)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadQueueManager.items = [];
    globalThis.URL.createObjectURL = vi.fn(() => "blob:http://localhost/thumb");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  test("không hiển thị khi hàng đợi rỗng", () => {
    const { container } = render(
      <UploadQueueProvider>
        <UploadQueueDrawer />
      </UploadQueueProvider>
    );

    expect(container.firstChild).toBeNull();
  });

  test("hiển thị floating pill khi đang tải ảnh trong nền (T-82 non-blocking UI)", () => {
    uploadQueueManager.items = [
      {
        id: "1",
        fileName: "mong_nha_1.jpg",
        fileSize: 1048576,
        status: "uploading",
        progress: 45,
        bytesUploaded: 471859,
      },
      {
        id: "2",
        fileName: "mong_nha_2.jpg",
        fileSize: 1048576,
        status: "queued",
        progress: 0,
        bytesUploaded: 0,
      },
    ];

    render(
      <UploadQueueProvider>
        <UploadQueueDrawer />
      </UploadQueueProvider>
    );

    // Pill hiển thị tiến độ
    expect(screen.getByText(/Đang tải 1\/2 ảnh/i)).toBeInTheDocument();
  });

  test("mở drawer chi tiết khi bấm vào floating pill", async () => {
    const user = userEvent.setup();

    uploadQueueManager.items = [
      {
        id: "1",
        fileName: "mong_nha_1.jpg",
        fileSize: 1048576,
        status: "uploading",
        progress: 45,
        bytesUploaded: 471859,
      },
    ];

    render(
      <UploadQueueProvider>
        <UploadQueueDrawer />
      </UploadQueueProvider>
    );

    const pill = screen.getByText(/Đang tải 1\/1 ảnh/i);
    await user.click(pill);

    // Khung chi tiết mở ra
    expect(screen.getByText("Hàng đợi tải ảnh nền")).toBeInTheDocument();
    expect(screen.getByText("mong_nha_1.jpg")).toBeInTheDocument();
    expect(screen.getByText(/Đang tải 45%/i)).toBeInTheDocument();
  });

  test("hiển thị trạng thái lỗi và bấm nút Thử lại (retry without duplicate)", async () => {
    const user = userEvent.setup();
    const retrySpy = vi.spyOn(uploadQueueManager, "retry").mockImplementation(() => {});

    uploadQueueManager.items = [
      {
        id: "err-item-1",
        fileName: "anh_loi.jpg",
        fileSize: 500000,
        status: "error",
        error: "Mất kết nối mạng giữa chừng",
        progress: 60,
      },
    ];

    render(
      <UploadQueueProvider>
        <UploadQueueDrawer />
      </UploadQueueProvider>
    );

    // Pill báo lỗi
    expect(screen.getByText(/1 ảnh bị lỗi khi tải/i)).toBeInTheDocument();

    // Mở drawer
    await user.click(screen.getByText(/1 ảnh bị lỗi khi tải/i));

    expect(screen.getByText("anh_loi.jpg")).toBeInTheDocument();
    expect(screen.getByText("Mất kết nối mạng giữa chừng")).toBeInTheDocument();

    // Bấm nút thử lại
    const retryBtn = screen.getByTitle("Thử lại ảnh này");
    await user.click(retryBtn);

    expect(retrySpy).toHaveBeenCalledWith("err-item-1");
  });

  test("nút Thử lại tất cả trên header hoạt động khi có nhiều ảnh lỗi", async () => {
    const user = userEvent.setup();
    const retryAllSpy = vi.spyOn(uploadQueueManager, "retryAll").mockImplementation(() => {});

    uploadQueueManager.items = [
      {
        id: "err-1",
        fileName: "loi1.jpg",
        fileSize: 1000,
        status: "error",
      },
      {
        id: "err-2",
        fileName: "loi2.jpg",
        fileSize: 1000,
        status: "error",
      },
    ];

    render(
      <UploadQueueProvider>
        <UploadQueueDrawer />
      </UploadQueueProvider>
    );

    // Mở drawer
    await user.click(screen.getByText(/2 ảnh bị lỗi khi tải/i));

    const retryAllBtn = screen.getByRole("button", { name: /Thử lại \(2\)/i });
    await user.click(retryAllBtn);

    expect(retryAllSpy).toHaveBeenCalled();
  });
});
