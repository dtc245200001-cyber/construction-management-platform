import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from "../../lib/api";
import TaskForm from "../TaskForm.jsx";

const workItem = { id: 24, name: "Hạng mục Phần thân" };

describe("TaskForm (T-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { dependencies: [] } });
  });

  test("báo lỗi ngay khi nhập thời lượng không hợp lệ và khoá nút lưu", async () => {
    const user = userEvent.setup();
    render(<TaskForm projectId={13} workItem={workItem} onSuccess={vi.fn()} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/Tên công việc/), "Xây tường tầng 2");
    const duration = screen.getByLabelText(/Thời lượng/);
    await user.clear(duration);
    await user.type(duration, "0");

    expect(screen.getByText("Thời lượng phải là số nguyên lớn hơn 0.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm công việc" })).toBeDisabled();
  });

  test("thời lượng hợp lệ thì không hiện lỗi", async () => {
    const user = userEvent.setup();
    render(<TaskForm projectId={13} workItem={workItem} onSuccess={vi.fn()} onClose={vi.fn()} />);

    const duration = screen.getByLabelText(/Thời lượng/);
    await user.clear(duration);
    await user.type(duration, "4");

    expect(screen.queryByText("Thời lượng phải là số nguyên lớn hơn 0.")).not.toBeInTheDocument();
  });

  test("tạo mới gọi api.post với hạng mục, tên và thời lượng", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    api.post.mockResolvedValue({ data: { id: 99 } });
    render(<TaskForm projectId={13} workItem={workItem} onSuccess={onSuccess} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/Tên công việc/), "  Xây tường tầng 2  ");
    const duration = screen.getByLabelText(/Thời lượng/);
    await user.clear(duration);
    await user.type(duration, "4");
    await user.click(screen.getByRole("button", { name: "Thêm công việc" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ id: 99 }));
    expect(api.post).toHaveBeenCalledWith("/projects/13/tasks", {
      work_item_id: 24,
      name: "Xây tường tầng 2",
      duration_days: 4,
      scheduling_mode: "auto",
      manual_start_date: "",
    });
  });

  test("chỉnh sửa gọi api.put đúng task và không gửi work_item_id", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    api.put.mockResolvedValue({ data: { id: 7 } });
    render(
      <TaskForm
        projectId={13}
        task={{ id: 7, name: "Trát tường", duration_days: 5 }}
        onSuccess={onSuccess}
        onClose={vi.fn()}
      />
    );

    const duration = screen.getByLabelText(/Thời lượng/);
    await user.clear(duration);
    await user.type(duration, "6");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(api.put).toHaveBeenCalledWith("/projects/13/tasks/7", {
      name: "Trát tường",
      duration_days: 6,
      scheduling_mode: "auto",
      manual_start_date: "",
    });
  });

  test("hiển thị thông báo lỗi từ server khi lưu thất bại", async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValue({ response: { data: { message: "Tên công việc đã tồn tại" } } });
    render(<TaskForm projectId={13} workItem={workItem} onSuccess={vi.fn()} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(/Tên công việc/), "Đào móng");
    await user.click(screen.getByRole("button", { name: "Thêm công việc" }));

    expect(await screen.findByText("Tên công việc đã tồn tại")).toBeInTheDocument();
  });
});
