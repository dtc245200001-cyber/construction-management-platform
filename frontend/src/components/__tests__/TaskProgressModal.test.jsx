import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import api from "../../lib/api";
import TaskProgressModal from "../TaskProgressModal.jsx";

const mockTask = {
  id: 101,
  name: "Đổ bê tông sàn tầng 2",
  work_item_name: "Phần kết cấu",
  actual_start_date: "2026-10-01",
  actual_end_date: null,
  percent_complete: 30,
};

const completedTask = {
  id: 102,
  name: "Đào đất móng",
  work_item_name: "Phần móng",
  actual_start_date: "2026-10-01",
  actual_end_date: "2026-10-05",
  percent_complete: 100,
};

describe("TaskProgressModal (T-35 / S-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("hiển thị đúng 3 giá trị tiến độ thực tế từ task", () => {
    render(
      <TaskProgressModal
        projectId={13}
        task={mockTask}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("Cập nhật tiến độ")).toBeInTheDocument();
    expect(screen.getByText("Đổ bê tông sàn tầng 2")).toBeInTheDocument();

    const startInput = screen.getByLabelText(/Ngày bắt đầu thực tế/);
    const endInput = screen.getByLabelText(/Ngày kết thúc thực tế/);
    const percentInput = screen.getByLabelText(/Phần trăm hoàn thành/);

    expect(startInput).toHaveValue("2026-10-01");
    expect(endInput).toHaveValue("");
    expect(percentInput).toHaveValue(30);
  });

  test("chặn nhập ngày kết thúc sớm hơn ngày bắt đầu và khoá nút lưu", async () => {
    const user = userEvent.setup();
    render(
      <TaskProgressModal
        projectId={13}
        task={mockTask}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const endInput = screen.getByLabelText(/Ngày kết thúc thực tế/);
    await user.type(endInput, "2026-09-25"); // Sớm hơn 2026-10-01

    expect(
      screen.getByText("Ngày kết thúc thực tế không được sớm hơn ngày bắt đầu thực tế.")
    ).toBeInTheDocument();
    expect(endInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: /Lưu tiến độ/ })).toBeDisabled();
  });

  test("chặn phần trăm hoàn thành ngoài khoảng 0-100", async () => {
    const user = userEvent.setup();
    render(
      <TaskProgressModal
        projectId={13}
        task={mockTask}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const percentInput = screen.getByLabelText(/Phần trăm hoàn thành/);
    await user.clear(percentInput);
    await user.type(percentInput, "120");

    expect(
      screen.getByText("Phần trăm hoàn thành phải là số nguyên từ 0 đến 100.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lưu tiến độ/ })).toBeDisabled();

    await user.clear(percentInput);
    await user.type(percentInput, "-5");
    expect(
      screen.getByText("Phần trăm hoàn thành phải là số nguyên từ 0 đến 100.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lưu tiến độ/ })).toBeDisabled();
  });

  test("cập nhật 3 giá trị hợp lệ gọi api.patch", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    api.patch.mockResolvedValue({
      data: {
        message: "Cập nhật tiến độ thành công",
        task: { ...mockTask, percent_complete: 60, actual_end_date: "2026-10-10" },
      },
    });

    render(
      <TaskProgressModal
        projectId={13}
        task={mockTask}
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    const endInput = screen.getByLabelText(/Ngày kết thúc thực tế/);
    const percentInput = screen.getByLabelText(/Phần trăm hoàn thành/);

    await user.type(endInput, "2026-10-10");
    await user.clear(percentInput);
    await user.type(percentInput, "60");

    const submitBtn = screen.getByRole("button", { name: /Lưu tiến độ/ });
    expect(submitBtn).not.toBeDisabled();
    await user.click(submitBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/projects/13/tasks/101/progress",
        {
          actual_start_date: "2026-10-01",
          actual_end_date: "2026-10-10",
          percent_complete: 60,
        }
      );
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test("mở lại việc đã xong thì hiện hộp xác nhận", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    api.patch.mockResolvedValue({
      data: {
        message: "Cập nhật tiến độ thành công",
        task: { ...completedTask, percent_complete: 80 },
      },
    });

    render(
      <TaskProgressModal
        projectId={13}
        task={completedTask}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    // Thay đổi % từ 100 xuống 80
    const percentInput = screen.getByLabelText(/Phần trăm hoàn thành/);
    await user.clear(percentInput);
    await user.type(percentInput, "80");

    // Bấm lưu
    await user.click(screen.getByRole("button", { name: /Lưu tiến độ/ }));

    // Phải xuất hiện hộp thoại xác nhận mở lại việc đã xong
    expect(
      screen.getByRole("alertdialog")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Xác nhận mở lại việc đã xong")
    ).toBeInTheDocument();

    // Chưa gọi api.patch khi chưa xác nhận
    expect(api.patch).not.toHaveBeenCalled();

    // Bấm nút "Xác nhận mở lại"
    const confirmBtn = screen.getByRole("button", { name: "Xác nhận mở lại" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        "/projects/13/tasks/102/progress",
        {
          actual_start_date: "2026-10-01",
          actual_end_date: "2026-10-05",
          percent_complete: 80,
        }
      );
    });
    expect(onSuccess).toHaveBeenCalled();
  });

  test("hiển thị lỗi từ server khi cập nhật thất bại", async () => {
    const user = userEvent.setup();
    api.patch.mockRejectedValue({
      response: {
        data: { message: "Ngày kết thúc thực tế không được trước ngày bắt đầu thực tế." },
      },
    });

    render(
      <TaskProgressModal
        projectId={13}
        task={mockTask}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Lưu tiến độ/ }));

    expect(
      await screen.findByText("Ngày kết thúc thực tế không được trước ngày bắt đầu thực tế.")
    ).toBeInTheDocument();
  });
});
