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

  test("7. hiển thị thông báo lỗi và nút Thử lại khi API T52 trả lỗi", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: { data: [] } });
    api.post.mockRejectedValueOnce(new Error("Mất kết nối máy chủ"));

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
    await user.type(textarea, "Nội dung ghi chú lỗi");

    const submitBtn = screen.getByRole("button", { name: /Lưu nhật ký/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Mất kết nối máy chủ/i)).toBeInTheDocument();
      expect(screen.getByText("Thử lại")).toBeInTheDocument();
    });
  });
});
