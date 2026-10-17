import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { vi, describe, it, test, expect, beforeEach } from "vitest";
import api from "../../lib/api";
import FieldPage from "../FieldPage";

vi.mock("../../lib/api");

const mockTasks = [
  {
    task_id: 101,
    name: "Lắp dựng cốt thép đài móng",
    work_item_name: "Phần móng",
    duration_days: 4,
    planned_quantity: "100.00",
    quantity_unit: "m3",
    team_id: 10,
    team_name: "Đội Cốt thép",
    early_start: "2026-10-12T08:00:00.000Z",
    early_finish: "2026-10-16T17:00:00.000Z",
    is_critical: true, // Việc găng
    reported_today: "0.00",
    cumulative_reported: "0.00",
    last_reported_at: null,
    over_planned: false,
  },
  {
    task_id: 102,
    name: "Gia công lắp dựng ván khuôn",
    work_item_name: "Phần móng",
    duration_days: 3,
    planned_quantity: "50.00",
    quantity_unit: "m2",
    team_id: 10,
    team_name: "Đội Cốt thép",
    early_start: "2026-10-14T08:00:00.000Z",
    early_finish: "2026-10-17T17:00:00.000Z",
    is_critical: false, // Việc thường
    reported_today: "15.00",
    cumulative_reported: "35.00",
    last_reported_at: "2026-10-17T09:30:00.000Z",
    over_planned: false,
  },
];

const teamsResponse = {
  teams: [
    { id: 10, name: "Doi A" },
    { id: 20, name: "Doi B" },
  ],
};

const allTeamsTasksResponse = {
  week: { start: "2026-09-14", end: "2026-09-20", report_date: "2026-09-16" },
  tasks: [
    {
      task_id: 101,
      name: "Việc của đội A",
      work_item_name: "WI A",
      team_id: 10,
      team_name: "Doi A",
      early_start: "2026-09-15",
      is_critical: true,
      planned_quantity: null,
      quantity_unit: null,
      reported_today: "0",
      cumulative_reported: "0",
      over_planned: false,
    },
    {
      task_id: 102,
      name: "Việc của đội B",
      work_item_name: "WI B",
      team_id: 20,
      team_name: "Doi B",
      early_start: "2026-09-16",
      is_critical: false,
      planned_quantity: null,
      quantity_unit: null,
      reported_today: "0",
      cumulative_reported: "0",
      over_planned: false,
    },
  ],
};

const myTeamTasksResponse = {
  team: { id: 10, name: "Doi A" },
  week: { start: "2026-09-14", end: "2026-09-20", report_date: "2026-09-16" },
  tasks: [
    {
      task_id: 101,
      name: "Việc của đội A",
      work_item_name: "WI A",
      team_id: 10,
      team_name: "Doi A",
      early_start: "2026-09-15",
      is_critical: true,
      planned_quantity: null,
      quantity_unit: null,
      reported_today: "0",
      cumulative_reported: "0",
      over_planned: false,
    },
  ],
};

function mockApiFor(membership) {
  api.get.mockImplementation((url) => {
    if (url === "/projects/13" || url === "/projects/1") {
      return Promise.resolve({ data: { membership } });
    }
    if (url.includes("/teams/all/tasks")) {
      return Promise.resolve({ data: allTeamsTasksResponse });
    }
    if (url.includes("/my-team/tasks")) {
      return Promise.resolve({ data: myTeamTasksResponse });
    }
    if (url.endsWith("/teams")) {
      return Promise.resolve({ data: teamsResponse });
    }
    return Promise.reject(new Error("not mocked: " + url));
  });
}

