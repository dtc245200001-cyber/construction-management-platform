import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("../../components/TaskForm", () => ({
  default: () => <div data-testid="task-form-mock" />,
}));

// Mock ReactFlow: jsdom không có layout nên ReactFlow thật render rỗng.
// Mock này vẽ mỗi node thành 1 button, giữ nguyên onNodeClick để test hành vi.
const mockHandlers = {};
vi.mock("reactflow", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ReactFlow: ({ nodes, edges, onNodeClick }) => {
      mockHandlers.onNodeClick = onNodeClick;
      return (
        <div data-testid="flow-mock">
          {nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              data-testid={`flow-node-${n.id}`}
              data-collapsed={n.data.collapsed ? "1" : "0"}
              onClick={(e) => onNodeClick?.(e, n)}
            >
              {n.data.node.name}|{n.data.node.type === "task" ? `CV ${n.data.node.duration_days} ngày` : "HM"}
              {n.data.hasChildren && (
                <span
                  role="button"
                  aria-label="toggle"
                  data-testid={`flow-toggle-${n.id}`}
                  data-node-toggle="1"
                  onClick={(e) => { e.stopPropagation(); onNodeClick?.({ target: e.currentTarget, ...e }, n); }}
                >
                  toggle
                </span>
              )}
            </button>
          ))}
          <span data-testid="flow-edge-count">{edges.length}</span>
        </div>
      );
    },
    ReactFlowProvider: ({ children }) => <div>{children}</div>,
  };
});

import api from "../../lib/api";
import WBSDiagramPage from "../WBSDiagramPage.jsx";

const flatRows = [
  { id: 1, name: "HM Móng", parent_id: null, type: "category" },
  { id: 2, name: "HM Thân", parent_id: null, type: "category" },
  { id: "task-5", task_id: 5, name: "Ép cọc", parent_id: 1, type: "task", duration_days: 4 },
  { id: "task-6", task_id: 6, name: "Đổ bê tông", parent_id: 1, type: "task", duration_days: 2 },
];

const renderPage = (rows = flatRows) => {
  api.get.mockResolvedValue({ data: rows });
  return render(
    <MemoryRouter>
      <WBSDiagramPage />
    </MemoryRouter>
  );
};

describe("WBSDiagramPage — render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "13");
  });

  test("vẽ đủ node cho hạng mục + công việc, có nút quay lại bảng", async () => {
    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/categories/13/tree/all"));

    expect(await screen.findByTestId("flow-node-1")).toHaveTextContent("HM Móng|HM");
    expect(screen.getByTestId("flow-node-2")).toHaveTextContent("HM Thân|HM");
    expect(screen.getByTestId("flow-node-task-5")).toHaveTextContent("Ép cọc|CV 4 ngày");
    expect(screen.getByTestId("flow-edge-count")).toHaveTextContent("2");

    expect(screen.getByText("Quay lại bảng WBS")).toBeInTheDocument();
  });

  test("bấm nút mũi tên thì thu gọn (con biến mất), bấm lại thì mở ra", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("flow-node-task-5");

    await user.click(screen.getByTestId("flow-toggle-1"));
    await waitFor(() => {
      expect(screen.queryByTestId("flow-node-task-5")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("flow-node-1")).toHaveAttribute("data-collapsed", "1");

    await user.click(screen.getByTestId("flow-toggle-1"));
    await waitFor(() => {
      expect(screen.getByTestId("flow-node-task-5")).toBeInTheDocument();
    });
  });

  test("bấm vào node hạng mục (kể cả có con) mở modal Đổi tên hạng mục", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("flow-node-task-5");

    await user.click(screen.getByTestId("flow-node-1"));
    expect(await screen.findByText("Đổi tên hạng mục")).toBeInTheDocument();
  });

  test("bấm công việc mở TaskForm, bấm hạng mục lá mở modal sửa", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("flow-node-task-5");

    await user.click(screen.getByTestId("flow-node-task-5"));
    expect(await screen.findByTestId("task-form-mock")).toBeInTheDocument();
  });

  test("bấm hạng mục lá (không con) mở modal Đổi tên hạng mục", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("flow-node-2");

    await user.click(screen.getByTestId("flow-node-2"));
    expect(await screen.findByText("Đổi tên hạng mục")).toBeInTheDocument();
  });

  test("cây rỗng hiện thông báo + link sang bảng", async () => {
    renderPage([]);
    expect(await screen.findByText("Chưa có hạng mục nào.")).toBeInTheDocument();
    expect(screen.getByText("Sang bảng WBS để thêm hạng mục").closest("a").getAttribute("href")).toBe("/wbs");
  });
});
