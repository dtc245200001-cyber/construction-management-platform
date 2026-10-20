import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { BrowserRouter } from "react-router-dom";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from "../../lib/api";
import BudgetPage from "../BudgetPage.jsx";

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

const mockTreeResponse = {
  project_id: 1,
  has_actual_costs: false,
  version: {
    id: 1,
    project_id: 1,
    version_number: 1,
    description: "Phiên bản dự toán ban đầu",
    created_by: 2,
    created_by_name: "Ban Quản Lý Dự Án",
    created_at: "2026-10-15T08:00:00Z",
  },
  project_total: "150000000.00",
  items: [
    {
      id: 1,
      parent_id: null,
      code: "HM-01",
      name: "Phần ngầm & Móng",
      is_leaf: false,
      amount: null,
      note: null,
      total_budget: "150000000.00",
    },
    {
      id: 2,
      parent_id: 1,
      code: "HM-01.01",
      name: "Đào đất móng",
      is_leaf: true,
      amount: "50000000.00",
      note: "Đào đất thủ công và cơ giới",
      total_budget: "50000000.00",
    },
    {
      id: 3,
      parent_id: 1,
      code: "HM-01.02",
      name: "Bê tông lót móng",
      is_leaf: true,
      amount: "100000000.00",
      note: "Bê tông mác 150",
      total_budget: "100000000.00",
    },
  ],
};

const mockVersionsResponse = {
  project_id: 1,
  has_actual_costs: false,
  versions: [
    {
      id: 1,
      project_id: 1,
      version_number: 1,
      description: "Phiên bản dự toán ban đầu",
      created_at: "2026-10-15T08:00:00Z",
      created_by_name: "Ban Quản Lý Dự Án",
      total_amount: "150000000.00",
      items_count: 2,
    },
  ],
};

describe("T-119: Giao diện nhập dự toán và cộng tổng theo cây (BudgetPage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");
    api.get.mockImplementation((url) => {
      if (url.includes("/budgets/tree")) {
        return Promise.resolve({ data: mockTreeResponse });
      }
      if (url.includes("/budgets")) {
        return Promise.resolve({ data: mockVersionsResponse });
      }
      return Promise.reject(new Error("Not found"));
    });
  });

  afterEach(() => {
    cleanup();
  });

  test("Hiển thị tiêu đề, thẻ tổng dự toán và cấu trúc cây WBS", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Dự toán chi phí theo hạng mục")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/150\.000\.000/)[0]).toBeInTheDocument();
    expect(screen.getByText("Phần ngầm & Móng")).toBeInTheDocument();
    expect(screen.getByText("Đào đất móng")).toBeInTheDocument();
    expect(screen.getByText("Bê tông lót móng")).toBeInTheDocument();
  });

  test("Hạng mục cha hiển thị nhãn 'Không nhập ở cha' và tổng cộng dồn từ con", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Không nhập ở cha")).toBeInTheDocument();
    });

    // Node cha không có nút "Nhập dự toán"
    const buttons = screen.getAllByRole("button", { name: /Nhập dự toán/i });
    // Chỉ có 2 nút cho 2 hạng mục lá
    expect(buttons).toHaveLength(2);
  });

  test("Hiển thị cảnh báo thực chi khi dự án đã phát sinh chi phí thực tế", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/budgets/tree")) {
        return Promise.resolve({
          data: {
            ...mockTreeResponse,
            has_actual_costs: true,
          },
        });
      }
      if (url.includes("/budgets")) {
        return Promise.resolve({
          data: {
            ...mockVersionsResponse,
            has_actual_costs: true,
          },
        });
      }
      return Promise.reject(new Error("Not found"));
    });

    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText(/Dự án đã phát sinh chi phí thực tế/i)).toBeInTheDocument();
    });
  });

  test("Mở modal nhập dự toán khi bấm nút ở hạng mục lá", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Đào đất móng")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole("button", { name: /Nhập dự toán/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Nhập dự toán cho hạng mục lá/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Số tiền dự toán \(VND\)/i)).toBeInTheDocument();
  });
});
