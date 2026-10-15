import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import AcceptancePage from "../AcceptancePage.jsx";
import api from "../../lib/api";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockVouchers = [
  {
    id: 20,
    batch_name: "Nghiệm thu khối xây tầng 2 đợt 1",
    status: "pending_review",
    has_negative_delta: false,
    created_by: 2,
    created_by_name: "Kỹ sư Giám sát",
    created_at: "2026-10-15T08:00:00Z",
    updated_at: "2026-10-15T08:00:00Z",
    item_count: 1,
    photo_count: 4,
  },
];

const mockVoucherDetailWithInspection = {
  voucher: {
    id: 20,
    batch_name: "Nghiệm thu khối xây tầng 2 đợt 1",
    status: "pending_review",
    has_negative_delta: false,
    created_by: 2,
    created_by_name: "Kỹ sư Giám sát",
    created_at: "2026-10-15T08:00:00Z",
  },
  items: [
    {
      id: 1,
      work_item_id: 201,
      work_item_code: "HM-02",
      work_item_name: "Tường xây 220",
      cumulative_quantity: "80",
      prev_approved_cumulative: "30",
      delta_quantity: "50",
      unit: "m2",
    },
  ],
  photos: [
    {
      id: 601,
      file_name: "screenshot_photo.png",
      url: "/photos/601",
      geofence_status: "inside",
      geofence_distance_m: 25.0,
      inspection_status: "warning",
      inspection: {
        status: "warning",
        warnings: [
          {
            code: "SCREENSHOT_DETECTED",
            severity: "high",
            title: "Nghi vấn ảnh chụp lại màn hình",
            reason: "Kích thước 1080x2400 (tỷ lệ 9:20) đặc trưng màn hình điện thoại.",
          },
        ],
      },
    },
    {
      id: 602,
      file_name: "valid_camera_photo.jpg",
      url: "/photos/602",
      geofence_status: "inside",
      geofence_distance_m: 30.0,
      inspection_status: "clean",
      inspection: {
        status: "clean",
        warnings: [],
      },
    },
    {
      id: 603,
      file_name: "stripped_metadata_photo.jpg",
      url: "/photos/603",
      geofence_status: "no_gps",
      geofence_distance_m: null,
      inspection_status: "incomplete_data",
      inspection: {
        status: "incomplete_data",
        warnings: [],
      },
    },
    {
      id: 604,
      file_name: "corrupted_file.jpg",
      url: "/photos/604",
      geofence_status: "no_gps",
      geofence_distance_m: null,
      inspection_status: "error",
      inspection: {
        status: "error",
        warnings: [
          {
            code: "FILE_CORRUPTED",
            severity: "high",
            title: "Tệp ảnh bị hỏng",
          },
        ],
      },
    },
  ],
  photo_flags: {
    total: 4,
    inside: 2,
    outside: 0,
    no_gps: 2,
    no_site_config: 0,
    anomalies_count: 1,
    clean_count: 1,
    incomplete_count: 1,
    error_count: 1,
  },
};