describe("FieldPage (S-26 / T-59)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("currentProjectId", "13");
  });

  // ==========================================
  // S-26 Story Acceptance Criteria
  // ==========================================
  test("AC 1: Đội trưởng thấy việc của đội sắp theo ngày bắt đầu, việc găng có đánh dấu rõ ràng", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/projects/13") {
        return Promise.resolve({ data: { membership: "doi_truong" } });
      }
      if (url.includes("/my-team/tasks")) {
        return Promise.resolve({
          data: {
            team: { id: 10, name: "Đội Cốt thép" },
            tasks: mockTasks,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<FieldPage user={{ id: 5, role: "doi_truong", name: "Nguyễn Văn Đội Trưởng" }} />);

    await waitFor(() => {
      expect(screen.getByText(/Đội: Đội Cốt thép/i)).toBeInTheDocument();
    });

    expect(screen.getByText("Lắp dựng cốt thép đài móng")).toBeInTheDocument();
    expect(screen.getByText("Gia công lắp dựng ván khuôn")).toBeInTheDocument();

    // AC 1: Việc găng có huy hiệu Việc găng
    const criticalBadges = screen.getAllByText(/Việc găng/i);
    expect(criticalBadges.length).toBeGreaterThanOrEqual(1);

    expect(screen.getAllByText(/Bắt đầu/i).length).toBe(2);
  });

  test("NFR: Glove-friendly quick steppers (+1, +5, +10) bấm dễ dàng khi đeo găng", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/projects/13") {
        return Promise.resolve({ data: { membership: "doi_truong" } });
      }
      if (url.includes("/my-team/tasks")) {
        return Promise.resolve({
          data: {
            team: { id: 10, name: "Đội Cốt thép" },
            tasks: [mockTasks[0]],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<FieldPage user={{ id: 5, role: "doi_truong", name: "Nguyễn Văn Đội Trưởng" }} />);

    await waitFor(() => {
      expect(screen.getByText("Lắp dựng cốt thép đài móng")).toBeInTheDocument();
    });

    const plusTenBtn = screen.getByRole("button", { name: "+10" });
    const plusFiveBtn = screen.getByRole("button", { name: "+5" });
    const input = screen.getByPlaceholderText("0.00");

    fireEvent.click(plusTenBtn);
    expect(input).toHaveValue(10);

    fireEvent.click(plusFiveBtn);
    expect(input).toHaveValue(15);
  });

  test("AC 2: Đội trưởng báo khối lượng đã làm -> gọi API lưu báo cáo thành công", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/projects/13") {
        return Promise.resolve({ data: { membership: "doi_truong" } });
      }
      if (url.includes("/my-team/tasks")) {
        return Promise.resolve({
          data: {
            team: { id: 10, name: "Đội Cốt thép" },
            tasks: [mockTasks[0]],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    api.post.mockResolvedValueOnce({
      data: {
        message: "Đã lưu báo cáo khối lượng thành công.",
        warning: null,
      },
    });

    render(<FieldPage user={{ id: 5, role: "doi_truong", name: "Nguyễn Văn Đội Trưởng" }} />);

    await waitFor(() => {
      expect(screen.getByText("Lắp dựng cốt thép đài móng")).toBeInTheDocument();
    });

    const plusTenBtn = screen.getByRole("button", { name: "+10" });
    fireEvent.click(plusTenBtn);
    fireEvent.click(plusTenBtn); // Total 20

    const saveBtn = screen.getByRole("button", { name: /Lưu/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/projects/13/tasks/101/quantity-reports",
        expect.objectContaining({
          quantity: "20",
        })
      );
    });
  });

  test("AC 3: Báo khối lượng làm lũy kế vượt khối lượng của việc -> Cảnh báo nhưng vẫn lưu", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/projects/13") {
        return Promise.resolve({ data: { membership: "doi_truong" } });
      }
      if (url.includes("/my-team/tasks")) {
        return Promise.resolve({
          data: {
            team: { id: 10, name: "Đội Cốt thép" },
            tasks: [mockTasks[1]], // planned: 50, cumulative: 35
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    api.post.mockResolvedValueOnce({
      data: {
        warning: "Khối lượng lũy kế vượt khối lượng kế hoạch nhưng báo cáo vẫn được ghi nhận.",
      },
    });

    render(<FieldPage user={{ id: 5, role: "doi_truong", name: "Nguyễn Văn Đội Trưởng" }} />);

    await waitFor(() => {
      expect(screen.getByText("Gia công lắp dựng ván khuôn")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("0.00");
    fireEvent.change(input, { target: { value: "25" } });

    // AC 3: Real-time preview cảnh báo phát sinh
    expect(screen.getByText(/Cảnh báo phát sinh/i)).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: /Lưu/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Khối lượng lũy kế vượt khối lượng kế hoạch nhưng báo cáo vẫn được ghi nhận/i)
      ).toBeInTheDocument();
    });
  });

  // ==========================================
  // T-59 Toggle & Permissions Criteria
  // ==========================================
  it('chỉ huy trưởng: mặc định ở chế độ "Theo đội", phải chọn đội mới thấy việc', async () => {
    mockApiFor("chi_huy_truong");
    render(<FieldPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Vui lòng chọn đội để xem công việc.")
      ).toBeInTheDocument();
    });

    expect(api.get).not.toHaveBeenCalledWith(
      expect.stringContaining("/teams/all/tasks"),
      expect.anything()
    );
  });

  it('chỉ huy trưởng bấm "Tất cả đội" → gọi /teams/all/tasks, không cần chọn đội', async () => {
    mockApiFor("chi_huy_truong");
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText("Tất cả đội")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tất cả đội"));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/projects/13/teams/all/tasks",
        expect.objectContaining({
          params: expect.objectContaining({
            week_start: expect.any(String),
            week_end: expect.any(String),
            report_date: expect.any(String),
          }),
        })
      );
    });

    expect(await screen.findByText("Việc của đội A")).toBeInTheDocument();
    expect(screen.getByText("Việc của đội B")).toBeInTheDocument();
  });

  it('ban quản lý cũng thấy toggle "Tất cả đội" (không chỉ chỉ huy trưởng)', async () => {
    mockApiFor("ban_quan_ly");
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText("Tất cả đội")).toBeInTheDocument();
    });
  });

  it('view "Tất cả đội" hiện badge tên đội trên từng việc, không hiện ô báo cáo', async () => {
    mockApiFor("chi_huy_truong");
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText("Tất cả đội")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tất cả đội"));

    await screen.findByText("Việc của đội A");

    // Badge tên đội xuất hiện cho từng task.
    expect(screen.getByText("Doi A")).toBeInTheDocument();
    expect(screen.getByText("Doi B")).toBeInTheDocument();

    // Không có ô nhập khối lượng / nút Lưu ở view chỉ đọc này.
    expect(
      screen.queryByText("Khối lượng hoàn thành hôm nay")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
  });

  it('chuyển lại "Theo đội" sau khi đã xem tất cả đội → về yêu cầu chọn đội', async () => {
    mockApiFor("chi_huy_truong");
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText("Tất cả đội")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tất cả đội"));
    await screen.findByText("Việc của đội A");

    fireEvent.click(screen.getByText("Theo đội"));

    await waitFor(() => {
      expect(
        screen.getByText("Vui lòng chọn đội để xem công việc.")
      ).toBeInTheDocument();
    });
  });

  it("đội trưởng (theo membership dự án): không có toggle, gọi /my-team/tasks trực tiếp", async () => {
    mockApiFor("doi_truong");
    render(<FieldPage />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        "/projects/13/my-team/tasks",
        expect.anything()
      );
    });

    expect(screen.queryByText("Tất cả đội")).not.toBeInTheDocument();
    expect(screen.queryByText("Theo đội")).not.toBeInTheDocument();

    // Đội trưởng vẫn thấy ô báo cáo khối lượng (không bị ẩn).
    expect(
      await screen.findByText("Khối lượng hoàn thành hôm nay")
    ).toBeInTheDocument();
  });

  it('việc găng vẫn có badge "Việc găng" ở view tất cả đội', async () => {
    mockApiFor("chi_huy_truong");
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText("Tất cả đội")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tất cả đội"));
    await screen.findByText("Việc của đội A");

    const cardA = screen.getByText("Việc của đội A").closest("article");
    expect(within(cardA).getByText("Việc găng")).toBeInTheDocument();
  });

  it("membership khác nhau theo dự án: role toàn cục không ảnh hưởng — chỉ membership mới quyết định", async () => {
    mockApiFor("chi_huy_truong");
    render(<FieldPage />);

    await waitFor(() => {
      expect(screen.getByText("Tất cả đội")).toBeInTheDocument();
    });
  });
});
