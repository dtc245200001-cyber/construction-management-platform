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
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
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
  }
);