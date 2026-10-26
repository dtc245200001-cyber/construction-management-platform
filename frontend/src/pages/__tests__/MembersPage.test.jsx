import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import api from "../../lib/api";
import MembersPage from "../MembersPage";
import * as permissionHook from "../../hooks/usePermission";

vi.mock("../../lib/api");

const mockMembers = [
  {
    id: 1,
    name: "Nguyễn Văn Quản Lý",
    email: "quanly@ct360.vn",
    role: "ban_quan_ly",
    locked_until: null,
    failed_login_attempts: 0,
  },
  {
    id: 2,
    name: "Trần Đội Trưởng",
    email: "doitruong@ct360.vn",
    role: "doi_truong",
    locked_until: null,
    failed_login_attempts: 0,
  },
  {
    id: 3,
    name: "Lê Kỹ Sư",
    email: "kysu@ct360.vn",
    role: "ky_su_giam_sat",
    locked_until: "2099-01-01T00:00:00.000Z", // Locked
    failed_login_attempts: 5,
  },
];

const mockInvitations = [
  {
    id: 10,
    email: "choidoi@ct360.vn",
    role: "doi_truong",
    is_expired: false,
    email_status: "sent",
  },
];

const mockTeams = [
  {
    id: 101,
    name: "Đội Thi Công Số 1",
    member_count: 2,
  },
  {
    id: 102,
    name: "Đội Thi Công Số 2",
    member_count: 0,
  },
];

const mockTasks = [
  {
    type: "task",
    task_id: 201,
    name: "Đổ bê tông sàn tầng 1",
    status: "in_progress",
    start_date: "2026-10-25",
    is_critical: true,
  },
];

