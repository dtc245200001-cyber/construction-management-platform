import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import React from "react";
import { BrowserRouter } from "react-router-dom";

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import api from "../../lib/api";
import BudgetPage from "../BudgetPage.jsx";

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

const mockTreeResponse = {
  project_id: 1,
  has_actual_costs: false,
  version: {
    id: 1,
    project_id: 1,
    version_number: 1,
    description: "Phiên bản dự toán ban đầu",
    created_by: 2,
    created_by_name: "Ban Quản Lý Dự Án",
    created_at: "2026-10-15T08:00:00Z",
  },
  project_total: "150000000.00",
  items: [
    {
      id: 1,
      parent_id: null,
      code: "HM-01",
      name: "Phần ngầm & Móng",
      is_leaf: false,
      amount: null,
      note: null,
      total_budget: "150000000.00",
    },
    {
      id: 2,
      parent_id: 1,
      code: "HM-01.01",
      name: "Đào đất móng",
      is_leaf: true,
      amount: "50000000.00",
      note: "Đào đất thủ công và cơ giới",
      total_budget: "50000000.00",
    },
    {
      id: 3,
      parent_id: 1,
      code: "HM-01.02",
      name: "Bê tông lót móng",
      is_leaf: true,
      amount: "100000000.00",
      note: "Bê tông mác 150",
      total_budget: "100000000.00",
    },
    {
      id: 4,
      parent_id: 1,
      code: "HM-01.03",
      name: "Chống thấm cổ móng",
      is_leaf: true,
      amount: null,
      note: null,
      total_budget: "0.00",
    },
  ],
};

const mockVersionsResponse = {
  project_id: 1,
  has_actual_costs: false,
  versions: [
    {
      id: 2,
      project_id: 1,
      version_number: 2,
      description: "[Điều chỉnh khối lượng] Tăng khối lượng bê tông lót",
      created_at: "2026-10-16T09:30:00Z",
      created_by_name: "Ban Quản Lý Dự Án",
      total_amount: "180000000.00",
      items_count: 2,
    },
    {
      id: 1,
      project_id: 1,
      version_number: 1,
      description: "Phiên bản dự toán ban đầu",
      created_at: "2026-10-15T08:00:00Z",
      created_by_name: "Ban Quản Lý Dự Án",
      total_amount: "150000000.00",
      items_count: 2,
    },
  ],
};

