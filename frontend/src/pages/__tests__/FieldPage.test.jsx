import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
} from "vitest";

import {
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from "../../lib/api";
import FieldPage from "../FieldPage.jsx";

const mockTasks = [
  {
    task_id: 101,
    name: "Lắp dựng cốt thép đài móng",
    work_item_name: "Phần móng",
    duration_days: 4,
    planned_quantity: "100.00",
    quantity_unit: "m3",
    team_id: 1,
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
    team_id: 1,
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

describe("FieldPage (S-26 / E-11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");
  });

  test("AC 1: Đội trưởng thấy việc của đội sắp theo ngày bắt đầu, việc găng có đánh dấu rõ ràng", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        team: { id: 1, name: "Đội Cốt thép" },
        week: {
          start: "2026-10-12",
          end: "2026-10-18",
          report_date: "2026-10-17",
        },
        tasks: mockTasks,
      },
    });

    render(<FieldPage user={{ id: 5, role: "doi_truong", name: "Nguyễn Văn Đội Trưởng" }} />);

    // Kiểm tra tên đội
    await waitFor(() => {
      expect(screen.getByText(/Đội Cốt thép/i)).toBeInTheDocument();
    });

    // Kiểm tra 2 công việc hiển thị
    expect(screen.getByText("Lắp dựng cốt thép đài móng")).toBeInTheDocument();
    expect(screen.getByText("Gia công lắp dựng ván khuôn")).toBeInTheDocument();

    // AC 1: Việc găng có đánh dấu huy hiệu VIỆC GĂNG
    const criticalBadges = screen.getAllByText(/VIỆC GĂNG/i);
    expect(criticalBadges.length).toBeGreaterThanOrEqual(1);

    // Kiểm tra ngày bắt đầu hiển thị
    expect(screen.getAllByText(/Bắt đầu/i).length).toBe(2);
  });

  test("NFR: Glove-friendly quick steppers (+1, +5, +10) bấm dễ dàng khi đeo găng", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        team: { id: 1, name: "Đội Cốt thép" },
        tasks: [mockTasks[0]],
      },
    });

    render(<FieldPage user={{ id: 5, role: "doi_truong", name: "Nguyễn Văn Đội Trưởng" }} />);

    await waitFor(() => {
      expect(screen.getByText("Lắp dựng cốt thép đài móng")).toBeInTheDocument();
    });

    const plusTenBtn = screen.getByRole("button", { name: "+10" });
    const plusFiveBtn = screen.getByRole("button", { name: "+5" });
    const input = screen.getByPlaceholderText("0.00");

    // Bấm +10
    fireEvent.click(plusTenBtn);
    expect(input).toHaveValue(10);

    // Bấm +5 -> thành 15
    fireEvent.click(plusFiveBtn);
    expect(input).toHaveValue(15);
  });

  test("AC 2: Đội trưởng báo khối lượng đã làm -> gọi API lưu báo cáo thành công", async () => {
    api.get.mockResolvedValueOnce({
      data: {
        team: { id: 1, name: "Đội Cốt thép" },
        tasks: [mockTasks[0]],
      },
    });

    api.post.mockResolvedValueOnce({
      data: {
        message: "Đã lưu báo cáo khối lượng.",
        warning: null,
        task: {
          task_id: 101,
          reported_today: "20.00",
          cumulative_reported: "20.00",
          over_planned: false,
        },
      },
    });

    // Mock reload after submit
    api.get.mockResolvedValueOnce({
      data: {
        team: { id: 1, name: "Đội Cốt thép" },
        tasks: [
          {
            ...mockTasks[0],
            reported_today: "20.00",
            cumulative_reported: "20.00",
          },
        ],
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
        "/projects/1/tasks/101/quantity-reports",
        expect.objectContaining({
          quantity: "20",
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Đã lưu báo cáo/i)).toBeInTheDocument();
    });
  });

  test("AC 3: Báo khối lượng làm lũy kế vượt khối lượng của việc -> Cảnh báo nhưng vẫn lưu", async () => {
    // Task có kế hoạch 50, đã làm 35, nhập thêm 25 -> tổng 60 > 50 (vượt kế hoạch)
    api.get.mockResolvedValueOnce({
      data: {
        team: { id: 1, name: "Đội Cốt thép" },
        tasks: [mockTasks[1]],
      },
    });

    api.post.mockResolvedValueOnce({
      data: {
        message: "Đã lưu báo cáo. Cảnh báo: khối lượng lũy kế đã vượt khối lượng công việc.",
        warning: "Khối lượng lũy kế vượt khối lượng kế hoạch nhưng báo cáo vẫn được ghi nhận.",
        task: {
          task_id: 102,
          reported_today: "40.00",
          cumulative_reported: "60.00",
          over_planned: true,
        },
      },
    });

    api.get.mockResolvedValueOnce({
      data: {
        team: { id: 1, name: "Đội Cốt thép" },
        tasks: [
          {
            ...mockTasks[1],
            reported_today: "40.00",
            cumulative_reported: "60.00",
            over_planned: true,
          },
        ],
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

    // AC 3: Vẫn lưu thành công kèm cảnh báo vượt khối lượng
    await waitFor(() => {
      expect(
        screen.getByText(/Khối lượng lũy kế vượt khối lượng kế hoạch nhưng báo cáo vẫn được ghi nhận/i)
      ).toBeInTheDocument();
    });
  });

  test("AC 2 (Chỉ huy trưởng): Xem được báo cáo khối lượng kèm thời điểm và tổng lũy kế", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/teams")) {
        return Promise.resolve({
          data: {
            teams: [{ id: 1, name: "Đội Cốt thép" }, { id: 2, name: "Đội Bê tông" }],
          },
        });
      }
      if (url.includes("/quantity-reports")) {
        return Promise.resolve({
          data: {
            reports: [
              {
                id: 1,
                task_id: 101,
                task_name: "Lắp dựng cốt thép đài móng",
                work_item_name: "Phần móng",
                team_name: "Đội Cốt thép",
                reported_by_name: "Nguyễn Văn Đội Trưởng",
                quantity: "25.00",
                quantity_unit: "m3",
                cumulative_reported: "25.00",
                planned_quantity: "100.00",
                created_at: "2026-10-17T17:30:00.000Z",
                over_planned: false,
              },
            ],
          },
        });
      }
      return Promise.resolve({
        data: {
          team: { id: "all", name: "Tất cả các đội" },
          tasks: mockTasks,
        },
      });
    });

    render(
      <FieldPage
        user={{ id: 2, role: "chi_huy_truong", name: "Trần Văn Chỉ Huy" }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Giám sát hiện trường/i)).toBeInTheDocument();
    });

    // Chỉ huy trưởng thấy tab "Nhật ký báo cáo hiện trường"
    const feedTab = screen.getByRole("button", { name: /Nhật ký báo cáo hiện trường/i });
    fireEvent.click(feedTab);

    await waitFor(() => {
      expect(screen.getByText("Nguyễn Văn Đội Trưởng")).toBeInTheDocument();
      expect(screen.getByText("+25.00 m3")).toBeInTheDocument();
    });
  });
});
