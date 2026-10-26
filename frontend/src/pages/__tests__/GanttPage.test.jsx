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
    patch: vi.fn(),
  },
}));

import api from "../../lib/api";
import GanttPage, { _clearGanttMemoryCache } from "../GanttPage.jsx";

const rows = [
  {
    id: 1,
    name: "Đào móng",
    work_item_name: "CPM Demo",
    early_start:
      "2026-10-10T00:00:00.000Z",
    early_finish:
      "2026-10-14T00:00:00.000Z",
    late_start:
      "2026-10-10T00:00:00.000Z",
    late_finish:
      "2026-10-14T00:00:00.000Z",
    total_float: 0,
    is_critical: true,
  },
  {
    id: 2,
    name: "Lắp điện nước",
    work_item_name: "CPM Demo",
    early_start:
      "2026-10-14T00:00:00.000Z",
    early_finish:
      "2026-10-16T00:00:00.000Z",
    late_start:
      "2026-10-17T00:00:00.000Z",
    late_finish:
      "2026-10-19T00:00:00.000Z",
    total_float: 3,
    is_critical: false,
  },
];

describe(
  "GanttPage - T-32 / T-33",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
      _clearGanttMemoryCache();

      localStorage.setItem(
        "currentProjectId",
        "4"
      );
      localStorage.setItem("project_role_4", "ban_quan_ly");

      api.post.mockResolvedValue({
        data: {},
      });

      api.get.mockImplementation((url) => {
        if (typeof url === "string" && /^\/projects\/\d+$/.test(url)) {
          return Promise.resolve({ data: { project: { id: 4 }, membership: "ban_quan_ly" } });
        }
        return Promise.resolve({ data: { data: rows } });
      });
    });

    test(
      "T-32: việc găng có viền và ký hiệu riêng",
      async () => {
        render(<GanttPage />);

        const bar =
          await screen.findByRole(
            "button",
            {
              name: /Đào móng - Việc găng/i,
            }
          );

        expect(bar).toHaveAttribute(
          "stroke",
          "#dc2626"
        );

        expect(bar).toHaveAttribute(
          "stroke-width",
          "1.5"
        );

        expect(
          screen.getByTestId(
            "critical-marker-1"
          )
        ).toBeInTheDocument();
      }
    );

    test(
      "T-33: chọn thanh găng mở side panel hiện ES EF LS LF Float, WBS và trạng thái",
      async () => {
        render(<GanttPage />);

        const bar =
          await screen.findByRole(
            "button",
            {
              name: /Đào móng - Việc găng/i,
            }
          );

        await userEvent.click(bar);

        const panel =
          await screen.findByTestId(
            "gantt-side-panel"
          );

        expect(
          panel
        ).toHaveTextContent(
          "Đào móng"
        );

        expect(
          panel
        ).toHaveTextContent("ES");

        expect(
          panel
        ).toHaveTextContent("EF");

        expect(
          panel
        ).toHaveTextContent("LS");

        expect(
          panel
        ).toHaveTextContent("LF");

        expect(
          panel
        ).toHaveTextContent(
          "Float"
        );

        expect(
          panel
        ).toHaveTextContent(
          "0 ngày"
        );

        expect(
          panel
        ).toHaveTextContent(
          "CPM Demo"
        );

        expect(
          panel
        ).toHaveTextContent(
          "Đường găng"
        );
      }
    );

    test(
      "T-33: việc không găng cũng hiện đủ mốc khi chọn",
      async () => {
        render(<GanttPage />);

        const bar =
          await screen.findByRole(
            "button",
            {
              name: /Lắp điện nước - Không găng/i,
            }
          );

        await userEvent.click(bar);

        const panel =
          await screen.findByTestId(
            "gantt-side-panel"
          );

        expect(
          panel
        ).toHaveTextContent(
          "3 ngày"
        );

        expect(
          panel
        ).toHaveTextContent("ES");

        expect(
          panel
        ).toHaveTextContent("EF");

        expect(
          panel
        ).toHaveTextContent("LS");

        expect(
          panel
        ).toHaveTextContent("LF");

        expect(
          panel
        ).toHaveTextContent("Không găng");
      }
    );

    test(
      "T-35: mở form và cập nhật ba giá trị tiến độ thực tế từ sơ đồ",
      async () => {
        api.patch.mockResolvedValue({
          data: {
            message: "Cập nhật tiến độ thành công",
            task: { ...rows[0], percent_complete: 50, actual_start_date: "2026-10-10", actual_end_date: "2026-10-12" },
          },
        });

        render(<GanttPage />);

        const bar = await screen.findByRole("button", {
          name: /Đào móng - Việc găng/i,
        });

        // Click vào thanh trên sơ đồ để hiện tooltip có nút cập nhật
        await userEvent.click(bar);

        const openModalBtn = await screen.findByRole("button", {
          name: /Cập nhật tiến độ: Đào móng/i,
        });
        await userEvent.click(openModalBtn);

        // Modal mở ra với 3 trường thực tế
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Cập nhật tiến độ")).toBeInTheDocument();

        const pickInput = (re) =>
          screen.getAllByLabelText(re).find((el) => el.tagName === "INPUT");
        const startInput = pickInput(/Ngày bắt đầu thực tế/);
        const endInput = pickInput(/Ngày kết thúc thực tế/);
        const percentInput = pickInput(/Phần trăm hoàn thành/);

        await userEvent.type(startInput, "2026-10-10");
        await userEvent.type(endInput, "2026-10-12");
        await userEvent.clear(percentInput);
        await userEvent.type(percentInput, "50");

        const saveBtn = screen.getByRole("button", { name: /Lưu tiến độ/i });
        await userEvent.click(saveBtn);

        await waitFor(() => {
          expect(api.patch).toHaveBeenCalledWith(
            "/projects/4/tasks/1/progress",
            {
              actualStartDate: "2026-10-10",
              actualEndDate: "2026-10-12",
              percentComplete: 50,
            }
          );
        });
      }
    );

    test("Side Panel: chọn công việc khác cập nhật nội dung panel mà không cần đóng rồi mở lại", async () => {
      render(<GanttPage />);

      const bar1 = await screen.findByRole("button", { name: /Đào móng - Việc găng/i });
      const bar2 = await screen.findByRole("button", { name: /Lắp điện nước - Không găng/i });

      // Chọn công việc 1
      await userEvent.click(bar1);
      const panel = await screen.findByTestId("gantt-side-panel");
      expect(panel).toHaveTextContent("Đào móng");
      expect(panel).toHaveTextContent("Đường găng");

      // Chọn công việc 2 ngay mà không cần đóng
      await userEvent.click(bar2);
      expect(panel).toHaveTextContent("Lắp điện nước");
      expect(panel).toHaveTextContent("Không găng");
    });

    test("Side Panel: có nút đóng panel và phím Escape để trở về chế độ xem Gantt rộng ban đầu", async () => {
      render(<GanttPage />);

      const bar = await screen.findByRole("button", { name: /Đào móng - Việc găng/i });
      await userEvent.click(bar);

      expect(await screen.findByTestId("gantt-side-panel")).toBeInTheDocument();

      // Bấm nút đóng panel
      const closeBtn = screen.getByRole("button", { name: /Đóng chi tiết công việc/i });
      await userEvent.click(closeBtn);

      expect(screen.queryByTestId("gantt-side-panel")).not.toBeInTheDocument();

      // Mở lại và kiểm tra đóng bằng phím Escape
      await userEvent.click(bar);
      expect(await screen.findByTestId("gantt-side-panel")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByTestId("gantt-side-panel")).not.toBeInTheDocument();
    });

    test("Side Panel: bấm nút Cập nhật tiến độ trong panel mở modal cập nhật tiến độ", async () => {
      render(<GanttPage />);

      const bar = await screen.findByRole("button", { name: /Đào móng - Việc găng/i });
      await userEvent.click(bar);

      const updateBtn = await screen.findByTestId("side-panel-update-progress-btn");
      await userEvent.click(updateBtn);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Cập nhật tiến độ" })).toBeInTheDocument();
    });

    test("T-37: dải hiện 'Chậm 3 ngày' với summary giả", async () => {
      api.get.mockImplementation((url) => {
        if (typeof url === "string" && url.startsWith("/projects/")) {
          if (/^\/projects\/\d+$/.test(url)) return Promise.resolve({ data: { project: { id: 4 }, membership: "ban_quan_ly" } });
          if (url.includes("/schedule-recalculate") || url.includes("/schedule/recalculate")) return Promise.resolve({ data: {} });
          return Promise.resolve({ data: { data: rows, summary: { currentFinish: "2026-10-25T00:00:00.000Z", plannedFinish: "2026-10-22T00:00:00.000Z", delayWorkingDays: 3, status: "late" } } });
        }
        return Promise.resolve({ data: { data: rows, summary: { currentFinish: "2026-10-25T00:00:00.000Z", plannedFinish: "2026-10-22T00:00:00.000Z", delayWorkingDays: 3, status: "late" } } });
      });

      render(<GanttPage />);
      expect(await screen.findByText(/Chậm 3 ngày/i)).toBeInTheDocument();
      expect(screen.getByText(/Hoàn thành hiện tại/i)).toBeInTheDocument();
    });

    test("T-37: ký hiệu việc mới găng khác việc găng từ đầu và có aria-label", async () => {
      const extra = [...rows, { id: 3, name: "Việc mới", early_start: "2026-10-10T00:00:00.000Z", early_finish: "2026-10-14T00:00:00.000Z", newly_critical: true }];
      api.get.mockImplementation((url) => {
        if (typeof url === "string" && /^\/projects\/\d+$/.test(url)) return Promise.resolve({ data: { project: { id: 4 }, membership: "ban_quan_ly" } });
        return Promise.resolve({ data: { data: extra } });
      });

      render(<GanttPage />);
      
      const newCriticalMarker = await screen.findByTestId("newly-critical-marker-3");
      expect(newCriticalMarker).toBeInTheDocument();
      
      const ariaLabelItems = await screen.findAllByLabelText(/Việc mới trở thành găng/i);
      expect(ariaLabelItems.length).toBeGreaterThan(0);
    });

    test("T-37: mạng có vòng không hiện dải rỗng, giữ thông báo vòng", async () => {
      api.post.mockRejectedValueOnce({
        response: {
          data: {
            code: "DEPENDENCY_CYCLE",
            message: "Phát hiện vòng lặp A chờ B, B chờ A",
          }
        }
      });
      render(<GanttPage />);
      expect(await screen.findByText(/Phát hiện vòng lặp/i)).toBeInTheDocument();
      expect(screen.queryByText(/Dự án chưa có công việc nào hợp lệ để vẽ/i)).not.toBeInTheDocument();
    });
  }
);

