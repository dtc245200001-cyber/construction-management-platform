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
    id: 10,
    batch_name: "Nghiệm thu phần thân đợt 1",
    status: "submitted",
    has_negative_delta: false,
    created_by: 2,
    created_by_name: "Kỹ sư Giám sát",
    created_at: "2026-10-15T08:00:00Z",
    updated_at: "2026-10-15T08:00:00Z",
    item_count: 1,
    photo_count: 3,
  },
];

const mockVoucherDetailWithGeofence = {
  voucher: {
    id: 10,
    batch_name: "Nghiệm thu phần thân đợt 1",
    status: "submitted",
    has_negative_delta: false,
    created_by: 2,
    created_by_name: "Kỹ sư Giám sát",
    created_at: "2026-10-15T08:00:00Z",
    site_radius_m: 100,
  },
  items: [
    {
      id: 1,
      work_item_id: 101,
      work_item_code: "HM-01",
      work_item_name: "Cột tầng 1",
      cumulative_quantity: "50",
      prev_approved_cumulative: "20",
      delta_quantity: "30",
      unit: "m3",
    },
  ],
  photos: [
    {
      id: 501,
      file_name: "outside_site.jpg",
      url: "/photos/501",
      geofence_status: "outside",
      geofence_distance_m: 133.4,
      radius_m: 100,
    },
    {
      id: 502,
      file_name: "inside_site.jpg",
      url: "/photos/502",
      geofence_status: "inside",
      geofence_distance_m: 89.0,
      radius_m: 100,
    },
    {
      id: 503,
      file_name: "no_gps_photo.jpg",
      url: "/photos/503",
      geofence_status: "no_gps",
      geofence_distance_m: null,
      radius_m: 100,
    },
  ],
  photo_flags: {
    total: 3,
    inside: 1,
    outside: 1,
    no_gps: 1,
    no_site_config: 0,
  },
};

describe("AcceptancePage Geofence Warnings (Story S-41 / T-108)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");
  });

  test("Hiển thị banner cảnh báo ngoài phạm vi và badge khoảng cách trên từng ảnh", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/summary")) {
        return Promise.resolve({ data: [] });
      }
      if (url.endsWith("/acceptance-vouchers")) {
        return Promise.resolve({ data: { vouchers: mockVouchers } });
      }
      if (url.includes("/acceptance-vouchers/10")) {
        return Promise.resolve({ data: mockVoucherDetailWithGeofence });
      }
      if (url.match(/\/projects\/\d+$/)) {
        return Promise.resolve({ data: { membership: "chu_dau_tu" } });
      }
      return Promise.reject(new Error("Not found"));
    });

    render(<AcceptancePage user={{ id: 1, role: "chu_dau_tu" }} />);

    // Chờ danh sách phiếu tải xong
    await waitFor(() => {
      expect(screen.getByText("Nghiệm thu phần thân đợt 1")).toBeInTheDocument();
    });

    // Mở xem chi tiết phiếu
    const detailBtn = screen.getByRole("button", { name: /chi tiết/i });
    fireEvent.click(detailBtn);

    // Kiểm tra banner cảnh báo ngoài phạm vi
    await waitFor(() => {
      expect(screen.getByTestId("geofence-warning-banner")).toBeInTheDocument();
      expect(screen.getByText(/Phát hiện 1 ảnh chụp ngoài bán kính công trường/i)).toBeInTheDocument();
    });

    // Kiểm tra badge trên từng ảnh
    expect(screen.getByTestId("geofence-badge-501")).toHaveTextContent("Ngoài phạm vi (133,4 m)");
    expect(screen.getByTestId("geofence-badge-502")).toHaveTextContent("Đúng vị trí (89 m)");
    expect(screen.getByTestId("geofence-badge-503")).toHaveTextContent("Không có GPS");
  });
});
