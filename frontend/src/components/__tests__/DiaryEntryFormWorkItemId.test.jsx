import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiaryEntryForm from "../DiaryEntryForm";
import { resolveWorkItemId } from "../../utils/diaryUtils";
import TaskLogModal from "../TaskLogModal";
import api from "../../lib/api";
import * as diaryDb from "../../lib/diaryDb";

vi.mock("../../lib/api");

describe("resolveWorkItemId Unit Tests", () => {
  const sampleCategories = [
    { id: 101, name: "Hạng mục Móng", code: "HM-01", type: "category" },
    { id: 102, name: "Hạng mục Thân", code: "HM-02", type: "category" },
    { id: "task-5", task_id: 5, name: "Đào đất", parent_id: 101, type: "task" },
    { id: "task-6", task_id: 6, name: "Đổ bê tông", work_item_id: 102, type: "task" },
    { id: "task-orphan", task_id: 7, name: "Task lỗi không có parent", type: "task" },
  ];

  it("trả về ID số nguyên dương khi chọn hạng mục hợp lệ (số hoặc chuỗi số)", () => {
    expect(resolveWorkItemId(101, sampleCategories)).toBe(101);
    expect(resolveWorkItemId("101", sampleCategories)).toBe(101);
    expect(resolveWorkItemId(102, sampleCategories)).toBe(102);
  });

  it("trả về ID số nguyên dương của hạng mục cha khi chọn công việc (task)", () => {
    // task-5 có parent_id = 101
    expect(resolveWorkItemId("task-5", sampleCategories)).toBe(101);
    // task-6 có work_item_id = 102
    expect(resolveWorkItemId("task-6", sampleCategories)).toBe(102);
  });

  it("xử lý khi truyền đối tượng category hoặc task trực tiếp", () => {
    expect(resolveWorkItemId({ id: 101, name: "Móng" }, sampleCategories)).toBe(101);
    expect(
      resolveWorkItemId(
        { id: "task-5", parent_id: 101, type: "task" },
        sampleCategories
      )
    ).toBe(101);
  });

  it("trả về null khi thiếu giá trị (undefined, null, rỗng)", () => {
    expect(resolveWorkItemId("", sampleCategories)).toBeNull();
    expect(resolveWorkItemId(null, sampleCategories)).toBeNull();
    expect(resolveWorkItemId(undefined, sampleCategories)).toBeNull();
  });

  it("trả về null khi giá trị không hợp lệ (0, số âm, NaN, chuỗi không phải số)", () => {
    expect(resolveWorkItemId(0, sampleCategories)).toBeNull();
    expect(resolveWorkItemId("0", sampleCategories)).toBeNull();
    expect(resolveWorkItemId(-1, sampleCategories)).toBeNull();
    expect(resolveWorkItemId("-10", sampleCategories)).toBeNull();
    expect(resolveWorkItemId("Hạng mục Móng", sampleCategories)).toBeNull();
    expect(resolveWorkItemId("abc", sampleCategories)).toBeNull();
    expect(resolveWorkItemId(NaN, sampleCategories)).toBeNull();
  });

  it("trả về null khi task không có hạng mục cha hợp lệ hoặc task không tồn tại", () => {
    expect(resolveWorkItemId("task-orphan", sampleCategories)).toBeNull();
    expect(resolveWorkItemId("task-9999", sampleCategories)).toBeNull();
  });
});

