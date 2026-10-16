import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { BrowserRouter } from "react-router-dom";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from "../../lib/api";
import PaymentRequestsPage from "../PaymentRequestsPage.jsx";
import { formatVND } from "../../utils/decimal";

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

const mockListResponse = [
  {
    id: 1,
    project_id: 1,
    period_start: "2026-10-01",
    period_end: "2026-10-15",
    status: "DRAFT",
    total_amount: "15432088.00",
    created_by: 2,
    creator_name: "Kỹ sư Nguyễn Văn A",
    created_at: "2026-10-16T08:00:00Z",
    updated_at: "2026-10-16T08:00:00Z",
    acceptance_count: 2,
    line_count: 2,
  },
  {
    id: 2,
    project_id: 1,
    period_start: "2026-09-15",
    period_end: "2026-09-30",
    status: "APPROVED",
    total_amount: "50000000.00",
    created_by: 2,
    creator_name: "Kỹ sư Nguyễn Văn A",
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-02T08:00:00Z",
    acceptance_count: 1,
    line_count: 1,
  },
  {
    id: 3,
    project_id: 1,
    period_start: "2026-09-01",
    period_end: "2026-09-14",
    status: "RETURNED",
    total_amount: "12345000.00",
    created_by: 2,
    creator_name: "Kỹ sư Nguyễn Văn A",
    created_at: "2026-09-15T08:00:00Z",
    updated_at: "2026-09-16T08:00:00Z",
    acceptance_count: 1,
    line_count: 1,
  },
];

const mockDetailResponse = {
  id: 1,
  project_id: 1,
  period_start: "2026-10-01",
  period_end: "2026-10-15",
  status: "DRAFT",
  total_amount: "15432088.00", // Giá trị viết cứng từ API theo yêu cầu
  created_by: 2,
  creator_name: "Kỹ sư Nguyễn Văn A",
  created_at: "2026-10-16T08:00:00Z",
  updated_at: "2026-10-16T08:00:00Z",
  acceptances: [
    {
      id: 1,
      acceptance_id: 101,
      batch_name: "Nghiệm thu đợt 1 - Móng",
      voucher_status: "APPROVED",
    },
    {
      id: 2,
      acceptance_id: 102,
      batch_name: "Nghiệm thu đợt 2 - Thân",
      voucher_status: "APPROVED",
    },
  ],
  lines: [
    {
      id: 10,
      acceptance_id: 101,
      acceptance_batch_name: "Nghiệm thu đợt 1 - Móng",
      work_item_id: 50,
      work_item_code: "CV-01",
      work_item_name: "Đào đất móng",
      unit: "m3",
      quantity: "100.000",
      unit_price: "100000.00",
      amount: "10000000.00",
      created_at: "2026-10-16T08:00:00Z",
    },
    {
      id: 11,
      acceptance_id: 102,
      acceptance_batch_name: "Nghiệm thu đợt 2 - Thân",
      work_item_id: 51,
      work_item_code: "CV-02",
      work_item_name: "Bê tông dầm sàn",
      unit: "m3",
      quantity: "5.432",
      unit_price: "1000016.20",
      amount: "5432088.00",
      created_at: "2026-10-16T08:00:00Z",
    },
  ],
};