describe("AcceptancePage Evidence Inspection (Story S-42 / T-110)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");
  });

  test("Hiển thị banner cảnh báo bất thường và badge tương ứng trên từng ảnh", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/summary")) {
        return Promise.resolve({ data: [] });
      }
      if (url.endsWith("/acceptance-vouchers")) {
        return Promise.resolve({ data: { vouchers: mockVouchers } });
      }
      if (url.includes("/acceptance-vouchers/20")) {
        return Promise.resolve({ data: mockVoucherDetailWithInspection });
      }
      if (url.match(/\/projects\/\d+$/)) {
        return Promise.resolve({ data: { membership: "ban_quan_ly" } });
      }
      return Promise.reject(new Error("Not found"));
    });

    render(<AcceptancePage user={{ id: 1, is_system_admin: true }} />);

    // Chờ danh sách phiếu hiển thị
    await waitFor(() => {
      expect(
        screen.getByText("Nghiệm thu khối xây tầng 2 đợt 1")
      ).toBeInTheDocument();
    });

    // Mở chi tiết phiếu nghiệm thu
    const detailBtns = screen.getAllByRole("button", { name: /chi tiết/i });
    fireEvent.click(detailBtns[0]);

    // 1. Kiểm tra banner cảnh báo bất thường bằng chứng ảnh
    await waitFor(() => {
      expect(screen.getByTestId("evidence-anomaly-banner")).toBeInTheDocument();
      expect(
        screen.getByText(/Phát hiện 1 ảnh có dấu hiệu nghi vấn/i)
      ).toBeInTheDocument();
    });

    // 2. Kiểm tra badges kiểm tra bằng chứng trên từng ảnh
    // Ảnh 601: Warning (Screenshot)
    expect(screen.getByTestId("evidence-badge-601")).toHaveTextContent(
      "Nghi vấn ảnh chụp lại màn hình"
    );

    // Ảnh 602: Clean
    expect(screen.getByTestId("evidence-badge-602")).toHaveTextContent(
      "Bằng chứng bình thường"
    );

    // Ảnh 603: Incomplete data
    expect(screen.getByTestId("evidence-badge-603")).toHaveTextContent(
      "Dữ liệu không đầy đủ"
    );

    // Ảnh 604: Error
    expect(screen.getByTestId("evidence-badge-604")).toHaveTextContent(
      "Lỗi kiểm tra tệp"
    );
  });

  test("Hiển thị cảnh báo nhắc nhở phi ngăn chặn trong dialog duyệt phiếu", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/summary")) {
        return Promise.resolve({ data: [] });
      }
      if (url.endsWith("/acceptance-vouchers")) {
        return Promise.resolve({ data: { vouchers: mockVouchers } });
      }
      if (url.includes("/acceptance-vouchers/20")) {
        return Promise.resolve({ data: mockVoucherDetailWithInspection });
      }
      if (url.match(/\/projects\/\d+$/)) {
        return Promise.resolve({ data: { membership: "ban_quan_ly" } });
      }
      return Promise.reject(new Error("Not found"));
    });

    api.post.mockResolvedValueOnce({
      data: {
        message: "Đã duyệt phiếu nghiệm thu",
        voucher: { id: 20, status: "approved" },
      },
    });

    render(<AcceptancePage user={{ id: 1, is_system_admin: true }} />);

    // Mở xem chi tiết trước để nạp photo_flags
    await waitFor(() => {
      expect(
        screen.getByText("Nghiệm thu khối xây tầng 2 đợt 1")
      ).toBeInTheDocument();
    });

    const detailBtns = screen.getAllByRole("button", { name: /chi tiết/i });
    fireEvent.click(detailBtns[0]);

    await waitFor(() => {
      expect(screen.getByTestId("evidence-anomaly-banner")).toBeInTheDocument();
    });

    // Đóng detail dialog
    const closeBtn = screen.getByRole("button", { name: "Đóng" });
    fireEvent.click(closeBtn);

    // Bấm Duyệt từ danh sách
    const approveBtns = screen.getAllByRole("button", { name: /duyệt/i });
    fireEvent.click(approveBtns[0]);

    // Kiểm tra dialog xác nhận duyệt hiển thị cảnh báo nhắc nhở
    await waitFor(() => {
      expect(screen.getByTestId("approve-evidence-warning")).toBeInTheDocument();
      expect(
        screen.getByText(/Phiếu này có 1 ảnh có dấu hiệu cần xác minh/i)
      ).toBeInTheDocument();
    });

    // Xác nhận duyệt vẫn thực thi bình thường (không chặn duyệt)
    const confirmApproveBtn = screen.getByRole("button", {
      name: "Xác nhận duyệt",
    });
    fireEvent.click(confirmApproveBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining("/acceptance-vouchers/20/approve"),
        {}
      );
    });
  });

  test("Luồng mở và đóng Chi tiết ảnh trên trang nghiệm thu (X, Đóng, Escape, Preview)", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/summary")) {
        return Promise.resolve({ data: [] });
      }
      if (url.endsWith("/acceptance-vouchers")) {
        return Promise.resolve({ data: { vouchers: mockVouchers } });
      }
      if (url.includes("/acceptance-vouchers/20")) {
        return Promise.resolve({ data: mockVoucherDetailWithInspection });
      }
      if (url.match(/\/projects\/\d+$/)) {
        return Promise.resolve({ data: { membership: "ban_quan_ly" } });
      }
      if (url.includes("/photo-metadata/acceptance/")) {
        return Promise.resolve({
          data: {
            id: 601,
            file_name: "screenshot_photo.png",
            status: "warning",
            status_label: "Cần xác minh",
            inspection: {
              status: "warning",
              warnings: [
                {
                  code: "SCREENSHOT_DETECTED",
                  title: "Nghi vấn ảnh chụp lại màn hình",
                },
              ],
            },
          },
        });
      }
      return Promise.reject(new Error("Not found"));
    });

    render(<AcceptancePage user={{ id: 1, is_system_admin: true }} />);

    await waitFor(() => {
      expect(
        screen.getByText("Nghiệm thu khối xây tầng 2 đợt 1")
      ).toBeInTheDocument();
    });

    const detailBtns = screen.getAllByRole("button", { name: /chi tiết/i });
    fireEvent.click(detailBtns[0]);

    // Chờ danh sách ảnh hiển thị
    await waitFor(() => {
      expect(screen.getByTestId("photo-meta-btn-601")).toBeInTheDocument();
    });

    // 1. Bấm 'Thông tin ảnh' -> Mở Chi tiết ảnh
    fireEvent.click(screen.getByTestId("photo-meta-btn-601"));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Chi tiết ảnh" })
      ).toBeInTheDocument();
      expect(screen.getAllByText("screenshot_photo.png").length).toBeGreaterThanOrEqual(2);
    });

    // 2. Đóng bằng nút X
    fireEvent.click(screen.getByTestId("close-x-btn"));
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Chi tiết ảnh" })
      ).toBeNull();
    });

    // 3. Mở lại và đóng bằng nút Đóng
    fireEvent.click(screen.getByTestId("photo-meta-btn-601"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Chi tiết ảnh" })
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("close-panel-btn"));
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Chi tiết ảnh" })
      ).toBeNull();
    });

    // 4. Mở lại và đóng bằng phím Escape
    fireEvent.click(screen.getByTestId("photo-meta-btn-601"));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Chi tiết ảnh" })
      ).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Chi tiết ảnh" })
      ).toBeNull();
    });

    // 5. Bấm vào ảnh thẻ mở trực tiếp chế độ preview (phóng to ảnh)
    const photoImg = screen.getByAltText("screenshot_photo.png");
    fireEvent.click(photoImg);
    await waitFor(() => {
      expect(screen.getByTestId("close-preview-btn")).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Chi tiết ảnh" })
      ).toBeNull();
    });

    // Đóng preview không tự mở lại Chi tiết ảnh
    fireEvent.click(screen.getByTestId("close-preview-btn"));
    await waitFor(() => {
      expect(screen.queryByTestId("close-preview-btn")).toBeNull();
      expect(
        screen.queryByRole("heading", { name: "Chi tiết ảnh" })
      ).toBeNull();
    });
  });
});