describe("MembersPage - Unified Members & Teams layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");

    // Mock API calls
    api.get.mockImplementation((url) => {
      if (url === "/projects/1/members") {
        return Promise.resolve({
          data: {
            members: mockMembers,
            invitations: mockInvitations,
          },
        });
      }
      if (url === "/projects/1/teams") {
        return Promise.resolve({
          data: {
            teams: mockTeams,
          },
        });
      }
      if (url === "/categories/1/tree/all") {
        return Promise.resolve({
          data: mockTasks,
        });
      }
      if (url === "/projects/1/teams/101/members") {
        return Promise.resolve({
          data: {
            members: [
              { user_id: 2, name: "Trần Đội Trưởng", email: "doitruong@ct360.vn" },
            ],
          },
        });
      }
      if (url === "/projects/1/teams/101/tasks") {
        return Promise.resolve({
          data: {
            tasks: [
              {
                task_id: 201,
                name: "Đổ bê tông sàn tầng 1",
                work_item_name: "Kết cấu",
                planned_quantity: "150.00",
                quantity_unit: "m3",
                is_critical: true,
              },
            ],
          },
        });
      }
      if (url === "/projects/1/teams/101/workload") {
        return Promise.resolve({
          data: {
            workload: {
              is_overloaded: false,
              max_concurrent: 1,
            },
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    // Default permissions: allow all
    vi.spyOn(permissionHook, "usePermission").mockReturnValue({
      role: "ban_quan_ly",
      loading: false,
      can: (perm) => true,
      canRoute: () => true,
      defaultRoute: "/members",
    });
  });

  it("1. Hiển thị khung giao diện thống nhất với tab Thành viên và Tổ đội", async () => {
    render(<MembersPage user={{ id: 1, email: "quanly@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getByText("Thành viên dự án")).toBeInTheDocument();
      expect(screen.getByText("Tổ đội thi công")).toBeInTheDocument();
    });

    // Tổng số người hiển thị trên badge và tổng cộng: 3 thành viên + 1 lời mời = 4
    expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1);
    // Tổng số đội trên badge: 2 đội
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("2. Mặc định ở tab Thành viên, hiển thị danh sách thành viên và tìm kiếm hoạt động", async () => {
    render(<MembersPage user={{ id: 1, email: "quanly@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getAllByText("Nguyễn Văn Quản Lý").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Trần Đội Trưởng").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Lê Kỹ Sư").length).toBeGreaterThan(0);
      expect(screen.getAllByText("choidoi@ct360.vn").length).toBeGreaterThan(0);
    });

    // Tìm kiếm
    const searchInput = screen.getByPlaceholderText("Tìm kiếm theo tên hoặc email...");
    fireEvent.change(searchInput, { target: { value: "Trần Đội" } });

    expect(screen.getAllByText("Trần Đội Trưởng").length).toBeGreaterThan(0);
    expect(screen.queryByText("Nguyễn Văn Quản Lý")).not.toBeInTheDocument();
  });

  it("3. Chuyển sang tab Tổ đội hiển thị chức năng tạo đội, chọn đội và phân công việc", async () => {
    render(<MembersPage user={{ id: 1, email: "quanly@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getByText("Tổ đội thi công")).toBeInTheDocument();
    });

    // Click vào tab Tổ đội thi công
    fireEvent.click(screen.getByText("Tổ đội thi công"));

    // Hiển thị các khối của chức năng tổ đội
    expect(screen.getByText("1. Tạo đội thi công")).toBeInTheDocument();
    expect(screen.getByText("Đội đang quản lý")).toBeInTheDocument();
    expect(screen.getByText("3. Khối lượng kế hoạch & giao việc")).toBeInTheDocument();
  });

  it("4. Chuyển tab không gây mất dữ liệu người dùng đang nhập", async () => {
    render(<MembersPage user={{ id: 1, email: "quanly@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getByText("Tổ đội thi công")).toBeInTheDocument();
    });

    // Sang tab Tổ đội và nhập tên đội mới
    fireEvent.click(screen.getByText("Tổ đội thi công"));
    const teamInput = screen.getByPlaceholderText("VD: Đội thi công 1");
    fireEvent.change(teamInput, { target: { value: "Đội Điện Nước Mới" } });
    expect(teamInput.value).toBe("Đội Điện Nước Mới");

    // Chuyển lại tab Thành viên
    fireEvent.click(screen.getByText("Thành viên dự án"));
    const searchInput = screen.getByPlaceholderText("Tìm kiếm theo tên hoặc email...");
    fireEvent.change(searchInput, { target: { value: "Lê Kỹ" } });
    expect(searchInput.value).toBe("Lê Kỹ");

    // Quay lại tab Tổ đội: Dữ liệu tên đội vẫn được giữ nguyên vẹn
    fireEvent.click(screen.getByText("Tổ đội thi công"));
    expect(screen.getByPlaceholderText("VD: Đội thi công 1").value).toBe("Đội Điện Nước Mới");

    // Quay lại tab Thành viên: Dữ liệu tìm kiếm vẫn được giữ nguyên vẹn
    fireEvent.click(screen.getByText("Thành viên dự án"));
    expect(screen.getByPlaceholderText("Tìm kiếm theo tên hoặc email...").value).toBe("Lê Kỹ");
  });

  it("5. Người dùng không có quyền quản lý đội (can('team.manage') = false) chỉ thấy tab Thành viên", async () => {
    vi.spyOn(permissionHook, "usePermission").mockReturnValue({
      role: "doi_truong",
      loading: false,
      can: (perm) => perm !== "team.manage",
      canRoute: () => true,
      defaultRoute: "/members",
    });

    render(<MembersPage user={{ id: 2, email: "doitruong@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getByText("Thành viên dự án")).toBeInTheDocument();
    });

    // Tab Tổ đội thi công không xuất hiện
    expect(screen.queryByText("Tổ đội thi công")).not.toBeInTheDocument();
  });

  it("6. Mở modal Mời thành viên hoạt động bình thường", async () => {
    render(<MembersPage user={{ id: 1, email: "quanly@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Mời thành viên/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Mời thành viên/i }));

    expect(screen.getByText("Mời thành viên mới")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("VD: nv.a@cong-truong-360.vn")).toBeInTheDocument();
  });

  it("7. Tạo đội thi công gọi đúng API post", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        team: { id: 103, name: "Đội Mới Lập" },
      },
    });

    render(<MembersPage user={{ id: 1, email: "quanly@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getByText("Tổ đội thi công")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tổ đội thi công"));

    const teamInput = screen.getByPlaceholderText("VD: Đội thi công 1");
    fireEvent.change(teamInput, { target: { value: "Đội Mới Lập" } });

    fireEvent.click(screen.getByRole("button", { name: /Tạo đội/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/projects/1/teams", {
        name: "Đội Mới Lập",
      });
    });
  });

  it("8. Mở khóa tài khoản thành viên gọi đúng API unlock", async () => {
    api.post.mockResolvedValueOnce({ data: { message: "Unlocked" } });

    render(<MembersPage user={{ id: 1, email: "quanly@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getAllByText("Lê Kỹ Sư").length).toBeGreaterThan(0);
    });

    const unlockButtons = screen.getAllByRole("button", { name: /Mở khóa/i });
    expect(unlockButtons.length).toBeGreaterThan(0);

    fireEvent.click(unlockButtons[0]);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/projects/1/members/3/unlock");
    });
  });

  it("9. Gửi lại lời mời gọi đúng API resend", async () => {
    api.post.mockResolvedValueOnce({ data: { message: "Resent" } });

    render(<MembersPage user={{ id: 1, email: "quanly@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getAllByText("choidoi@ct360.vn").length).toBeGreaterThan(0);
    });

    const resendButtons = screen.getAllByRole("button", { name: /Gửi lại/i });
    expect(resendButtons.length).toBeGreaterThan(0);

    fireEvent.click(resendButtons[0]);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/projects/1/invitations/10/resend");
    });
  });

  it("10. Chọn đội thi công tải danh sách thành viên và công việc của đội", async () => {
    render(<MembersPage user={{ id: 1, email: "quanly@ct360.vn" }} />);

    await waitFor(() => {
      expect(screen.getByText("Tổ đội thi công")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tổ đội thi công"));

    // Chọn Đội Thi Công Số 1
    const teamSelect = screen.getByDisplayValue("-- Chọn đội --");
    fireEvent.change(teamSelect, { target: { value: "101" } });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/projects/1/teams/101/members");
      expect(api.get).toHaveBeenCalledWith("/projects/1/teams/101/tasks");
    });
  });
});