describe("T-113: PaymentRequestsPage Unit & Component Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");
  });

  afterEach(() => {
    cleanup();
  });

  // 1. Kiểm tra định dạng tiền tệ Việt Nam (15432088 -> "15.432.088 ₫")
  describe("Quy tắc định dạng tiền tệ Việt Nam (formatVND)", () => {
    test("Định dạng số nguyên và chuỗi decimal: 15432088 -> '15.432.088 ₫'", () => {
      expect(formatVND("15432088")).toBe("15.432.088 ₫");
      expect(formatVND("15432088.00")).toBe("15.432.088 ₫");
    });

    test("Định dạng không làm tròn sai số, không dùng float gây mất chữ số", () => {
      expect(formatVND("50000000.00")).toBe("50.000.000 ₫");
      expect(formatVND("0")).toBe("0 ₫");
      expect(formatVND(null)).toBe("—");
      expect(formatVND(undefined)).toBe("—");
      expect(formatVND("")).toBe("—");
    });
  });

  // 2. Trạng thái Đang tải (Loading)
  test("Hiển thị trạng thái đang tải trong khi gọi API", () => {
    api.get.mockReturnValue(new Promise(() => {})); // Treo promise để giữ trạng thái loading
    renderWithRouter(<PaymentRequestsPage />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Đang tải danh sách đề nghị thanh toán...")).toBeInTheDocument();
  });

  // 3. Trạng thái Rỗng (Empty)
  test("Hiển thị thông báo rỗng khi chưa có đề nghị thanh toán nào", async () => {
    api.get.mockResolvedValueOnce({ data: { payment_requests: [] } });
    renderWithRouter(<PaymentRequestsPage />);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Chưa có đề nghị thanh toán nào")).toBeInTheDocument();
  });

  // 4. Trạng thái Lỗi kèm nút Thử lại (Error & Retry)
  test("Hiển thị thông báo lỗi và bấm nút 'Thử lại' để tải lại dữ liệu", async () => {
    api.get.mockRejectedValueOnce({
      response: { status: 500, data: { message: "Lỗi máy chủ cơ sở dữ liệu" } },
    });

    renderWithRouter(<PaymentRequestsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText("Lỗi tải dữ liệu")).toBeInTheDocument();
    expect(screen.getByText("Lỗi máy chủ cơ sở dữ liệu")).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /Thử lại/i });
    expect(retryBtn).toBeInTheDocument();

    // Giả lập lần gọi thứ 2 thành công
    api.get.mockResolvedValueOnce({ data: { payment_requests: mockListResponse } });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.queryByText("Lỗi tải dữ liệu")).not.toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  // 5. Trạng thái 403 Forbidden (Không đủ quyền)
  test("Hiển thị thông báo không đủ quyền khi API trả về 403 Forbidden", async () => {
    api.get.mockRejectedValueOnce({
      response: { status: 403, data: { message: "Chỉ ban quản lý hoặc chủ đầu tư mới có quyền xem" } },
    });

    renderWithRouter(<PaymentRequestsPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText("Không đủ quyền truy cập")).toBeInTheDocument();
    expect(
      screen.getByText(/Bạn không có quyền xem đề nghị thanh toán của dự án này/i)
    ).toBeInTheDocument();
  });

  // 6. Hiển thị danh sách đề nghị: Kỳ, Trạng thái bằng chữ, Tổng cộng, Ngày tạo
  test("Hiển thị danh sách đề nghị đúng trạng thái bằng chữ và số tiền định dạng chuẩn", async () => {
    api.get.mockResolvedValueOnce({ data: { payment_requests: mockListResponse } });
    renderWithRouter(<PaymentRequestsPage />);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    // Trạng thái hiển thị bằng CHỮ (không chỉ bằng màu sắc)
    expect(screen.getAllByText("Bản nháp").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Đã duyệt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Bị trả lại").length).toBeGreaterThan(0);

    // Tiền định dạng theo chuẩn tiền Việt Nam (dấu chấm ngăn nghìn, không số lẻ, ký hiệu ₫)
    expect(screen.getAllByText("15.432.088 ₫").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50.000.000 ₫").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12.345.000 ₫").length).toBeGreaterThan(0);

    // Ngày tạo định dạng DD/MM/YYYY
    expect(screen.getAllByText("16/10/2026").length).toBeGreaterThan(0);
  });

  // 7. Bấm vào đề nghị mở chi tiết và kiểm tra dữ liệu dòng + Tổng cộng khớp đúng API
  test("Bấm vào đề nghị mở chi tiết, hiển thị đúng các dòng và tổng cộng bằng đúng số từ API", async () => {
    api.get
      .mockResolvedValueOnce({ data: { payment_requests: mockListResponse } }) // GET list
      .mockResolvedValueOnce({ data: { payment_request: mockDetailResponse } }); // GET detail

    renderWithRouter(<PaymentRequestsPage />);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    // Bấm nút "Chi tiết" hoặc dòng đầu tiên
    const detailBtns = screen.getAllByRole("button", { name: /Chi tiết/i });
    fireEvent.click(detailBtns[0]);

    // Kiểm tra API chi tiết được gọi đúng endpoint
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/projects/1/payment-requests/1");
    });

    // Kiểm tra modal chi tiết được mở
    await waitFor(() => {
      expect(screen.getByText("Chi tiết đề nghị thanh toán")).toBeInTheDocument();
    });

    // Kiểm tra thông tin phần đầu: Kỳ, Trạng thái, Tổng cộng
    expect(screen.getAllByText("01/10/2026 – 15/10/2026").length).toBeGreaterThan(0);
    expect(screen.getByTestId("detail-total-amount")).toHaveTextContent("15.432.088 ₫");

    // Kiểm tra các dòng: Hạng mục, Khối lượng đợt, Đơn giá, Thành tiền
    expect(screen.getAllByText(/Đào đất móng/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bê tông dầm sàn/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("10.000.000 ₫").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5.432.088 ₫").length).toBeGreaterThan(0);

    // Kiểm tra hàng 'Tổng cộng': Hiển thị ĐÚNG giá trị API trả về ("15.432.088 ₫")
    // Không được tự cộng lại ở frontend
    const tableTotal = screen.getByTestId("table-detail-total-amount");
    expect(tableTotal).toHaveTextContent("15.432.088 ₫");

    // Kiểm tra đóng modal
    const closeBtn = screen.getByRole("button", { name: /Đóng/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText("Chi tiết các dòng thanh toán")).not.toBeInTheDocument();
    });
  });

  // 8. Kiểm tra Responsive màn hình hẹp (360px)
  test("Cấu trúc trang hỗ trợ màn hình hẹp 360px với các thẻ di động và cuộn ngang an toàn", async () => {
    api.get.mockResolvedValueOnce({ data: { payment_requests: mockListResponse } });
    const { container } = renderWithRouter(<PaymentRequestsPage />);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    // Kiểm tra lớp hiển thị thẻ mobile (sm:hidden) và bảng desktop (hidden sm:block)
    const mobileContainer = container.querySelector(".sm\\:hidden");
    expect(mobileContainer).not.toBeNull();

    const desktopContainer = container.querySelector(".hidden.sm\\:block");
    expect(desktopContainer).not.toBeNull();

    // Kiểm tra cuộn ngang bảo đảm responsive không vỡ layout
    const overflowAutoElements = container.querySelectorAll(".overflow-x-auto");
    expect(overflowAutoElements.length).toBeGreaterThan(0);
  });
});
