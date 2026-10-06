import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from "../../lib/api";
import WBSPage from "../WBSPage.jsx";

// Dữ liệu phẳng đúng format GET /categories/:projectId/tree/all
const flatRows = [
  { id: 24, name: "Hạng mục Phần thân", parent_id: null, type: "category",
    status: "Chưa bắt đầu", start_date: null, end_date: null, progress: 0 },
  { id: "task-8", task_id: 8, name: "Xây tường tầng 1", parent_id: 24, type: "task",
    duration_days: 4, start_date: "2026-10-23", end_date: "2026-10-27",
    status: "Chưa bắt đầu", progress: 0 },
  { id: "task-9", task_id: 9, name: "Lắp đặt điện nước tầng 1", parent_id: 24, type: "task",
    duration_days: 2, start_date: "2026-10-24", end_date: "2026-10-26",
    status: "Chưa bắt đầu", progress: 0 },
  { id: 25, name: "Hạng mục Trống", parent_id: null, type: "category",
    status: "Chưa bắt đầu", start_date: null, end_date: null, progress: 0 },
];

const renderPage = async () => {
  api.get.mockResolvedValue({ data: flatRows });
  render(<WBSPage />);
  return screen.findByText("Hạng mục Phần thân");
};

describe("WBSPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "13");
  });

  test("bảng WBS không còn cột Trạng thái và Tiến độ", async () => {
    await renderPage();

    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent.trim());
    expect(headers).not.toContain("Trạng thái");
    expect(headers).not.toContain("Tiến độ");
    expect(headers).toEqual(expect.arrayContaining(["Bắt đầu", "Kết thúc"]));
  });

  test("dòng hạng mục hiển thị ngày tổng hợp min ES / max EF từ công việc con", async () => {
    const cell = await renderPage();
    const row = cell.closest("tr");

    expect(within(row).getByText("23/10/2026")).toBeInTheDocument();
    expect(within(row).getByText("27/10/2026")).toBeInTheDocument();
  });

  test("hạng mục chưa có công việc hiển thị -- cho ngày", async () => {
    await renderPage();
    const row = screen.getByText("Hạng mục Trống").closest("tr");

    expect(within(row).getAllByText("--")).toHaveLength(2);
  });

  test("panel phải vẫn hiển thị tổng số công việc nhưng không còn tiến độ %", async () => {
    await renderPage();

    const panel = screen.getByText("Tổng quan dự án").closest("section, div");
    expect(within(panel).getByText("Tổng công việc")).toBeInTheDocument();
    expect(within(panel).getByTestId("wbs-total-tasks")).toHaveTextContent("2");
    expect(screen.queryByText("Theo giai đoạn")).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument();
  });

  test("chọn 'Công việc thi công' trong modal mục con sẽ mở TaskForm dùng chung", async () => {
    const user = userEvent.setup();
    await renderPage();

    const row = screen.getByText("Hạng mục Trống").closest("tr");
    await user.click(within(row).getByTitle("Thêm mục con"));
    await user.click(screen.getByRole("button", { name: /Công việc thi công/ }));

    // TaskForm dùng chung có tiêu đề "Thêm công việc" và gắn sẵn hạng mục
    expect(screen.getByRole("heading", { name: "Thêm công việc" })).toBeInTheDocument();
    expect(screen.getByText(/Công việc sẽ được tạo trong hạng mục/)).toHaveTextContent("Hạng mục Trống");
    expect(screen.queryByText("Thêm công việc thi công")).not.toBeInTheDocument();
  });
});
