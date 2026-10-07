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
import GanttPage from "../GanttPage.jsx";

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

      localStorage.setItem(
        "currentProjectId",
        "4"
      );

      api.post.mockResolvedValue({
        data: {},
      });

      api.get.mockResolvedValue({
        data: {
          data: rows,
        },
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
      "T-33: hover thanh găng hiện ES EF LS LF Float",
      async () => {
        render(<GanttPage />);

        const bar =
          await screen.findByRole(
            "button",
            {
              name: /Đào móng - Việc găng/i,
            }
          );

        await userEvent.hover(bar);

        const tooltip =
          await screen.findByRole(
            "tooltip"
          );

        expect(
          tooltip
        ).toHaveTextContent(
          "Đào móng"
        );

        expect(
          tooltip
        ).toHaveTextContent("ES");

        expect(
          tooltip
        ).toHaveTextContent("EF");

        expect(
          tooltip
        ).toHaveTextContent("LS");

        expect(
          tooltip
        ).toHaveTextContent("LF");

        expect(
          tooltip
        ).toHaveTextContent(
          "Float"
        );

        expect(
          tooltip
        ).toHaveTextContent(
          "0 ngày"
        );
      }
    );

    test(
      "T-33: việc không găng cũng hiện đủ mốc khi hover",
      async () => {
        render(<GanttPage />);

        const bar =
          await screen.findByRole(
            "button",
            {
              name: /Lắp điện nước - Không găng/i,
            }
          );

        await userEvent.hover(bar);

        const tooltip =
          await screen.findByRole(
            "tooltip"
          );

        expect(
          tooltip
        ).toHaveTextContent(
          "3 ngày"
        );

        expect(
          tooltip
        ).toHaveTextContent("ES");

        expect(
          tooltip
        ).toHaveTextContent("EF");

        expect(
          tooltip
        ).toHaveTextContent("LS");

        expect(
          tooltip
        ).toHaveTextContent("LF");
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

        const startInput = screen.getByLabelText(/Ngày bắt đầu thực tế/);
        const endInput = screen.getByLabelText(/Ngày kết thúc thực tế/);
        const percentInput = screen.getByLabelText(/Phần trăm hoàn thành/);

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
              actual_start_date: "2026-10-10",
              actual_end_date: "2026-10-12",
              percent_complete: 50,
            }
          );
        });
      }
    );
  }
);