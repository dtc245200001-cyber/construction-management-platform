import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from "../../lib/api";
import AcceptancePage from "../AcceptancePage.jsx";

const mockVouchers = [
  {
    id: 1,
    batch_name: "Nghiệm thu đợt 1 - Cọc móng",
    status: "approved",
    has_negative_delta: false,
    created_by: 2,
    created_by_name: "Kỹ sư Nam",
    created_at: "2026-10-10T08:00:00Z",
    updated_at: "2026-10-10T08:00:00Z",
    item_count: 2,
    photo_count: 3,
  },
  {
    id: 2,
    batch_name: "Nghiệm thu đợt 2 - Đài móng",
    status: "draft",
    has_negative_delta: true,
    created_by: 2,
    created_by_name: "Kỹ sư Nam",
    created_at: "2026-10-11T09:00:00Z",
    updated_at: "2026-10-11T09:00:00Z",
    item_count: 1,
    photo_count: 0,
  },
];

const mockItemsSummary = [
  {
    id: 101,
    parent_id: 1,
    code: "HM-01",
    name: "Ép cọc bê tông",
    unit: "cọc",
    contract_quantity: "50.000",
    prev_approved_cumulative: "20.000",
    team_reported_quantity: "25.000",
  },
  {
    id: 102,
    parent_id: 1,
    code: "HM-02",
    name: "Bê tông lót móng",
    unit: "m3",
    contract_quantity: "30.000",
    prev_approved_cumulative: "10.000",
    team_reported_quantity: "15.000",
  },
];

