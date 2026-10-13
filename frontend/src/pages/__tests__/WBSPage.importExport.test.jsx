import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// Mock @e965/xlsx (fork đã vá lỗ hổng SheetJS): sheet_to_json trả về dữ liệu
// do từng test tự cấu hình qua __setSheetRows, tránh phải dựng buffer .xlsx
// thật trong jsdom.
vi.mock("@e965/xlsx", () => {
  let rows = [];
  return {
    __setSheetRows: (next) => { rows = next; },
    SSF: { parse_date_code: vi.fn((n) => ({ y: 2026, m: 9, d: 26 })) },
    utils: {
      json_to_sheet: vi.fn(() => ({})),
      sheet_to_json: vi.fn(() => rows),
      book_new: vi.fn(() => ({})),
      book_append_sheet: vi.fn(),
    },
    read: vi.fn(() => ({ SheetNames: ["WBS"], Sheets: { WBS: {} } })),
    writeFile: vi.fn(),
  };
});

import api from "../../lib/api";
import * as XLSX from "@e965/xlsx";
import WBSPage from "../WBSPage.jsx";

// Cây gốc rỗng để tập trung vào luồng nhập Excel (không có dữ liệu cũ gây trùng tên).
const emptyRows = [];

const renderPage = async () => {
  api.get.mockResolvedValue({ data: emptyRows });
  render(
    <MemoryRouter>
      <WBSPage />
    </MemoryRouter>
  );
  return screen.findByText("Chưa có hạng mục nào.");
};

const importFile = async (user, sheetRows) => {
  XLSX.__setSheetRows(sheetRows);
  const file = new File(["dummy"], "wbs.xlsx", { type: "application/vnd.ms-excel" });
  file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));
  const input = document.querySelector('input[type="file"]');
  await user.upload(input, file);
};