describe("T-119: Giao diện nhập dự toán và cộng tổng theo cây (BudgetPage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");
    api.get.mockImplementation((url) => {
      if (url.includes("/budgets/tree?version=1")) {
        return Promise.resolve({ data: mockTreeResponse });
      }
      if (url.includes("/budgets/tree?version=2")) {
        return Promise.resolve({
          data: {
            ...mockTreeResponse,
            version: {
              ...mockTreeResponse.version,
              id: 2,
              version_number: 2,
              description: "[Điều chỉnh khối lượng] Tăng khối lượng bê tông lót",
            },
            project_total: "180000000.00",
            items: mockTreeResponse.items.map((i) =>
              i.id === 3
                ? { ...i, amount: "130000000.00", total_budget: "130000000.00" }
                : i.id === 1
                ? { ...i, total_budget: "180000000.00" }
                : i
            ),
          },
        });
      }
      if (url.includes("/budgets/tree")) {
        return Promise.resolve({ data: mockTreeResponse });
      }
      if (url.includes("/budgets")) {
        return Promise.resolve({ data: mockVersionsResponse });
      }
      return Promise.reject(new Error("Not found"));
    });
  });

  afterEach(() => {
    cleanup();
  });

  test("Hiển thị tiêu đề, thẻ tổng dự toán và cấu trúc cây WBS", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Dự toán chi phí theo hạng mục")).toBeInTheDocument();
    });

    expect(screen.getAllByText(/150\.000\.000/)[0]).toBeInTheDocument();
    expect(screen.getByText("Phần ngầm & Móng")).toBeInTheDocument();
    expect(screen.getByText("Đào đất móng")).toBeInTheDocument();
    expect(screen.getByText("Bê tông lót móng")).toBeInTheDocument();
  });

  test("Hạng mục cha hiển thị nhãn 'Không nhập ở cha' và tổng cộng dồn từ con", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Không nhập ở cha")).toBeInTheDocument();
    });

    // Node cha không có nút "Nhập dự toán"
    const buttons = screen.getAllByRole("button", { name: /Nhập dự toán/i });
    // Có 3 nút cho 3 hạng mục lá
    expect(buttons).toHaveLength(3);
  });

  test("Hiển thị cảnh báo thực chi khi dự án đã phát sinh chi phí thực tế", async () => {
    api.get.mockImplementation((url) => {
      if (url.includes("/budgets/tree")) {
        return Promise.resolve({
          data: {
            ...mockTreeResponse,
            has_actual_costs: true,
          },
        });
      }
      if (url.includes("/budgets")) {
        return Promise.resolve({
          data: {
            ...mockVersionsResponse,
            has_actual_costs: true,
          },
        });
      }
      return Promise.reject(new Error("Not found"));
    });

    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText(/Dự án đã phát sinh chi phí thực tế/i)).toBeInTheDocument();
    });
  });

  test("Mở modal nhập dự toán khi bấm nút ở hạng mục lá kèm chọn Lý do điều chỉnh", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Đào đất móng")).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole("button", { name: /Nhập dự toán/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Nhập dự toán cho hạng mục lá/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Số tiền dự toán \(VND\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Lý do điều chỉnh/i)).toBeInTheDocument();
  });

  test("QoL #1: Tìm kiếm theo mã/tên và lọc nhanh 'Chưa nhập dự toán'", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Chống thấm cổ móng")).toBeInTheDocument();
    });

    // Bấm nút lọc "Chưa nhập dự toán"
    const unallocatedBtn = screen.getByRole("tab", { name: "Chưa nhập dự toán" });
    fireEvent.click(unallocatedBtn);

    // Chỉ còn hạng mục lá chưa nhập ("Chống thấm cổ móng") và cha ("Phần ngầm & Móng")
    expect(screen.getByText("Chống thấm cổ móng")).toBeInTheDocument();
    expect(screen.getByText("Phần ngầm & Móng")).toBeInTheDocument();
    expect(screen.queryByText("Đào đất móng")).not.toBeInTheDocument();
    expect(screen.queryByText("Bê tông lót móng")).not.toBeInTheDocument();

    // Quay lại Tất cả và tìm kiếm theo mã HM-01.01
    fireEvent.click(screen.getByRole("tab", { name: "Tất cả hạng mục" }));
    const searchInput = screen.getByLabelText("Tìm kiếm hạng mục WBS");
    fireEvent.change(searchInput, { target: { value: "HM-01.01" } });

    expect(screen.getByText("Đào đất móng")).toBeInTheDocument();
    expect(screen.queryByText("Bê tông lót móng")).not.toBeInTheDocument();
  });

  test("QoL #2: So sánh hai phiên bản dự toán (v1 so với v2)", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Dự toán chi phí theo hạng mục")).toBeInTheDocument();
    });

    const compareBtn = screen.getByRole("button", { name: /So sánh phiên bản/i });
    fireEvent.click(compareBtn);

    await waitFor(() => {
      expect(screen.getByTestId("budget-version-comparison")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Tổng thay đổi toàn dự án")).toBeInTheDocument();
    });

    // v1 = 150.000.000, v2 = 180.000.000 -> chênh lệch +30.000.000 (+20.0%)
    expect(screen.getAllByText(/\+30\.000\.000/)[0]).toBeInTheDocument();
    expect(screen.getAllByText("+20.0%")[0]).toBeInTheDocument();
  });

  test("QoL #3: Mở dialog Nhật ký phiên bản hiển thị lịch sử người tạo và lý do", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Dự toán chi phí theo hạng mục")).toBeInTheDocument();
    });

    const historyBtn = screen.getByRole("button", { name: /Nhật ký/i });
    fireEvent.click(historyBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Nhật ký thay đổi & Lịch sử phiên bản dự toán")
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/\[Điều chỉnh khối lượng\] Tăng khối lượng bê tông lót/i)
    ).toBeInTheDocument();
  });

  test("QoL #4: Điều khiển Thu gọn tất cả và Mở rộng tất cả trên cây WBS", async () => {
    renderWithRouter(<BudgetPage user={{ id: 1, name: "Admin" }} />);

    await waitFor(() => {
      expect(screen.getByText("Đào đất móng")).toBeInTheDocument();
    });

    // Bấm "Thu gọn tất cả" -> ẩn các lá con, chỉ còn hàng cha
    fireEvent.click(screen.getByRole("button", { name: /Thu gọn tất cả/i }));
    expect(screen.getByText("Phần ngầm & Móng")).toBeInTheDocument();
    expect(screen.queryByText("Đào đất móng")).not.toBeInTheDocument();

    // Bấm "Mở rộng tất cả" -> hiển thị lại các lá con
    fireEvent.click(screen.getByRole("button", { name: /Mở rộng tất cả/i }));
    expect(screen.getByText("Đào đất móng")).toBeInTheDocument();
  });

  test("QoL #5: Hiển thị chế độ Chỉ xem cho Kế toán và ẩn nút Nhập dự toán", async () => {
    renderWithRouter(
      <BudgetPage user={{ id: 5, name: "Nguyễn Kế Toán", role: "ke_toan" }} />
    );

    await waitFor(() => {
      expect(screen.getByTestId("readonly-permission-banner")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Chế độ Chỉ xem — Vai trò hiện tại: Kế toán/i)
    ).toBeInTheDocument();

    // Không có nút "Nhập dự toán" nào cho vai trò Chỉ xem
    expect(screen.queryAllByRole("button", { name: /Nhập dự toán/i })).toHaveLength(0);
    // Hiển thị nhãn "Chỉ xem" ở các hạng mục lá
    expect(screen.getAllByText("Chỉ xem").length).toBeGreaterThan(0);
  });

  test("Kiểm soát ngân sách: Hiển thị tách biệt 4 chỉ số, ngưỡng cảnh báo 80%/100% và mở modal Giải trình vượt mức", async () => {
    renderWithRouter(
      <BudgetPage user={{ id: 1, name: "Ban Quản Lý", role: "ban_quan_ly" }} demoMode={true} />
    );

    await waitFor(() => {
      expect(screen.getByTestId("budget-control-panel")).toBeInTheDocument();
    });

    // Hiển thị tách biệt 4 khái niệm tài chính
    expect(screen.getByText(/1\. Giá trị hợp đồng/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Dự toán áp dụng/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Chi phí thực tế lũy kế/i)).toBeInTheDocument();
    expect(screen.getByText(/4\. Đề nghị thanh toán/i)).toBeInTheDocument();

    // Lọc nhanh các hạng mục "Cảnh báo / Vượt ngưỡng"
    fireEvent.click(screen.getByRole("tab", { name: "Cảnh báo / Vượt ngưỡng" }));
    expect(screen.getByText("Bê tông lót móng M150")).toBeInTheDocument();

    // Mở modal Giải trình & Xử lý vượt mức
    const justifyButtons = screen.getAllByRole("button", { name: /Giải trình/i });
    fireEvent.click(justifyButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/Đối chiếu Ngân sách & Luồng Kiểm soát 3 Tác nhân/i)
      ).toBeInTheDocument();
    });
  });

  test("Giải trình vượt dự toán 1 cấp (Quy tắc 1-6): Cấm tự duyệt, cho phép CĐT độc lập duyệt/từ chối và giữ trạng thái chờ phân công khi thiếu người duyệt độc lập", async () => {
    renderWithRouter(
      <BudgetPage
        user={{ id: 10, name: "Nguyễn Văn Quản Lý", role: "ban_quan_ly" }}
        demoMode={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("budget-control-panel")).toBeInTheDocument();
    });

    // 1. Lọc các hạng mục Cảnh báo / Vượt ngưỡng
    fireEvent.click(screen.getByRole("tab", { name: "Cảnh báo / Vượt ngưỡng" }));

    // 2. Chuyển tài khoản thử nghiệm sang "Chủ đầu tư 1 — Ông Trần Hoàng (ID #20)"
    const userSelect = screen.getByLabelText("Tài khoản thử nghiệm");
    fireEvent.change(userSelect, { target: { value: "cdt_20" } });

    // Mở giải trình của hạng mục HM-01.04 ("Chống thấm cổ móng & bể ngầm" — do chính Chủ đầu tư 1 ID #20 lập)
    const justifyButtons = screen.getAllByRole("button", { name: /Giải trình/i });
    // Hạng mục HM-01.04 là mục cuối trong danh sách cảnh báo
    fireEvent.click(justifyButtons[justifyButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByTestId("self-approval-blocked-alert")
      ).toBeInTheDocument();
    });

    // Kiểm tra Quy tắc 2: Nút "Duyệt giải trình" và "Từ chối giải trình" bị khóa (disabled) với chính người lập
    const approveBtnSelf = screen.getByRole("button", {
      name: /Duyệt giải trình/i,
    });
    const rejectBtnSelf = screen.getByRole("button", {
      name: /Từ chối giải trình/i,
    });
    expect(approveBtnSelf).toBeDisabled();
    expect(rejectBtnSelf).toBeDisabled();

    // Đóng dialog và chuyển sang "Chủ đầu tư 2 — Bà Nguyễn Lan (ID #25 - Duyệt độc lập)"
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    fireEvent.change(userSelect, { target: { value: "cdt_25" } });

    // Mở lại giải trình HM-01.04 với tư cách Chủ đầu tư 2 (độc lập với người lập ID #20)
    const justifyButtonsCdt2 = screen.getAllByRole("button", {
      name: /Giải trình/i,
    });
    fireEvent.click(justifyButtonsCdt2[justifyButtonsCdt2.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByTestId("overrun-justification-record")
      ).toBeInTheDocument();
    });

    // Chủ đầu tư 2 không bị chặn tự duyệt -> nút Duyệt giải trình được bật
    const approveBtnIndependent = screen.getByRole("button", {
      name: /Duyệt giải trình/i,
    });
    expect(approveBtnIndependent).not.toBeDisabled();

    // Nhập ý kiến phê duyệt và bấm Duyệt giải trình (Quy tắc 4 & 5)
    const reviewNoteInput = screen.getByLabelText(
      /Ý kiến phê duyệt \/ Lý do từ chối của Chủ đầu tư/i
    );
    fireEvent.change(reviewNoteInput, {
      target: { value: "Đồng ý phê duyệt giải trình đổi màng chống thấm 4mm." },
    });
    fireEvent.click(approveBtnIndependent);

    // Mở lại để kiểm tra hệ thống đã ghi nhận người lập (#20), người duyệt (#25) và kết quả APPROVED
    await waitFor(() => {
      expect(screen.getAllByText(/Đã duyệt giải trình/i).length).toBeGreaterThan(
        0
      );
    });

    // 3. Kiểm tra Quy tắc 6: Chuyển sang "CĐT duy nhất — Ông Lê Độc Lập (ID #30 - Không có người duyệt độc lập)"
    fireEvent.change(userSelect, { target: { value: "cdt_solo_30" } });

    // Mở hạng mục đầu tiên (HM-01.01) để lập giải trình mới khi dự án không có người duyệt độc lập
    const justifyButtonsSolo = screen.getAllByRole("button", {
      name: /Giải trình/i,
    });
    fireEvent.click(justifyButtonsSolo[0]);

    const explanationInput = screen.getByLabelText(
      /Nội dung giải trình & phương án xử lý/i
    );
    fireEvent.change(explanationInput, {
      target: {
        value: "Giải trình khối lượng đất đào tăng thêm do mạch nước ngầm.",
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Gửi giải trình để duyệt/i })
    );

    // Hạng mục phải chuyển sang trạng thái "Chờ phân công duyệt", tuyệt đối không tự động thông qua
    await waitFor(() => {
      expect(
        screen.getAllByText(/Chờ phân công duyệt/i).length
      ).toBeGreaterThan(0);
    });
  });

  test("Kiểm soát nội bộ 3 tác nhân (A1 + A2): Bảng chống bỏ sót, Kế toán xác nhận đối chiếu số liệu và CĐT độc lập chỉ duyệt được khi đủ Số biên bản pháp lý + Xác nhận Kế toán", async () => {
    renderWithRouter(
      <BudgetPage
        user={{ id: 20, name: "Ông Trần Hoàng", role: "chu_dau_tu" }}
        demoMode={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("overrun-attention-tracker")).toBeInTheDocument();
    });

    const userSelect = screen.getByLabelText("Tài khoản thử nghiệm");

    // 1. Đăng nhập với tư cách Chủ đầu tư 1 (cdt_20) để thử duyệt phiếu HM-01.02 (do BQL #10 lập, có số VB nhưng CHƯA có Kế toán xác nhận)
    fireEvent.change(userSelect, { target: { value: "cdt_20" } });

    const trackerCardHm0102 = screen.getByTestId("tracker-card-HM-01.02");
    const openBtnHm0102 = within(trackerCardHm0102).getByRole("button");
    fireEvent.click(openBtnHm0102);

    await waitFor(() => {
      expect(screen.getByTestId("actor-workflow-stepper")).toBeInTheDocument();
    });

    // Bấm "Duyệt giải trình" khi Kế toán chưa đối chiếu -> Bị chặn và báo lỗi rõ ràng
    fireEvent.click(screen.getByRole("button", { name: /Duyệt giải trình/i }));
    await waitFor(() => {
      expect(screen.getByTestId("overrun-justification-error")).toHaveTextContent(
        /Xác nhận đối chiếu số liệu của Kế toán/i
      );
    });

    // Đóng dialog và chuyển sang tài khoản Kế toán — Bà Phạm Thị Kế Toán (ID #40)
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    fireEvent.change(userSelect, { target: { value: "ke_toan_40" } });

    // Mở lại phiếu HM-01.02 từ Bảng theo dõi chống bỏ sót
    const openBtnForKt = within(
      screen.getByTestId("tracker-card-HM-01.02")
    ).getByRole("button");
    fireEvent.click(openBtnForKt);

    await waitFor(() => {
      expect(
        screen.getByTestId("accountant-verification-section")
      ).toBeInTheDocument();
    });

    // Kế toán nhập nhận xét đối chiếu và bấm "Kế toán xác nhận số liệu"
    const ktNoteInput = screen.getByLabelText(
      /Nhận xét đối chiếu chứng từ thực chi/i
    );
    fireEvent.change(ktNoteInput, {
      target: {
        value: "Đã đối chiếu khớp phiếu xuất kho bê tông và đề nghị TT đợt 2.",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Kế toán xác nhận số liệu/i })
    );

    // Sau khi Kế toán xác nhận, chuyển lại sang Chủ đầu tư 1 (cdt_20 — độc lập với BQL #10) để phê duyệt
    fireEvent.change(userSelect, { target: { value: "cdt_20" } });
    fireEvent.click(
      within(screen.getByTestId("tracker-card-HM-01.02")).getByRole("button")
    );

    await waitFor(() => {
      expect(screen.getByText(/✓ Kế toán đã đối chiếu/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Duyệt giải trình/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Đã duyệt giải trình/i).length).toBeGreaterThan(
        0
      );
    });
  });

  test("Thanh phần trăm kiểm soát ngân sách (MVP): Hiển thị 'Chưa có cơ sở dự toán' khi mẫu số = 0 và chuyển 4 mức màu Xanh lá (<80%), Vàng (80%-90%), Cam (90%-<100%), Đỏ (>=100%)", async () => {
    renderWithRouter(
      <BudgetPage
        user={{ id: 10, name: "Nguyễn Văn Quản Lý", role: "ban_quan_ly" }}
        demoMode={true}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("project-budget-progress-section")
      ).toBeInTheDocument();
    });

    // 1. Hạng mục chưa có dự toán (budget = 0, ví dụ HM-02.02 id=10 hoặc HM-03.02 id=13) phải hiển thị "Chưa có cơ sở dự toán" thay vì 0%
    const noBasisRatio = screen.getByTestId("row-budget-ratio-10");
    expect(noBasisRatio).toHaveTextContent("Chưa có cơ sở dự toán");
    expect(noBasisRatio).not.toHaveTextContent("0.0%");

    // 2. Kiểm tra 4 vùng chuyển màu của thanh phần trăm theo công thức Chi phí thực tế / Dự toán được duyệt:
    // - Hạng mục id=8 (HM-02.01.01): Thực chi 290tr / Dự toán 480tr = 60.4% (< 80%) -> Xanh lá (bg-emerald-500)
    const greenBar = screen.getByTestId("row-budget-bar-8");
    expect(greenBar).toHaveAttribute("data-zone", "safe_green");
    expect(greenBar.className).toMatch(/bg-emerald-500/);

    // - Hạng mục id=4 (HM-01.03): Thực chi 260tr / Dự toán 295tr = 88.1% (80% - <90%) -> Màu vàng (bg-yellow-400)
    const yellowBar = screen.getByTestId("row-budget-bar-4");
    expect(yellowBar).toHaveAttribute("data-zone", "in_warning");
    expect(yellowBar.className).toMatch(/bg-yellow-400/);

    // - Hạng mục id=2 (HM-01.01): Thực chi 92tr / Dự toán 95tr = 96.8% (90% - <100%) -> Màu cam (bg-orange-500)
    const orangeBar = screen.getByTestId("row-budget-bar-2");
    expect(orangeBar).toHaveAttribute("data-zone", "near_limit");
    expect(orangeBar.className).toMatch(/bg-orange-500/);

    // - Hạng mục id=5 (HM-01.04): Thực chi 49.5tr / Dự toán 45tr = 110.0% (>= 100%) -> Màu đỏ (bg-red-600)
    const redBar = screen.getByTestId("row-budget-bar-5");
    expect(redBar).toHaveAttribute("data-zone", "at_or_over_limit");
    expect(redBar.className).toMatch(/bg-red-600/);
  });
});
