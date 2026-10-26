import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import MembersPage from "../MembersPage";
import api from "../../lib/api";

const mockCan = vi.fn();

vi.mock("../../hooks/usePermission", () => ({
  usePermission: () => ({
    can: mockCan,
  }),
}));

vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

function renderMembersPage(initialEntry = "/members") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/members" element={<MembersPage user={{ id: 1, role: "ban_quan_ly" }} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("MembersPage - Tab Separation (Thành viên & Tổ đội)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "101");
    mockCan.mockReturnValue(true);

    api.get.mockImplementation((url) => {
      if (url.includes("/members")) {
        return Promise.resolve({
          data: {
            members: [
              { id: 1, name: "Nguyen Van A", email: "a@cong-truong.vn", role: "chi_huy_truong" },
              { id: 2, name: "Tran Van B", email: "b@cong-truong.vn", role: "doi_truong" },
            ],
            invitations: [],
          },
        });
      }
      if (url.includes("/teams")) {
        return Promise.resolve({
          data: {
            teams: [
              { id: 10, name: "Đội thi công số 1", member_count: 5 },
            ],
          },
        });
      }
      if (url.includes("/categories")) {
        return Promise.resolve({
          data: [],
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it("mặc định hiển thị tab Thành viên dự án với bảng thành viên và nút Mời thành viên", async () => {
    renderMembersPage("/members");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Thành viên dự án" })).toBeInTheDocument();
    });

    // Banner hiển thị nút mời thành viên
    expect(screen.getByRole("button", { name: /Mời thành viên mới/i })).toBeInTheDocument();
    
    // Kiểm tra thành viên hiển thị (cả desktop và mobile)
    await waitFor(() => {
      expect(screen.getAllByText("Nguyen Van A")[0]).toBeInTheDocument();
    });

    // Mục quản lý tổ đội thi công không được hiển thị ở tab này
    expect(screen.queryByRole("heading", { name: "Quản lý tổ đội thi công" })).not.toBeInTheDocument();
  });

  it("chuyển sang tab Tổ đội thi công khi bấm nút tab Tổ đội thi công", async () => {
    renderMembersPage("/members");

    await waitFor(() => {
      expect(screen.getAllByText("Nguyen Van A")[0]).toBeInTheDocument();
    });

    const teamsTabBtn = screen.getByTestId("tab-btn-teams");
    fireEvent.click(teamsTabBtn);

    // Banner đổi thành tiêu đề tổ đội và nút tạo tổ đội
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tổ đội thi công" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Tạo tổ đội/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Quản lý tổ đội thi công" })).toBeInTheDocument();
    });

    // Bảng thành viên dự án bị ẩn
    expect(screen.queryByText("Nguyen Van A")).not.toBeInTheDocument();
  });

  it("mở thẳng tab Tổ đội thi công khi có query param ?tab=teams", async () => {
    renderMembersPage("/members?tab=teams");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Tổ đội thi công" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Tạo tổ đội/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Quản lý tổ đội thi công" })).toBeInTheDocument();
    });

    expect(screen.queryByText("Nguyen Van A")).not.toBeInTheDocument();
  });

  it("quay lại tab Thành viên dự án khi bấm nút tab Thành viên dự án", async () => {
    renderMembersPage("/members?tab=teams");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Quản lý tổ đội thi công" })).toBeInTheDocument();
    });

    // Chuyển lại về thành viên
    const membersTabBtn = screen.getByTestId("tab-btn-members");
    fireEvent.click(membersTabBtn);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Thành viên dự án" })).toBeInTheDocument();
      expect(screen.getAllByText("Nguyen Van A")[0]).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: "Quản lý tổ đội thi công" })).not.toBeInTheDocument();
  });
});
