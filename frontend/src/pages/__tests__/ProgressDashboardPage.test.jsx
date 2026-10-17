import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

import api from "../../lib/api";
import ProgressDashboardPage from "../ProgressDashboardPage.jsx";

const okPayload = {
  project_id: 4,
  project_name: "Dự án ABC",
  generated_at: "2026-10-17T10:00:00Z",
  progress: {
    value_percent: 54.17,
    total_contract_value: "3000000000.00",
    completed_value: "1625100000.00",
    currency: "VND",
  },
  schedule: {
    has_baseline: true,
    baseline_version: 2,
    planned_finish: "2026-12-01",
    current_finish: "2026-12-10",
    finish_variance_working_days: 7,
    status: "late",
  },
  overdue_milestones: [
    { milestone_id: 1, work_item_id: 9, work_item_code: "HM-01", work_item_name: "Đổ móng", required_date: "2026-10-01", overdue_days: 16 },
  ],
  critical_delayed_tasks: [
    { task_id: 5, task_name: "Đổ bê tông cột", work_item_code: "HM-02", work_item_name: "Kết cấu", percent_complete: 40, planned_finish: "2026-10-20", current_finish: "2026-10-28", delay_days: 6, delay_basis: "baseline" },
  ],
  data_status: { value: "ok", schedule: "late", milestones: "ok", critical: "ok" },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ProgressDashboardPage />
    </MemoryRouter>
  );
}

describe("ProgressDashboardPage — S-49 / T-125", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "4");
    api.get.mockResolvedValue({ data: okPayload });
  });

  test("hiển thị KPI tiến độ theo giá trị + chênh lệch baseline", async () => {
    renderPage();
    expect(await screen.findByText(/54\.17%/)).toBeInTheDocument();
    expect(screen.getByText(/\+7 ngày/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/projects/4/progress-dashboard");
  });

  test("hiển thị danh sách mốc bị vượt và việc găng chậm", async () => {
    renderPage();
    expect(await screen.findByText(/Đổ móng/)).toBeInTheDocument();
    expect(screen.getByText(/Trễ 16 ngày/)).toBeInTheDocument();
    expect(screen.getByText(/Đổ bê tông cột/)).toBeInTheDocument();
    expect(screen.getByText(/Trễ 6 ngày/)).toBeInTheDocument();
  });

  test("value_percent = null hiển thị 'Chưa đủ dữ liệu' chứ không phải 0", async () => {
    api.get.mockResolvedValue({
      data: { ...okPayload, progress: { ...okPayload.progress, value_percent: null } },
    });
    renderPage();
    expect(await screen.findAllByText(/Chưa đủ dữ liệu/i)).not.toHaveLength(0);
  });

  test("không có baseline -> trạng thái rõ + không bôi đen '0 ngày'", async () => {
    api.get.mockResolvedValue({
      data: {
        ...okPayload,
        schedule: { ...okPayload.schedule, has_baseline: false, status: "no_baseline", finish_variance_working_days: null },
        critical_delayed_tasks: [],
      },
    });
    renderPage();
    expect(await screen.findAllByText(/Chưa (có baseline|chốt baseline)/i)).not.toHaveLength(0);
  });

  test("lỗi API -> thông báo lỗi có thể thử lại", async () => {
    api.get.mockRejectedValue({ response: { status: 500 } });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Không tải được dữ liệu/i);
    expect(screen.getAllByText(/Thử lại/i).length).toBeGreaterThan(0);
  });

  test("403 -> thông báo không có quyền", async () => {
    api.get.mockRejectedValue({ response: { status: 403 } });
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/không có quyền/i);
  });

  test("rỗng -> cả hai danh sách hiện trạng thái trống rõ ràng", async () => {
    api.get.mockResolvedValue({
      data: { ...okPayload, overdue_milestones: [], critical_delayed_tasks: [] },
    });
    renderPage();
    expect(await screen.findByText(/Không có mốc quá hạn/i)).toBeInTheDocument();
    expect(screen.getByText(/Không có việc găng nào đang chậm/i)).toBeInTheDocument();
  });
});
