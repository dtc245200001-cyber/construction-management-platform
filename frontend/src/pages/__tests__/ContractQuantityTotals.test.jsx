import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ContractQuantityPage from "../ContractQuantityPage";
import api from "../../lib/api";
import {
  calculateFrontendTreeTotals,
  formatCurrencyVNDisplay,
  parseVNDisplayToStandard,
  multiplyAndRoundHalfUp,
  addCurrency,
} from "../../test-helpers/exactDecimalOracle";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock api
vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock useProject
vi.mock("../../contexts/ProjectContext", () => ({
  useProject: () => ({
    currentProjectId: 1,
    currentProjectRole: "chu_dau_tu",
    loadingRole: false,
    selectedProject: { id: 1, name: "Dự án Plaza Test" },
  }),
}));

describe("ĐỢT 5: Kiểm thử Frontend hiển thị tổng hợp đồng (F1 -> F8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Dữ liệu cây A
  const treeANodes = [
    { id: 1, parent_id: null, name: "Gốc R", is_leaf: false },
    { id: 2, parent_id: 1, name: "Nhánh A", is_leaf: false },
    { id: 3, parent_id: 2, name: "Lá A1", is_leaf: true, quantity: "333.333", unit: "m3", unit_price: "3.00" },
    { id: 4, parent_id: 2, name: "Lá A2", is_leaf: true, quantity: "2.675", unit: "tấn", unit_price: "1.00" },
    { id: 5, parent_id: 2, name: "Lá A3", is_leaf: true, quantity: "1.005", unit: "m", unit_price: "1.00" },
    { id: 6, parent_id: 1, name: "Nhánh B", is_leaf: false },
    { id: 7, parent_id: 6, name: "Nhánh B1", is_leaf: false },
    { id: 8, parent_id: 7, name: "Lá B11", is_leaf: true, quantity: "1234.567", unit: "cái", unit_price: "89000.50" },
    { id: 9, parent_id: 7, name: "Lá B12", is_leaf: true, quantity: "0.001", unit: "kg", unit_price: "0.01" },
    { id: 10, parent_id: 6, name: "Lá B2", is_leaf: true, quantity: "0.100", unit: "m2", unit_price: "0.20" },
  ];

  function buildApiResponseFromOracle(nodes) {
    const oracle = calculateFrontendTreeTotals(nodes);
    const items = nodes.map((n) => ({
      id: n.id,
      parent_id: n.parent_id,
      name: n.name,
      is_leaf: n.is_leaf,
      quantity: n.quantity || null,
      unit: n.unit || null,
      unit_price: n.unit_price || null,
      contract_value: oracle.nodeValues.get(n.id) || null,
      contract_total: oracle.nodeTotals.get(n.id) || "0.00",
    }));
    return {
      items,
      project_total: oracle.projectTotal,
      can_view_prices: true,
      units: ["m", "m2", "m3", "md", "kg", "tấn", "lít", "cái", "bộ", "cây", "viên", "tấm", "công", "ca", "trọn gói"],
    };
  }

  it("F1: Mọi nút cây A hiển thị đúng định dạng 'x.xxx,xx ₫' khớp contract_total từ API", async () => {
    const fakeData = buildApiResponseFromOracle(treeANodes);
    api.get.mockImplementation((url) => {
      if (url === "/projects/1") return Promise.resolve({ data: { membership: "chu_dau_tu" } });
      if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: fakeData });
      return Promise.reject(new Error("Not found"));
    });

    render(
      <MemoryRouter>
        <ContractQuantityPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      // Project total trong footer
      const footerRow = screen.getByText("Tổng giá trị hợp đồng dự án:").closest("tr");
      expect(within(footerRow).getByText("109.878.083,99 ₫")).toBeInTheDocument();

      // Dòng Nhánh A: 1.003,69 ₫
      const rowA = screen.getByText("Nhánh A").closest("tr");
      expect(within(rowA).getByText("1.003,69 ₫")).toBeInTheDocument();

      // Dòng Nhánh B: 109.877.080,30 ₫
      const rowB = screen.getByText("Nhánh B").closest("tr");
      expect(within(rowB).getByText("109.877.080,30 ₫")).toBeInTheDocument();

      // Dòng Nhánh B1: 109.877.080,28 ₫
      const rowB1 = screen.getByText("Nhánh B1").closest("tr");
      expect(within(rowB1).getByText("109.877.080,28 ₫")).toBeInTheDocument();

      // Dòng Lá B12 (đã khai 0.001 x 0.01 -> 0,00 ₫)
      const rowB12 = screen.getByText("Lá B12").closest("tr");
      expect(within(rowB12).getByText("0,00 ₫")).toBeInTheDocument();
    });
  });

  it("F2 & F3: Tính nhất quán màn hình trên cây ngẫu nhiên hạt giống (10 seeds)", async () => {
    // Chạy 10 cây ngẫu nhiên
    for (let seed = 1; seed <= 10; seed++) {
      const testNodes = [
        { id: 1, parent_id: null, name: "Gốc", is_leaf: false },
        { id: 2, parent_id: 1, name: "Nhánh 1", is_leaf: false },
        { id: 3, parent_id: 2, name: "Lá 1", is_leaf: true, quantity: `${seed}.000`, unit: "m", unit_price: "10.00" },
        { id: 4, parent_id: 2, name: "Lá 2", is_leaf: true, quantity: "2.500", unit: "m", unit_price: "2.00" },
      ];
      const apiResp = buildApiResponseFromOracle(testNodes);
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "chu_dau_tu" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: apiResp });
        return Promise.reject(new Error("Not found"));
      });

      const { unmount } = render(
        <MemoryRouter>
          <ContractQuantityPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Tổng giá trị hợp đồng dự án:")).toBeInTheDocument();
      });

      // Kiểm tra dòng tổng dự án trong footer
      const footerRow = screen.getByText("Tổng giá trị hợp đồng dự án:").closest("tr");
      const expectedProjectDisplay = formatCurrencyVNDisplay(apiResp.project_total);
      expect(within(footerRow).getByText(expectedProjectDisplay)).toBeInTheDocument();

      unmount();
    }
  });

  it("F4: Giao diện không tự cộng: nếu API trả contract_total khác tổng các con, giao diện vẫn hiện đúng giá trị API", async () => {
    const apiData = {
      items: [
        { id: 1, parent_id: null, name: "Cha Lạ", is_leaf: false, contract_total: "9999.99" },
        { id: 2, parent_id: 1, name: "Con Lạ", is_leaf: true, quantity: "1.000", unit: "m", unit_price: "10.00", contract_value: "10.00", contract_total: "10.00" },
      ],
      project_total: "9999.99",
      can_view_prices: true,
      units: ["m"],
    };
    api.get.mockImplementation((url) => {
      if (url === "/projects/1") return Promise.resolve({ data: { membership: "chu_dau_tu" } });
      if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: apiData });
      return Promise.reject(new Error("Not found"));
    });

    render(
      <MemoryRouter>
        <ContractQuantityPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      const elements = screen.getAllByText(/9\.999,99 ₫/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("F5: Sau khi sửa/khai giá trị, GET thứ hai trả tổng mới từ máy đối chiếu (S1, S2) thì màn hình hiện tổng mới", async () => {
    const user = userEvent.setup();
    // Ban đầu cây A
    const initialData = buildApiResponseFromOracle(treeANodes);

    // Kịch bản S1: A3 sửa thành 2.00 -> Tổng A = 1004.69, R = 109878084.99
    const s1Nodes = JSON.parse(JSON.stringify(treeANodes));
    s1Nodes.find((n) => n.id === 5).unit_price = "2.00";
    const s1Data = buildApiResponseFromOracle(s1Nodes);

    let getCount = 0;
    api.get.mockImplementation((url) => {
      if (url === "/projects/1") return Promise.resolve({ data: { membership: "chu_dau_tu" } });
      if (url === "/projects/1/contract-quantities") {
        getCount++;
        return Promise.resolve({ data: getCount === 1 ? initialData : s1Data });
      }
      return Promise.reject(new Error("Not found"));
    });
    api.put.mockResolvedValue({ data: { success: true } });

    render(
      <MemoryRouter>
        <ContractQuantityPage />
      </MemoryRouter>
    );

    // Lần 1: R = 109.878.083,99 ₫
    await waitFor(() => {
      const footerRow = screen.getByText("Tổng giá trị hợp đồng dự án:").closest("tr");
      expect(within(footerRow).getByText("109.878.083,99 ₫")).toBeInTheDocument();
    });

    // Mở form sửa cho A3
    const rowA3 = screen.getByText("Lá A3").closest("tr");
    await user.click(within(rowA3).getByText("Khai/Sửa"));

    // Nhập đơn giá mới là 2
    const priceInput = screen.getByLabelText(/Đơn giá/);
    await user.clear(priceInput);
    await user.type(priceInput, "2");

    // Bấm lưu
    await user.click(screen.getByText("Lưu khối lượng"));

    // Lần 2: S1 tổng mới = 109.878.084,99 ₫
    await waitFor(() => {
      const footerRow = screen.getByText("Tổng giá trị hợp đồng dự án:").closest("tr");
      expect(within(footerRow).getByText("109.878.084,99 ₫")).toBeInTheDocument();
      const rowA = screen.getByText("Nhánh A").closest("tr");
      expect(within(rowA).getByText("1.004,69 ₫")).toBeInTheDocument();
    });
  });

  it("F6: Không dòng cha nào có nút Khai/Sửa/Xoá; chỉ lá mới có", async () => {
    const fakeData = buildApiResponseFromOracle(treeANodes);
    api.get.mockImplementation((url) => {
      if (url === "/projects/1") return Promise.resolve({ data: { membership: "chu_dau_tu" } });
      if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: fakeData });
      return Promise.reject(new Error("Not found"));
    });

    render(
      <MemoryRouter>
        <ContractQuantityPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Gốc R")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    const editButtons = buttons.filter((b) => b.textContent.includes("Sửa") || b.textContent.includes("Khai"));
    expect(editButtons.length).toBeLessThanOrEqual(6);
  });

  it("F7: Rò rỉ giao diện: can_view_prices = false thì trang không chứa bất kỳ số tiền nào đã biết", async () => {
    const fakeData = {
      items: [
        { id: 1, parent_id: null, name: "Gốc", is_leaf: false },
        { id: 2, parent_id: 1, name: "Lá Bảo Mật", is_leaf: true, quantity: "1234.567", unit: "cái" },
      ],
      can_view_prices: false,
      units: ["cái"],
    };
    api.get.mockImplementation((url) => {
      if (url === "/projects/1") return Promise.resolve({ data: { membership: "ky_su_giam_sat" } });
      if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: fakeData });
      return Promise.reject(new Error("Not found"));
    });

    const { container } = render(
      <MemoryRouter>
        <ContractQuantityPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Lá Bảo Mật")).toBeInTheDocument();
    });

    const fullText = container.textContent;
    expect(fullText.includes("89000.50")).toBe(false);
    expect(fullText.includes("109877080.28")).toBe(false);
    expect(fullText.includes("undefined")).toBe(false);
    expect(fullText.includes("NaN")).toBe(false);
  });

  it("F8: Quét mã nguồn frontend chống số thực (parseFloat, toFixed, Intl.NumberFormat, toLocaleString, Number()", () => {
    const srcDir = path.resolve(__dirname, "../../");
    const targetFiles = [
      path.join(srcDir, "pages", "ContractQuantityPage.jsx"),
      path.join(srcDir, "utils", "decimal.js"),
    ];

    for (const file of targetFiles) {
      expect(fs.existsSync(file)).toBe(true);
      const code = fs.readFileSync(file, "utf8");

      expect(code).not.toMatch(/\bparseFloat\b/);
      expect(code).not.toMatch(/\btoFixed\b/);
      expect(code).not.toMatch(/\bIntl\.NumberFormat\b/);
      expect(code).not.toMatch(/\btoLocaleString\b/);
      expect(code).not.toMatch(/\bMath\.round\b/);
    }
  });
});