describe("AcceptancePage Component (S-36 / T-92)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");
  });

  test("TC-UI-1: Hiển thị danh sách phiếu và cảnh báo đợt âm nếu có", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/acceptance-vouchers")) {
        return Promise.resolve({ data: { vouchers: mockVouchers } });
      }
      if (url === "/projects/1") {
        return Promise.resolve({ data: { membership: "ky_su_giam_sat" } });
      }
      return Promise.reject(new Error("not found"));
    });

    render(<AcceptancePage user={{ id: 2, name: "Kỹ sư Nam" }} />);

    // Chờ tải xong danh sách
    await waitFor(() => {
      expect(screen.getByText("Nghiệm thu đợt 1 - Cọc móng")).toBeInTheDocument();
      expect(screen.getByText("Nghiệm thu đợt 2 - Đài móng")).toBeInTheDocument();
    });

    // Phiếu 1 đã duyệt
    expect(screen.getByText("Đã duyệt")).toBeInTheDocument();
    // Phiếu 2 có cờ cảnh báo đợt âm
    expect(screen.getByText("Có đợt âm")).toBeInTheDocument();
  });

  test("TC-UI-2: Vai trò khác không truy cập được chức năng nghiệm thu", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/acceptance-vouchers")) {
        return Promise.resolve({ data: { vouchers: [] } });
      }
      if (url === "/projects/1") {
        return Promise.resolve({ data: { membership: "doi_truong" } });
      }
      return Promise.reject(new Error("not found"));
    });

    render(<AcceptancePage user={{ id: 3, name: "Đội trưởng Hải" }} />);

    await waitFor(() => {
      expect(
        screen.getByText(/không có quyền truy cập chức năng nghiệm thu/i)
      ).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  test("TC-UI-3: Mở modal lập phiếu, hiển thị số đội báo S-26 và tự tính đợt", async () => {
    const user = userEvent.setup();

    api.get.mockImplementation((url) => {
      if (url.includes("/items-summary")) {
        return Promise.resolve({ data: { items: mockItemsSummary } });
      }
      if (url.includes("/acceptance-vouchers")) {
        return Promise.resolve({ data: { vouchers: [] } });
      }
      if (url === "/projects/1") {
        return Promise.resolve({ data: { membership: "ky_su_giam_sat" } });
      }
      return Promise.reject(new Error("not found"));
    });

    render(<AcceptancePage user={{ id: 2, name: "Kỹ sư Nam" }} />);

    // Bấm nút lập phiếu
    const createBtn = await screen.findByRole("button", { name: /Lập phiếu nghiệm thu/i });
    await user.click(createBtn);

    // Kiểm tra modal mở ra và hiển thị danh sách hạng mục
    await waitFor(() => {
      expect(screen.getByText(/Ép cọc bê tông/)).toBeInTheDocument();
      expect(screen.getByText(/Bê tông lót móng/)).toBeInTheDocument();
    });

    // Số đội báo từ S-26 hiển thị cạnh hạng mục để đối chiếu
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();

    // Nhập luỹ kế mới cho hạng mục 101: 30 (trước đó là 20) -> delta = +10
    const inputs = screen.getAllByPlaceholderText("Nhập luỹ kế...");
    await user.type(inputs[0], "30");

    // Khối lượng đợt tự tính hiển thị +10
    await waitFor(() => {
      expect(screen.getByText("+10")).toBeInTheDocument();
    });
  });

  test("TC-UI-4: Cảnh báo khi đợt âm (luỹ kế mới < luỹ kế đã duyệt)", async () => {
    const user = userEvent.setup();

    api.get.mockImplementation((url) => {
      if (url.includes("/items-summary")) {
        return Promise.resolve({ data: { items: mockItemsSummary } });
      }
      if (url.includes("/acceptance-vouchers")) {
        return Promise.resolve({ data: { vouchers: [] } });
      }
      if (url === "/projects/1") {
        return Promise.resolve({ data: { membership: "ky_su_giam_sat" } });
      }
      return Promise.reject(new Error("not found"));
    });

    render(<AcceptancePage user={{ id: 2, name: "Kỹ sư Nam" }} />);

    const createBtn = await screen.findByRole("button", { name: /Lập phiếu nghiệm thu/i });
    await user.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ép cọc bê tông/)).toBeInTheDocument();
    });

    // Nhập luỹ kế mới = 15 cho hạng mục 101 (đã duyệt là 20) -> delta = -5 (ÂM)
    const inputs = screen.getAllByPlaceholderText("Nhập luỹ kế...");
    await user.type(inputs[0], "15");

    // Phải hiển thị cảnh báo đợt âm
    await waitFor(() => {
      expect(screen.getByText("-5")).toBeInTheDocument();
      expect(
        screen.getByText(/Cảnh báo đợt âm \(luỹ kế mới nhỏ hơn luỹ kế đã duyệt gần nhất\)/i)
      ).toBeInTheDocument();
    });
  });

  test("TC-UI-5: Tạo phiếu thành công gửi request đúng lên server", async () => {
    const user = userEvent.setup();

    api.get.mockImplementation((url) => {
      if (url.includes("/items-summary")) {
        return Promise.resolve({ data: { items: mockItemsSummary } });
      }
      if (url.includes("/acceptance-vouchers")) {
        return Promise.resolve({ data: { vouchers: [] } });
      }
      if (url === "/projects/1") {
        return Promise.resolve({ data: { membership: "ky_su_giam_sat" } });
      }
      return Promise.reject(new Error("not found"));
    });

    api.post.mockResolvedValueOnce({
      data: {
        voucher: { id: 10, batch_name: "Đợt 3 test", status: "draft" },
        items: [],
      },
    });

    render(<AcceptancePage user={{ id: 2, name: "Kỹ sư Nam" }} />);

    const createBtn = await screen.findByRole("button", { name: /Lập phiếu nghiệm thu/i });
    await user.click(createBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ép cọc bê tông/)).toBeInTheDocument();
    });

    // Nhập tên đợt
    const nameInput = screen.getByLabelText(/Tên đợt nghiệm thu/i);
    await user.type(nameInput, "Đợt 3 test");

    // Nhập luỹ kế
    const inputs = screen.getAllByPlaceholderText("Nhập luỹ kế...");
    await user.type(inputs[0], "35");

    // Bấm nút tạo phiếu
    const submitBtn = screen.getByRole("button", { name: /Tạo phiếu nghiệm thu nháp/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/1/acceptance-vouchers",
        {
          batch_name: "Đợt 3 test",
          items: [
            {
              work_item_id: 101,
              cumulative_quantity: "35",
            },
          ],
        }
      );
    });
  });
});
