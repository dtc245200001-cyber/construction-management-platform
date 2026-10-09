import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from "../../lib/api";
import TaskLogModal from "../TaskLogModal.jsx";

const mockLogs = [
  {
    id: 1,
    task_id: 101,
    user_id: 2,
    user_name: "Kỹ sư Giám sát",
    content: "Đã kiểm tra xong cốt thép dầm sàn tầng 2.",
    created_at: "2026-10-09T14:30:00Z",
    attachments: [
      {
        id: 10,
        file_name: "cot_thep_1.jpg",
        file_size: 450000,
        mime_type: "image/jpeg",
        url: "/api/projects/13/tasks/101/logs/1/attachments/10",
      },
    ],
  },
];

describe("TaskLogModal (S-23 / T-53)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    globalThis.URL.createObjectURL = vi.fn(
      () => "blob:http://localhost/mock-thumb"
    );
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  test("hiển thị danh sách nhật ký và ảnh của công việc", async () => {
    api.get.mockResolvedValueOnce({ data: { data: mockLogs } });

    render(
      <TaskLogModal
        projectId={13}
        taskId={101}
        taskName="Đổ bê tông sàn tầng 2"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Nhật ký & Ảnh hiện trường")).toBeInTheDocument();
    expect(screen.getByText("Đổ bê tông sàn tầng 2")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("Đã kiểm tra xong cốt thép dầm sàn tầng 2.")
      ).toBeInTheDocument();
      expect(screen.getByText("Kỹ sư Giám sát")).toBeInTheDocument();
      expect(screen.getByText("cot_thep_1.jpg")).toBeInTheDocument();
    });
  });

  test("7 & 8. gửi nhật ký mới thành công và gửi đúng FormData đến API T52", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { data: [] } });

    const newLogResponse = {
      id: 2,
      task_id: 101,
      user_id: 2,
      user_name: "Kỹ sư Giám sát",
      content: "Nghiệm thu ván khuôn thành công.",
      created_at: new Date().toISOString(),
      attachments: [],
    };

    api.post.mockResolvedValueOnce({
      data: {
        message: "Tạo nhật ký thành công",
        log: newLogResponse,
      },
    });

    const onLogAdded = vi.fn();

    render(
      <TaskLogModal
        projectId={13}
        taskId={101}
        taskName="Đổ bê tông sàn tầng 2"
        isOpen={true}
        onClose={vi.fn()}
        onLogAdded={onLogAdded}
      />
    );

    const textarea = screen.getByPlaceholderText(
      /Nhập mô tả tình hình thi công/i
    );
    await user.type(textarea, "Nghiệm thu ván khuôn thành công.");

    const submitBtn = screen.getByRole("button", { name: /Lưu nhật ký/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/13/tasks/101/logs",
        expect.any(FormData),
        expect.objectContaining({
          headers: { "Content-Type": "multipart/form-data" },
        })
      );
      expect(onLogAdded).toHaveBeenCalledWith(newLogResponse);
    });
  });

  test("7. hiển thị thông báo lỗi và nút Thử lại khi API T52 trả lỗi, sau đó bấm Thử lại thành công", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { data: [] } });
    api.post.mockRejectedValueOnce(new Error("Không tìm thấy đường dẫn này"));

    const newLogResponse = {
      id: 3,
      task_id: 101,
      user_id: 2,
      user_name: "Kỹ sư Giám sát",
      content: "Nội dung thử lại",
      created_at: new Date().toISOString(),
      attachments: [],
    };

    render(
      <TaskLogModal
        projectId={13}
        taskId={101}
        taskName="Đổ bê tông sàn tầng 2"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const textarea = screen.getByPlaceholderText(
      /Nhập mô tả tình hình thi công/i
    );
    await user.type(textarea, "Nội dung thử lại");

    const submitBtn = screen.getByRole("button", { name: /Lưu nhật ký/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Không tìm thấy đường dẫn này/i)).toBeInTheDocument();
      expect(screen.getByText("Thử lại")).toBeInTheDocument();
    });

    // Lần 2 thử lại thành công
    api.post.mockResolvedValueOnce({
      data: {
        message: "Tạo nhật ký thành công",
        log: newLogResponse,
      },
    });

    const retryBtn = screen.getByText("Thử lại");
    await user.click(retryBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/Không tìm thấy đường dẫn này/i)).not.toBeInTheDocument();
      expect(screen.getByText("Nội dung thử lại")).toBeInTheDocument();
    });
  });

  describe("T54 – Thumbnail & Xem ảnh gốc theo yêu cầu", () => {
    const generateAttachments = (count) =>
      Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        file_name: `image_${i + 1}.jpg`,
        file_size: 200000 + i * 10000,
        mime_type: "image/jpeg",
        url: `/api/projects/13/tasks/101/logs/1/attachments/${i + 1}`,
      }));

    test("AC1: Danh sách có 12 ảnh -> 10 ảnh đầu eager tải trước, từ ảnh 11 lazy load", async () => {
      const mockManyLogs = [
        {
          id: 1,
          task_id: 101,
          user_id: 2,
          user_name: "Kỹ sư Giám sát",
          content: "Nhiều ảnh đính kèm",
          created_at: "2026-10-09T14:30:00Z",
          attachments: generateAttachments(12),
        },
      ];

      api.get.mockResolvedValueOnce({ data: { data: mockManyLogs } });

      render(
        <TaskLogModal
          projectId={13}
          taskId={101}
          taskName="Đổ bê tông sàn tầng 2"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("image_1.jpg")).toBeInTheDocument();
        expect(screen.getByText("image_12.jpg")).toBeInTheDocument();
      });

      const images = document.querySelectorAll("img[data-priority]");
      expect(images.length).toBe(12);

      // 10 ảnh đầu phải là eager và high priority
      for (let i = 0; i < 10; i++) {
        expect(images[i].getAttribute("loading")).toBe("eager");
        expect(images[i].getAttribute("fetchpriority")).toBe("high");
        expect(images[i].getAttribute("data-priority")).toBe("true");
      }

      // Ảnh thứ 11 & 12 phải là lazy và auto priority
      for (let i = 10; i < 12; i++) {
        expect(images[i].getAttribute("loading")).toBe("lazy");
        expect(images[i].getAttribute("fetchpriority")).toBe("auto");
        expect(images[i].getAttribute("data-priority")).toBe("false");
      }
    });

    test("AC1 & AC2: Mở danh sách không tải ảnh gốc; chỉ khi bấm thumbnail mới mở viewer và tải ảnh gốc", async () => {
      const user = userEvent.setup();
      api.get.mockResolvedValueOnce({ data: { data: mockLogs } });

      render(
        <TaskLogModal
          projectId={13}
          taskId={101}
          taskName="Đổ bê tông sàn tầng 2"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("cot_thep_1.jpg")).toBeInTheDocument();
      });

      // Ban đầu viewer modal KHÔNG xuất hiện, ảnh gốc KHÔNG được tải
      expect(screen.queryByTestId("image-viewer-modal")).not.toBeInTheDocument();
      expect(screen.queryByTestId("full-size-image")).not.toBeInTheDocument();

      // Bấm vào thumbnail
      const thumbnail = screen.getByTestId("thumbnail-item-10");
      await user.click(thumbnail);

      // Viewer modal xuất hiện và bắt đầu tải ảnh gốc
      await waitFor(() => {
        expect(screen.getByTestId("image-viewer-modal")).toBeInTheDocument();
        expect(screen.getByTestId("full-size-image")).toBeInTheDocument();
        expect(screen.getByTestId("full-size-image")).toHaveAttribute(
          "src",
          "/api/projects/13/tasks/101/logs/1/attachments/10"
        );
      });
    });

    test("AC2: Điều hướng Next / Prev và đóng viewer bằng nút Đóng hoặc phím Escape không làm mất danh sách", async () => {
      const user = userEvent.setup();
      const mockMultipleLogs = [
        {
          id: 1,
          task_id: 101,
          user_id: 2,
          user_name: "Kỹ sư",
          content: "Log 1",
          created_at: "2026-10-09T14:30:00Z",
          attachments: [
            { id: 1, file_name: "anh_1.jpg", file_size: 100000, url: "/att/1" },
            { id: 2, file_name: "anh_2.jpg", file_size: 200000, url: "/att/2" },
          ],
        },
      ];

      api.get.mockResolvedValueOnce({ data: { data: mockMultipleLogs } });

      render(
        <TaskLogModal
          projectId={13}
          taskId={101}
          taskName="Đổ bê tông sàn tầng 2"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("anh_1.jpg")).toBeInTheDocument();
      });

      // Mở ảnh 1
      await user.click(screen.getByTestId("thumbnail-item-1"));

      await waitFor(() => {
        expect(screen.getByTestId("image-viewer-modal")).toBeInTheDocument();
        expect(screen.getByText("(1 / 2)")).toBeInTheDocument();
      });

      // Chuyển sang ảnh 2 bằng nút Next
      const nextBtn = screen.getByLabelText("Ảnh tiếp theo");
      await user.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText("(2 / 2)")).toBeInTheDocument();
      });

      // Đóng viewer bằng phím Escape
      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByTestId("image-viewer-modal")).not.toBeInTheDocument();
      });

      // Danh sách nhật ký vẫn giữ nguyên vẹn
      expect(screen.getByText("Log 1")).toBeInTheDocument();
      expect(screen.getByText("anh_1.jpg")).toBeInTheDocument();
      expect(screen.getByText("anh_2.jpg")).toBeInTheDocument();
    });

    test("AC1 & Resilience: Thumbnail tải lỗi -> hiện thông báo 'Lỗi tải ảnh' và nút Thử lại", async () => {
      const user = userEvent.setup();
      const mockFailLogs = [
        {
          id: 1,
          task_id: 101,
          user_id: 2,
          user_name: "Kỹ sư",
          content: "Log lỗi thumbnail",
          created_at: "2026-10-09T14:30:00Z",
          attachments: [
            { id: 99, file_name: "anh_hong.jpg", file_size: 150000, url: "/att/99" },
          ],
        },
      ];

      api.get.mockResolvedValueOnce({ data: { data: mockFailLogs } });

      render(
        <TaskLogModal
          projectId={13}
          taskId={101}
          taskName="Đổ bê tông sàn tầng 2"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("anh_hong.jpg")).toBeInTheDocument();
      });

      const thumbnailImg = screen.getByRole("img", { name: "anh_hong.jpg" });

      // Kích hoạt lỗi tải ảnh
      thumbnailImg.dispatchEvent(new Event("error"));

      await waitFor(() => {
        expect(screen.getByTestId("thumbnail-error")).toBeInTheDocument();
        expect(screen.getByText("Lỗi tải ảnh")).toBeInTheDocument();
        expect(screen.getByTestId("thumbnail-retry-btn")).toBeInTheDocument();
      });

      // Bấm nút thử lại
      await user.click(screen.getByTestId("thumbnail-retry-btn"));

      await waitFor(() => {
        expect(screen.queryByTestId("thumbnail-error")).not.toBeInTheDocument();
      });
    });

    test("AC2 & Resilience: Ảnh gốc tải lỗi trong viewer -> hiện thông báo và cho phép Thử lại tải ảnh", async () => {
      const user = userEvent.setup();
      const mockFailLogs = [
        {
          id: 1,
          task_id: 101,
          user_id: 2,
          user_name: "Kỹ sư",
          content: "Log xem ảnh lỗi",
          created_at: "2026-10-09T14:30:00Z",
          attachments: [
            { id: 77, file_name: "anh_full_loi.jpg", file_size: 180000, url: "/att/77" },
          ],
        },
      ];

      api.get.mockResolvedValueOnce({ data: { data: mockFailLogs } });

      render(
        <TaskLogModal
          projectId={13}
          taskId={101}
          taskName="Đổ bê tông sàn tầng 2"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("anh_full_loi.jpg")).toBeInTheDocument();
      });

      // Mở ảnh trong viewer
      await user.click(screen.getByTestId("thumbnail-item-77"));

      await waitFor(() => {
        expect(screen.getByTestId("image-viewer-modal")).toBeInTheDocument();
      });

      const fullImg = screen.getByTestId("full-size-image");
      // Kích hoạt lỗi tải ảnh gốc
      fullImg.dispatchEvent(new Event("error"));

      await waitFor(() => {
        expect(screen.getByTestId("full-image-error")).toBeInTheDocument();
        expect(screen.getByText("Không thể tải ảnh gốc")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Thử lại tải ảnh/i })).toBeInTheDocument();
      });

      // Bấm nút thử lại tải ảnh
      await user.click(screen.getByRole("button", { name: /Thử lại tải ảnh/i }));

      await waitFor(() => {
        expect(screen.queryByTestId("full-image-error")).not.toBeInTheDocument();
        expect(screen.getByTestId("full-image-loading")).toBeInTheDocument();
      });
    });
  });
});
