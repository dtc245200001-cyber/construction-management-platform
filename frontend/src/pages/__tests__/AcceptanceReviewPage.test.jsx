import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import api from "../../lib/api";
import AcceptancePage from "../AcceptancePage.jsx";

const pendingVoucher = {
  id: 98,
  batch_name: "Đợt nghiệm thu S-38",
  status: "pending_review",
  has_negative_delta: false,
  created_by: 12,
  created_by_name: "Kỹ sư Giám sát",
  created_at: "2026-10-14T07:00:00Z",
  item_count: 2,
  photo_count: 1,
};

function mockBaseGet(role = "ban_quan_ly") {
  api.get.mockImplementation((url) => {
    if (url === "/projects/1") {
      return Promise.resolve({ data: { membership: role } });
    }
    if (url === "/projects/1/acceptance-vouchers") {
      return Promise.resolve({ data: { vouchers: [pendingVoucher] } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
}

describe("S-38 / T-100 acceptance review UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");
    mockBaseGet();
  });

  test("Ban quản lý thấy danh sách chờ duyệt và nút Duyệt/Trả lại", async () => {
    render(<AcceptancePage user={{ id: 20, name: "Ban quản lý" }} />);

    expect(await screen.findByText("Phiếu chờ duyệt")).toBeInTheDocument();
    expect(screen.getByText(/#98 · Đợt nghiệm thu S-38/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Duyệt/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Trả lại/i }).length).toBeGreaterThan(0);
  });

  test("bấm Duyệt mở dialog và chỉ gọi API sau khi xác nhận", async () => {
    mockBaseGet("ban_quan_ly");
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      data: {
        message: "Đã duyệt phiếu nghiệm thu",
        voucher: { ...pendingVoucher, status: "approved" },
      },
    });

    render(<AcceptancePage user={{ id: 20, name: "Ban quản lý" }} />);
    const approveButtons = await screen.findAllByRole("button", { name: /^Duyệt$/i });
    await user.click(approveButtons[0]);

    expect(
      await screen.findByRole("heading", { name: /Xác nhận duyệt phiếu/i })
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Xác nhận duyệt/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/1/acceptance-vouchers/98/approve",
        {}
      );
    });
  });

  test("Chủ đầu tư không thấy nút Duyệt", async () => {
    mockBaseGet("chu_dau_tu");
    render(<AcceptancePage user={{ id: 21, name: "Chủ đầu tư" }} />);

    expect(await screen.findByText("Phiếu chờ duyệt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Duyệt$/i })).not.toBeInTheDocument();
  });

  test("Trả lại bắt buộc nhập lý do và gửi đúng reason", async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValueOnce({
      data: { message: "Đã trả lại phiếu nghiệm thu", voucher: { ...pendingVoucher, status: "returned" } },
    });

    render(<AcceptancePage user={{ id: 20, name: "Ban quản lý" }} />);
    const returnButtons = await screen.findAllByRole("button", { name: /Trả lại/i });
    await user.click(returnButtons[0]);

    expect(await screen.findByRole("heading", { name: /Trả lại phiếu nghiệm thu/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Xác nhận trả lại/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Bắt buộc nhập lý do/i);
    expect(api.post).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText(/Lý do trả lại/i),
      "Thiếu ảnh hiện trường và biên bản đối chiếu"
    );
    await user.click(screen.getByRole("button", { name: /Xác nhận trả lại/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/1/acceptance-vouchers/98/return",
        { reason: "Thiếu ảnh hiện trường và biên bản đối chiếu" }
      );
    });
  });
});