describe("WBSPage — Nhập Excel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "13");
  });

  test("dựng đúng cây hạng mục/công việc theo STT và hiển thị preview", async () => {
    const user = userEvent.setup();
    await renderPage();

    await importFile(user, [
      { "STT": "1", "Tên": "Hạng mục Móng", "Loại": "Hạng mục" },
      { "STT": "1.1", "Tên": "Ép cọc", "Loại": "Công việc", "Số ngày": 5, "Ngày bắt đầu": "26/09/2026" },
      { "STT": "1.2", "Tên": "Đổ bê tông đài móng", "Loại": "Công việc", "Số ngày": 3, "Ngày bắt đầu": "03/10/2026", "Ràng buộc": "1.1" },
    ]);

    expect(await screen.findByText("Xem trước nhập Excel")).toBeInTheDocument();
    expect(screen.getByText(/2 công việc/)).toBeInTheDocument();
    expect(screen.getByText("Hạng mục Móng")).toBeInTheDocument();
    expect(screen.getByText("Ép cọc")).toBeInTheDocument();
    expect(screen.getByText("Đổ bê tông đài móng")).toBeInTheDocument();
    expect(screen.queryByText(/dòng bị bỏ qua/)).not.toBeInTheDocument();
  });

  test("công việc tham chiếu ràng buộc ra ngoài file vẫn được tạo, nhưng ràng buộc đó không được gọi API", async () => {
    const user = userEvent.setup();
    await renderPage();

    await importFile(user, [
      { "STT": "1", "Tên": "Hạng mục Móng", "Loại": "Hạng mục" },
      { "STT": "1.1", "Tên": "Ép cọc", "Loại": "Công việc", "Số ngày": 5, "Ngày bắt đầu": "26/09/2026", "Ràng buộc": "9.9" },
    ]);

    await screen.findByText("Xem trước nhập Excel");

    api.post.mockImplementation((url) => {
      if (url === `/categories/13`) return Promise.resolve({ data: { id: 101 } });
      if (url === `/projects/13/tasks`) return Promise.resolve({ data: { id: 201 } });
      return Promise.resolve({ data: {} });
    });

    await user.click(screen.getByRole("button", { name: /Xác nhận nhập/ }));

    expect(api.post).toHaveBeenCalledWith(`/categories/13`, expect.objectContaining({ name: "Hạng mục Móng" }));
    expect(api.post).toHaveBeenCalledWith(`/projects/13/tasks`, expect.objectContaining({
      work_item_id: 101,
      name: "Ép cọc",
      duration_days: 5,
      scheduling_mode: "manual",
      manual_start_date: "2026-09-26",
    }));
    expect(api.post).not.toHaveBeenCalledWith(`/projects/13/dependencies`, expect.anything());
  });

  test("dòng thiếu STT hoặc công việc thiếu số ngày hợp lệ bị bỏ qua kèm lý do", async () => {
    const user = userEvent.setup();
    await renderPage();

    await importFile(user, [
      { "STT": "", "Tên": "Hạng mục Thiếu STT", "Loại": "Hạng mục" },
      { "STT": "1", "Tên": "Hạng mục Móng", "Loại": "Hạng mục" },
      { "STT": "1.1", "Tên": "Ép cọc", "Loại": "Công việc", "Số ngày": "abc" },
    ]);

    await screen.findByText("Xem trước nhập Excel");
    expect(screen.getByText(/2 dòng bị bỏ qua/)).toBeInTheDocument();
    expect(screen.getByText(/Thiếu cột STT/)).toBeInTheDocument();
    expect(screen.getByText(/thiếu 'Số ngày' hợp lệ/)).toBeInTheDocument();
  });

  test("công việc cùng cấp với hạng mục con khác bị bỏ qua (NFR T-12)", async () => {
    const user = userEvent.setup();
    await renderPage();

    await importFile(user, [
      { "STT": "1", "Tên": "Hạng mục Móng", "Loại": "Hạng mục" },
      { "STT": "1.1", "Tên": "Hạng mục con", "Loại": "Hạng mục" },
      { "STT": "1.2", "Tên": "Công việc lẫn vào", "Loại": "Công việc", "Số ngày": 2, "Ngày bắt đầu": "26/09/2026" },
    ]);

    await screen.findByText("Xem trước nhập Excel");
    expect(screen.getByText(/cùng cấp với hạng mục con khác/)).toBeInTheDocument();
    expect(screen.getByText("Hạng mục con")).toBeInTheDocument();
    expect(screen.queryByText("Công việc lẫn vào")).not.toBeInTheDocument();
  });
});

describe("WBSPage — Xuất báo cáo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "13");
  });

  test("bấm Xuất báo cáo gọi XLSX.writeFile", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: emptyRows });
    render(
      <MemoryRouter>
        <WBSPage />
      </MemoryRouter>
    );
    await screen.findByText("Chưa có hạng mục nào.");

    await user.click(screen.getByText("Xuất báo cáo"));

    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
  });
});

describe("WBSPage — Sơ đồ WBS", () => {
  test("nút Sơ đồ WBS mở được và dẫn sang /wbs-diagram", async () => {
    api.get.mockResolvedValue({ data: emptyRows });
    render(
      <MemoryRouter>
        <WBSPage />
      </MemoryRouter>
    );
    await screen.findByText("Chưa có hạng mục nào.");

    const link = screen.getByText("Sơ đồ WBS").closest("a");
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe("/wbs-diagram");
  });
});