describe("DiaryEntryForm Component - work_item_id contract tests", () => {
  const mockUser = {
    id: 1,
    name: "Kỹ sư",
    role: "ky_su_giam_sat",
  };

  const mockCategories = [
    { id: 101, name: "Hạng mục Móng", code: "HM-01", type: "category" },
    { id: "task-5", task_id: 5, name: "Đào đất móng", parent_id: 101, type: "task" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.get.mockImplementation((url) => {
      if (url.includes("/tree/all")) {
        return Promise.resolve({ data: mockCategories });
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("gửi đúng work_item_id là số nguyên dương khi người dùng chọn hạng mục", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        id: 1,
        work_item_id: 101,
        content: "Nội dung nhật ký",
      },
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <DiaryEntryForm
        projectId={13}
        user={mockUser}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // Chờ tải dropdown
    await waitFor(() => {
      expect(screen.getByTestId("category-option-101")).toBeInTheDocument();
    });

    // Chọn hạng mục
    fireEvent.change(screen.getByTestId("category-dropdown"), {
      target: { value: "101" },
    });

    // Nhập nội dung
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: "Đã hoàn thành thi công móng" },
    });

    // Submit form
    const submitBtn = screen.getByTestId("submit-diary-btn");
    fireEvent.submit(submitBtn.closest("form"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/13/diary-entries",
        expect.objectContaining({
          work_item_id: 101, // Phải là số nguyên dương
          content: "Đã hoàn thành thi công móng",
        })
      );
    });

    const callPayload = api.post.mock.calls[0][1];
    expect(typeof callPayload.work_item_id).toBe("number");
    expect(Number.isInteger(callPayload.work_item_id)).toBe(true);
    expect(callPayload.work_item_id).toBe(101);
  });

  it("gửi đúng work_item_id của hạng mục cha khi người dùng chọn công việc (task)", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        id: 2,
        work_item_id: 101,
        content: "Đã đào xong 50m3 đất",
      },
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <DiaryEntryForm
        projectId={13}
        user={mockUser}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("category-option-task-5")).toBeInTheDocument();
    });

    // Chọn công việc task-5
    fireEvent.change(screen.getByTestId("category-dropdown"), {
      target: { value: "task-5" },
    });

    // Nhập nội dung
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: "Đã đào xong 50m3 đất" },
    });

    // Submit form
    const submitBtn = screen.getByTestId("submit-diary-btn");
    fireEvent.submit(submitBtn.closest("form"));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/13/diary-entries",
        expect.objectContaining({
          work_item_id: 101, // Phải là số nguyên dương của hạng mục cha (parent_id)
          content: "Đã đào xong 50m3 đất",
        })
      );
    });

    const callPayload = api.post.mock.calls[0][1];
    expect(typeof callPayload.work_item_id).toBe("number");
    expect(Number.isInteger(callPayload.work_item_id)).toBe(true);
    expect(callPayload.work_item_id).toBe(101);
  });

  it("hiển thị lỗi validation rõ ràng và không gửi API khi chưa chọn hạng mục", async () => {
    const user = userEvent.setup();
    render(
      <DiaryEntryForm
        projectId={13}
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("category-dropdown")).toBeInTheDocument();
    });

    // Nhập nội dung nhưng không chọn hạng mục
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: "Nội dung hợp lệ" },
    });

    const submitBtn = screen.getByTestId("submit-diary-btn");
    await user.click(submitBtn);

    // Kiểm tra thông báo lỗi validation
    expect(await screen.findByText(/Vui lòng chọn hạng mục/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("chặn gửi request khi ID hạng mục không hợp lệ", async () => {
    render(
      <DiaryEntryForm
        projectId={13}
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("category-dropdown")).toBeInTheDocument();
    });

    // Ép giá trị không hợp lệ
    fireEvent.change(screen.getByTestId("category-dropdown"), {
      target: { value: "invalid-category-xyz" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: "Nội dung hợp lệ" },
    });

    const submitBtn = screen.getByTestId("submit-diary-btn");
    fireEvent.submit(submitBtn.closest("form"));

    expect(
      await screen.findByText(/Vui lòng chọn hạng mục|Hạng mục hoặc công việc không hợp lệ/i)
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("lưu ngoại tuyến vào IndexedDB với đúng work_item_id là số nguyên dương", async () => {
    const spyCreate = vi.spyOn(diaryDb, "createDiaryEntry").mockResolvedValueOnce({
      id: "offline-1",
      work_item_id: 101,
      attachments: [],
    });

    // Mock mất mạng
    const onlineOriginal = navigator.onLine;
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
      writable: true,
    });

    render(
      <DiaryEntryForm
        projectId={13}
        user={mockUser}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("category-option-task-5")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("category-dropdown"), {
      target: { value: "task-5" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Nhập nội dung/i), {
      target: { value: "Ghi nhật ký ngoại tuyến" },
    });

    const submitBtn = screen.getByTestId("submit-diary-btn");
    fireEvent.submit(submitBtn.closest("form"));

    await waitFor(() => {
      expect(spyCreate).toHaveBeenCalled();
    });

    const storedData = spyCreate.mock.calls[0][0];
    expect(storedData.work_item_id).toBe(101);
    expect(typeof storedData.work_item_id).toBe("number");
    expect(api.post).not.toHaveBeenCalled();

    // Khôi phục navigator.onLine
    Object.defineProperty(navigator, "onLine", {
      value: onlineOriginal,
      configurable: true,
      writable: true,
    });
  });
});

describe("TaskLogModal ID Sanitization Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("chuẩn hóa taskId từ dạng 'task-5' sang 5 khi gọi API logs", async () => {
    api.get.mockResolvedValueOnce({ data: { data: [] } });

    render(
      <TaskLogModal
        projectId={13}
        taskId="task-5"
        taskName="Đào đất"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/projects/13/tasks/5/logs");
      expect(screen.queryByText(/Đang tải nhật ký/i)).not.toBeInTheDocument();
    });
  });

  it("chặn gửi request khi taskId không hợp lệ", async () => {
    render(
      <TaskLogModal
        projectId={13}
        taskId="invalid-task"
        taskName="Công việc lỗi"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Không gọi get logs với taskId không hợp lệ
    expect(api.get).not.toHaveBeenCalled();
  });
});