describe("GanttPage - T-42", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearGanttMemoryCache();
    localStorage.setItem("currentProjectId", "4");
    api.post.mockResolvedValue({ data: {} });
  });

  test("có kế hoạch gốc thì thấy thanh mờ và thấy gợi ý cập nhật", async () => {
    api.get.mockResolvedValue({
      data: {
        data: [
          {
            ...rows[0],
            has_baseline: true,
            planned_early_start: "2026-10-08T00:00:00.000Z",
            planned_early_finish: "2026-10-12T00:00:00.000Z",
          },
        ],
        summary: { hasBaseline: true },
      },
    });
    render(<GanttPage />);
    expect(await screen.findByTestId("baseline-bar-1")).toBeInTheDocument();
    expect(screen.queryByTestId("baseline-hint")).toBeInTheDocument();
  });

  test("chưa chốt thì không có thanh mờ và có gợi ý chốt", async () => {
    api.get.mockImplementation((url) => {
      if (typeof url === "string" && /^\/projects\/\d+$/.test(url)) {
        return Promise.resolve({ data: { project: { id: 4 }, membership: "ban_quan_ly" } });
      }
      return Promise.resolve({ data: { data: rows, summary: { hasBaseline: false } } });
    });
    render(<GanttPage />);
    expect(await screen.findByTestId("baseline-hint")).toBeInTheDocument();
    expect(screen.queryByTestId("baseline-bar-1")).not.toBeInTheDocument();
  });

  test("bấm Chốt kế hoạch gốc gọi đúng API", async () => {
    api.get.mockImplementation((url) => {
      if (typeof url === "string" && /^\/projects\/\d+$/.test(url)) {
        return Promise.resolve({ data: { project: { id: 4 }, membership: "ban_quan_ly" } });
      }
      return Promise.resolve({ data: { data: rows, summary: { hasBaseline: false } } });
    });
    render(<GanttPage />);
    await screen.findByRole("button", { name: /Chốt kế hoạch gốc/i });
    // fetchData gọi /schedule/recalculate ở lần đầu, xóa lịch sử trước khi bấm nút
    api.post.mockClear();
    await userEvent.click(
      await screen.findByRole("button", { name: /Chốt kế hoạch gốc/i }),
    );
    expect(api.post).toHaveBeenCalledWith("/projects/4/baselines/freeze");
  });

  test("Toolbar: chuyển đổi giữa các chế độ Vừa vặn, Ngày, Tuần hoạt động", async () => {
    render(<GanttPage />);
    await screen.findByRole("button", { name: /Đào móng - Việc găng/i });

    const fitBtn = screen.getByRole("button", { name: /^Vừa vặn$/i });
    const dayBtn = screen.getByRole("button", { name: /^Ngày$/i });
    const weekBtn = screen.getByRole("button", { name: /^Tuần$/i });

    expect(fitBtn).toBeInTheDocument();
    expect(dayBtn).toBeInTheDocument();
    expect(weekBtn).toBeInTheDocument();

    await userEvent.click(fitBtn);
    expect(fitBtn).toHaveClass("bg-blue-600");

    await userEvent.click(weekBtn);
    expect(weekBtn).toHaveClass("bg-blue-600");

    await userEvent.click(dayBtn);
    expect(dayBtn).toHaveClass("bg-blue-600");
  });

  test("Side Panel: khi mở panel, nút đóng và thanh công việc vẫn truy cập đầy đủ", async () => {
    render(<GanttPage />);
    const bar = await screen.findByRole("button", { name: /Đào móng - Việc găng/i });
    await userEvent.click(bar);

    const panel = await screen.findByTestId("gantt-side-panel");
    expect(panel).toBeInTheDocument();

    // Nút đóng hoạt động
    const closeBtn = screen.getByRole("button", { name: /Đóng chi tiết công việc/i });
    await userEvent.click(closeBtn);
    expect(screen.queryByTestId("gantt-side-panel")).not.toBeInTheDocument();
  });
});