describe("WBSPage — Nhập Excel luồng Ngày bắt đầu và Ràng buộc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "13");
  });

  test("Ngày bắt đầu dạng số serial Excel được parse và gửi manual_start_date", async () => {
    const user = userEvent.setup();
    XLSX.SSF.parse_date_code.mockReturnValue({ y: 2026, m: 9, d: 26 });
    api.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter><WBSPage /></MemoryRouter>);
    await screen.findByText("Chưa có hạng mục nào.");

    // sheet_to_json trả số serial 45927 cho cột Ngày bắt đầu
    XLSX.__setSheetRows([
      { "STT": "1", "Tên": "Hạng mục Móng", "Loại": "Hạng mục" },
      { "STT": "1.1", "Tên": "Ép cọc", "Loại": "Công việc", "Số ngày": 5, "Ngày bắt đầu": 45927 },
    ]);
    const file = new File(["dummy"], "wbs.xlsx", { type: "application/vnd.ms-excel" });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    await user.upload(document.querySelector('input[type="file"]'), file);
    await screen.findByText("Xem trước nhập Excel");

    api.post.mockImplementation((url) => {
      if (url === "/categories/13") return Promise.resolve({ data: { id: 101 } });
      if (url === "/projects/13/tasks") return Promise.resolve({ data: { id: 201 } });
      return Promise.resolve({ data: {} });
    });
    await user.click(screen.getByRole("button", { name: /Xác nhận nhập/ }));
    expect(api.post).toHaveBeenCalledWith("/projects/13/tasks", expect.objectContaining({
      manual_start_date: "2026-09-26",
      scheduling_mode: "manual",
    }));
    expect(XLSX.SSF.parse_date_code).toHaveBeenCalledWith(45927);
  });

  test("Ràng buộc dạng 2.3SS và 1.2FS+2 được tạo đúng với lead_lag_days", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter><WBSPage /></MemoryRouter>);
    await screen.findByText("Chưa có hạng mục nào.");

    XLSX.__setSheetRows([
      { "STT": "1", "Tên": "HM", "Loại": "Hạng mục" },
      { "STT": "1.1", "Tên": "A", "Loại": "Công việc", "Số ngày": 2, "Ngày bắt đầu": "26/09/2026" },
      { "STT": "1.2", "Tên": "B", "Loại": "Công việc", "Số ngày": 3, "Ngày bắt đầu": "26/09/2026", "Ràng buộc": "1.1, 1.1FS+2" },
      { "STT": "1.3", "Tên": "C", "Loại": "Công việc", "Số ngày": 2, "Ngày bắt đầu": "26/09/2026", "Ràng buộc": "1.2SS" },
    ]);
    const file = new File(["dummy"], "wbs.xlsx", { type: "application/vnd.ms-excel" });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    await user.upload(document.querySelector('input[type="file"]'), file);
    await screen.findByText("Xem trước nhập Excel");

    api.post.mockImplementation((url) => {
      if (url === "/categories/13") return Promise.resolve({ data: { id: 101 } });
      if (url === "/projects/13/tasks") {
        // trả id tăng dần
        api.post._taskSeq = (api.post._taskSeq || 200) + 1;
        return Promise.resolve({ data: { id: api.post._taskSeq } });
      }
      return Promise.resolve({ data: {} });
    });
    await user.click(screen.getByRole("button", { name: /Xác nhận nhập/ }));
    // 1.2 -> 1.1 FS (mặc định) và 1.1 FS+2
    expect(api.post).toHaveBeenCalledWith("/projects/13/dependencies", expect.objectContaining({ dependency_type: "FS" }));
    expect(api.post).toHaveBeenCalledWith("/projects/13/dependencies", expect.objectContaining({ dependency_type: "FS", lead_lag_days: 2 }));
    expect(api.post).toHaveBeenCalledWith("/projects/13/dependencies", expect.objectContaining({ dependency_type: "SS" }));
  });

  test("Công việc thiếu Ngày bắt đầu bị bỏ qua kèm lý do", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [] });
    render(<MemoryRouter><WBSPage /></MemoryRouter>);
    await screen.findByText("Chưa có hạng mục nào.");

    XLSX.__setSheetRows([
      { "STT": "1", "Tên": "HM", "Loại": "Hạng mục" },
      { "STT": "1.1", "Tên": "Thiếu ngày", "Loại": "Công việc", "Số ngày": 2 },
    ]);
    const file = new File(["dummy"], "wbs.xlsx", { type: "application/vnd.ms-excel" });
    file.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    await user.upload(document.querySelector('input[type="file"]'), file);
    await screen.findByText("Xem trước nhập Excel");
    expect(screen.getByText(/thiếu 'Ngày bắt đầu'/)).toBeInTheDocument();
  });
});
