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
  within,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from "../../lib/api";
import SchedulePage from "../SchedulePage.jsx";

const rows = [
  {
    id: 1,
    name: "Đào móng",
    work_item_name: "Phần móng",
    early_start: "2026-10-23T00:00:00.000Z",
    early_finish: "2026-10-27T00:00:00.000Z",
    late_start: "2026-10-23T00:00:00.000Z",
    late_finish: "2026-10-27T00:00:00.000Z",
    total_float: 0,
    is_critical: true,
  },
  {
    id: 2,
    name: "Lắp điện nước",
    work_item_name: "Phần thân",
    early_start: "2026-10-24T00:00:00.000Z",
    early_finish: "2026-10-26T00:00:00.000Z",
    late_start: "2026-10-25T00:00:00.000Z",
    late_finish: "2026-10-27T00:00:00.000Z",
    total_float: 1,
    is_critical: false,
  },
];

describe("SchedulePage (T-28 / S-14 / T-32 / T-33)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    localStorage.setItem(
      "currentProjectId",
      "13"
    );
  });

  test(
    "hiện đủ cột và ngày theo định dạng Việt Nam",
    async () => {
      api.get.mockResolvedValue({
        data: {
          data: rows,
        },
      });

      render(<SchedulePage />);

      await screen.findByText("Đào móng");

      const headers = screen
        .getAllByRole("columnheader")
        .map((th) => th.textContent.trim());

      expect(headers).toEqual(
        expect.arrayContaining([
          "Bắt đầu sớm (ES)",
          "Kết thúc sớm (EF)",
          "Bắt đầu muộn (LS)",
          "Kết thúc muộn (LF)",
          "Dự phòng (Float)",
        ])
      );

      expect(
        screen.getAllByText("23/10/2026").length
      ).toBeGreaterThan(0);
    }
  );

  test(
    "bật lọc găng thì chỉ còn việc găng, số tổng không đổi",
    async () => {
      api.get.mockResolvedValue({
        data: {
          data: rows,
        },
      });

      render(<SchedulePage />);

      await screen.findByText("Đào móng");

      await userEvent.click(
        screen.getByRole("button", {
          name: /Chỉ đường găng/,
        })
      );

      expect(
        screen.getByText("Đào móng")
      ).toBeInTheDocument();

      expect(
        screen.queryByText("Lắp điện nước")
      ).not.toBeInTheDocument();

      expect(
        screen.getByRole("button", {
          name: /Tất cả công việc \(2\)/,
        })
      ).toBeInTheDocument();
    }
  );

  test(
    "dữ liệu có vòng thì thấy thông báo thay vì bảng trống",
    async () => {
      const noResult = rows.map((row) => ({
        ...row,
        early_start: null,
      }));

      api.get.mockResolvedValue({
        data: {
          data: noResult,
        },
      });

      api.post.mockRejectedValue({
        response: {
          data: {
            code: "DEPENDENCY_CYCLE",
            message:
              "Không thể tính tiến độ vì dữ liệu có vòng phụ thuộc: A chờ B, B chờ A.",
          },
        },
      });

      render(<SchedulePage />);

      const alert =
        await screen.findByRole("alert");

      expect(alert).toHaveTextContent(
        "A chờ B, B chờ A"
      );
    }
  );

  test(
    "S-14/T-32: việc găng được tô đậm, có viền và ký hiệu riêng",
    async () => {
      api.get.mockResolvedValue({
        data: {
          data: rows,
        },
      });

      render(<SchedulePage />);

      const taskName =
        await screen.findByText("Đào móng");

      const row = taskName.closest("tr");

      expect(row).toBeInTheDocument();

      expect(row).toHaveAttribute(
        "data-critical",
        "true"
      );

      expect(
        within(row).getByLabelText("Việc găng")
      ).toBeInTheDocument();

      expect(taskName).toHaveClass(
        "font-bold"
      );

      expect(
        taskName.closest("td")
      ).toHaveClass("border-l-red-600");
    }
  );

  test(
    "T-32: việc không găng không mang ký hiệu việc găng",
    async () => {
      api.get.mockResolvedValue({
        data: {
          data: rows,
        },
      });

      render(<SchedulePage />);

      const taskName =
        await screen.findByText(
          "Lắp điện nước"
        );

      const row = taskName.closest("tr");

      expect(row).toHaveAttribute(
        "data-critical",
        "false"
      );

      expect(
        within(row).queryByLabelText(
          "Việc găng"
        )
      ).not.toBeInTheDocument();
    }
  );

  test(
    "S-14/T-33: hover việc găng hiện ES EF LS LF và Float",
    async () => {
      api.get.mockResolvedValue({
        data: {
          data: rows,
        },
      });

      render(<SchedulePage />);

      const taskName =
        await screen.findByText("Đào móng");

      const row = taskName.closest("tr");

      await userEvent.hover(row);

      const tooltip =
        await screen.findByRole("tooltip");

      expect(tooltip).toHaveTextContent(
        "Đào móng"
      );

      expect(tooltip).toHaveTextContent(
        "Việc găng"
      );

      expect(tooltip).toHaveTextContent("ES");
      expect(tooltip).toHaveTextContent("EF");
      expect(tooltip).toHaveTextContent("LS");
      expect(tooltip).toHaveTextContent("LF");

      expect(tooltip).toHaveTextContent(
        "Float"
      );

      expect(tooltip).toHaveTextContent(
        "23/10/2026"
      );

      expect(tooltip).toHaveTextContent(
        "27/10/2026"
      );

      expect(tooltip).toHaveTextContent(
        "0 ngày"
      );

      await userEvent.unhover(row);

      expect(
        screen.queryByRole("tooltip")
      ).not.toBeInTheDocument();
    }
  );

  test(
    "T-33: hover việc không găng vẫn hiện đủ mốc và độ trễ",
    async () => {
      api.get.mockResolvedValue({
        data: {
          data: rows,
        },
      });

      render(<SchedulePage />);

      const taskName =
        await screen.findByText(
          "Lắp điện nước"
        );

      const row = taskName.closest("tr");

      await userEvent.hover(row);

      const tooltip =
        await screen.findByRole("tooltip");

      expect(tooltip).toHaveTextContent("ES");
      expect(tooltip).toHaveTextContent("EF");
      expect(tooltip).toHaveTextContent("LS");
      expect(tooltip).toHaveTextContent("LF");

      expect(tooltip).toHaveTextContent(
        "Float"
      );

      expect(tooltip).toHaveTextContent(
        "1 ngày"
      );
    }
  );
});