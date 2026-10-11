import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

vi.mock("../../lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from "../../lib/api";
import ContractQuantityPage from "../ContractQuantityPage.jsx";

// Dữ liệu giả lập cây 2 tầng: Cha (P) có 3 lá (L1, L2, L3) và 1 lá độc lập chưa khai (L4)
const mockContractData = {
  project_id: 1,
  can_view_prices: true,
  units: ["m", "m2", "m3", "md", "kg", "tấn", "lít", "cái", "bộ", "cây", "viên", "tấm", "công", "ca", "trọn gói"],
  project_total: "1003.69",
  items: [
    {
      id: 10,
      parent_id: null,
      code: "HM-P",
      name: "Hạng mục Cha P",
      is_leaf: false,
      quantity: null,
      unit: null,
      unit_price: null,
      contract_value: null,
      contract_total: "1003.69", // Giá trị từ API (1000.00 + 2.68 + 1.01)
    },
    {
      id: 11,
      parent_id: 10,
      code: "HM-L1",
      name: "Hạng mục Lá 1",
      is_leaf: true,
      quantity: "333.333",
      unit: "bộ",
      unit_price: "3.00",
      contract_value: "1000.00",
      contract_total: "1000.00",
    },
    {
      id: 12,
      parent_id: 10,
      code: "HM-L2",
      name: "Hạng mục Lá 2",
      is_leaf: true,
      quantity: "2.675",
      unit: "m2",
      unit_price: "1.00",
      contract_value: "2.68",
      contract_total: "2.68",
    },
    {
      id: 13,
      parent_id: 10,
      code: "HM-L3",
      name: "Hạng mục Lá 3",
      is_leaf: true,
      quantity: "1.005",
      unit: "tấn",
      unit_price: "1.00",
      contract_value: "1.01",
      contract_total: "1.01",
    },
    {
      id: 14,
      parent_id: null,
      code: "HM-L4",
      name: "Hạng mục Chưa Khai",
      is_leaf: true,
      quantity: null,
      unit: null,
      unit_price: null,
      contract_value: null,
      contract_total: "0.00",
    },
    {
      id: 20,
      parent_id: null,
      code: "HM-EMPTY-TREE",
      name: "Nhánh Rỗng Hoàn Toàn",
      is_leaf: false,
      quantity: null,
      unit: null,
      unit_price: null,
      contract_value: null,
      contract_total: "0.00",
    },
    {
      id: 21,
      parent_id: 20,
      code: "HM-EMPTY-CHILD",
      name: "Con Của Nhánh Rỗng",
      is_leaf: true,
      quantity: null,
      unit: null,
      unit_price: null,
      contract_value: null,
      contract_total: "0.00",
    },
  ],
};

const renderPage = (user = { id: 1 }) => {
  return render(
    <BrowserRouter>
      <ContractQuantityPage user={user} />
    </BrowserRouter>
  );
};

describe("ContractQuantityPage (T-87)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("currentProjectId", "1");
  });

  describe("1. Hiển thị cây, tổng giá trị và các nhãn trạng thái", () => {
    test("Hiển thị đúng contract_total của cha từ API ('1.003,69 ₫'), dòng tổng dự án, nhãn 'Chưa khai', và nhánh không có giá trị hiện '—'", async () => {
      // Mock membership và data
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") {
          return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        }
        if (url === "/projects/1/contract-quantities") {
          return Promise.resolve({ data: mockContractData });
        }
        return Promise.reject(new Error("Not found"));
      });

      renderPage();

      // Đợi bảng xuất hiện
      expect(await screen.findByText("Hạng mục Cha P")).toBeInTheDocument();

      // Khẳng định dòng cha có chú thích tự cộng
      expect(
        screen.getAllByText("(Tự cộng từ các hạng mục lá bên dưới)")[0]
      ).toBeInTheDocument();

      // Kiểm tra giá trị của dòng Cha P: phải là 1.003,69 ₫ (lấy từ contract_total của API)
      const parentRow = screen.getByText("Hạng mục Cha P").closest("tr");
      expect(within(parentRow).getByText("1.003,69 ₫")).toBeInTheDocument();

      // Hạng mục cha không có nút Khai/Sửa
      expect(within(parentRow).queryByText("Khai/Sửa")).not.toBeInTheDocument();

      // Hạng mục L4 chưa khai: có badge "Chưa khai" và ô giá trị hiện "—"
      const unassignedRow = screen.getByText("Hạng mục Chưa Khai").closest("tr");
      expect(within(unassignedRow).getByText("Chưa khai")).toBeInTheDocument();

      // Nhánh rỗng hoàn toàn (ID 20): các cột bao gồm giá trị hiện "—"
      const emptyTreeRow = screen.getByText("Nhánh Rỗng Hoàn Toàn").closest("tr");
      expect(within(emptyTreeRow).getAllByText("—").length).toBeGreaterThanOrEqual(4);

      // Dòng tổng dự án cuối bảng
      const footerRow = screen.getByText("Tổng giá trị hợp đồng dự án:").closest("tr");
      expect(within(footerRow).getByText("1.003,69 ₫")).toBeInTheDocument();
    });

    test("Chứng minh giao diện KHÔNG tự cộng lại: nếu API trả contract_total của cha khác tổng các con, giao diện vẫn hiện đúng giá trị API", async () => {
      const mismatchedData = {
        ...mockContractData,
        items: mockContractData.items.map((it) => {
          if (it.id === 10) {
            return { ...it, contract_total: "9999.99" };
          }
          return it;
        }),
      };

      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mismatchedData });
        return Promise.reject(new Error("Not found"));
      });

      renderPage();

      expect(await screen.findByText("Hạng mục Cha P")).toBeInTheDocument();
      const parentRow = screen.getByText("Hạng mục Cha P").closest("tr");
      // Phải hiển thị đúng 9.999,99 ₫ theo API, không tự cộng lại 1000 + 2.68 + 1.01
      expect(within(parentRow).getByText("9.999,99 ₫")).toBeInTheDocument();
    });
  });

  describe("2. Vai trò chỉ xem khối lượng (Ẩn giá)", () => {
    test("Khi can_view_prices là false: không có cột Đơn giá, Giá trị, dòng tổng; DOM không chứa 'undefined' hay 'NaN'", async () => {
      const quantityOnlyData = {
        project_id: 1,
        can_view_prices: false,
        units: ["m3", "tấn"],
        items: [
          {
            id: 11,
            parent_id: null,
            code: "HM-L1",
            name: "Hạng mục Lá 1",
            is_leaf: true,
            quantity: "333.333",
            unit: "bộ",
          },
        ],
      };

      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ky_su_giam_sat" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: quantityOnlyData });
        return Promise.reject(new Error("Not found"));
      });

      const { container } = renderPage();

      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      // Kiểm tra tiêu đề các cột: Không có "Đơn giá" và "Giá trị (₫)"
      expect(screen.queryByText("Đơn giá")).not.toBeInTheDocument();
      expect(screen.queryByText("Giá trị (₫)")).not.toBeInTheDocument();
      expect(screen.queryByText("Tổng giá trị hợp đồng dự án:")).not.toBeInTheDocument();

      // Kiểm tra DOM không chứa undefined hay NaN
      expect(container.innerHTML).not.toContain("undefined");
      expect(container.innerHTML).not.toContain("NaN");
    });
  });

  describe("3. Xử lý lỗi 403 và Lỗi mạng", () => {
    test("403 khi tải: hiện thông báo từ chối truy cập và không hiện bảng", async () => {
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "doi_truong" } });
        if (url === "/projects/1/contract-quantities") {
          const err = new Error("Forbidden");
          err.response = { status: 403 };
          return Promise.reject(err);
        }
        return Promise.reject(new Error("Not found"));
      });

      renderPage();

      expect(
        await screen.findByText("Bạn không có quyền xem khối lượng hợp đồng của dự án này. Vui lòng liên hệ ban quản lý nếu bạn cần quyền truy cập.")
      ).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    test("Lỗi mạng: hiện thông báo lỗi và nút Thử lại hoạt động", async () => {
      let callCount = 0;
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") {
          callCount++;
          if (callCount === 1) {
            const err = new Error("Network Error");
            err.response = { data: { message: "Mạng mất kết nối" } };
            return Promise.reject(err);
          }
          return Promise.resolve({ data: mockContractData });
        }
        return Promise.reject(new Error("Not found"));
      });

      renderPage();

      expect(await screen.findByText("Mạng mất kết nối")).toBeInTheDocument();
      const retryBtn = screen.getByText("Thử lại");
      expect(retryBtn).toBeInTheDocument();

      // Bấm Thử lại -> tải thành công
      await userEvent.click(retryBtn);
      expect(await screen.findByText("Hạng mục Cha P")).toBeInTheDocument();
    });
  });

  describe("4. Phân quyền nút Khai/Sửa theo vai trò", () => {
    test("chu_dau_tu và ban_quan_ly có nút Khai/Sửa; ke_toan không có nút; khi vai trò chưa tải xong thì không có nút", async () => {
      // 1. ban_quan_ly
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });

      const { unmount } = renderPage();
      expect(await screen.findByText("Hạng mục Cha P")).toBeInTheDocument();
      expect(screen.getAllByText("Khai/Sửa").length).toBeGreaterThan(0);
      unmount();

      // 2. ke_toan
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ke_toan" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });

      renderPage();
      expect(await screen.findByText("Hạng mục Cha P")).toBeInTheDocument();
      expect(screen.queryByText("Khai/Sửa")).not.toBeInTheDocument();
    });
  });

  describe("5. Luồng nhập liệu, tính toán dự kiến và kiểm tra đầu vào", () => {
    test("Form điền sẵn giá trị hiện tại (dấu phẩy); nhập '1,5' được chấp nhận và gửi payload là '1.5'", async () => {
      const user = userEvent.setup();
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });
      api.put.mockResolvedValue({ data: { success: true } });

      renderPage();
      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      // Bấm nút Khai/Sửa của Lá 1 (đang có 333.333, 3.00)
      const leaf1Row = screen.getByText("Hạng mục Lá 1").closest("tr");
      await user.click(within(leaf1Row).getByText("Khai/Sửa"));

      // Tìm input khối lượng và đơn giá qua id
      const qInput = document.getElementById("field-quantity");
      expect(qInput.value).toBe("333,333");

      // Xoá và nhập "1,5"
      await user.clear(qInput);
      await user.type(qInput, "1,5");

      // Bấm Lưu
      const saveBtn = screen.getByText("Lưu khối lượng");
      await user.click(saveBtn);

      await waitFor(() => {
        expect(api.put).toHaveBeenCalledWith(
          "/projects/1/work-items/11/contract-quantity",
          expect.objectContaining({
            quantity: "1.5",
          })
        );
      });
    });

    test("Chặn dấu phân cách hàng nghìn '1.000' và số âm, không gọi API", async () => {
      const user = userEvent.setup();
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });

      renderPage();
      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      const leaf1Row = screen.getByText("Hạng mục Lá 1").closest("tr");
      await user.click(within(leaf1Row).getByText("Khai/Sửa"));

      const qInput = document.getElementById("field-quantity");
      await user.clear(qInput);
      await user.type(qInput, "1.000.000");

      const saveBtn = screen.getByText("Lưu khối lượng");
      await user.click(saveBtn);

      // Phải hiện thông báo lỗi và KHÔNG gọi api.put
      expect(
        await screen.findByText("Không nhập dấu phân cách hàng nghìn; chỉ dùng dấu phẩy hoặc dấu chấm cho phần thập phân")
      ).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    test("Ô 'Giá trị dự kiến' tự động cập nhật khi gõ '333,333' và '3' thành '1.000,00 ₫'", async () => {
      const user = userEvent.setup();
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });

      renderPage();
      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      const leaf1Row = screen.getByText("Hạng mục Lá 1").closest("tr");
      await user.click(within(leaf1Row).getByText("Khai/Sửa"));

      const qInput = document.getElementById("field-quantity");
      const pInput = document.getElementById("field-unit-price");

      await user.clear(qInput);
      await user.type(qInput, "333,333");

      await user.clear(pInput);
      await user.type(pInput, "3");

      // 333.333 * 3 = 999.999 làm tròn thành 1.000,00 ₫ trong ô Giá trị dự kiến của dialog
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("1.000,00 ₫")).toBeInTheDocument();
    });
  });

  describe("6. Xử lý sau lưu, lỗi 400, 422 và chống bấm đúp", () => {
    test("Sau lưu thành công: gọi lại GET lần thứ hai để lấy tổng mới", async () => {
      const user = userEvent.setup();
      let getCount = 0;
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") {
          getCount++;
          return Promise.resolve({ data: mockContractData });
        }
        return Promise.reject(new Error("Not found"));
      });
      api.put.mockResolvedValue({ data: { success: true } });

      renderPage();
      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      const leaf1Row = screen.getByText("Hạng mục Lá 1").closest("tr");
      await user.click(within(leaf1Row).getByText("Khai/Sửa"));

      await user.click(screen.getByText("Lưu khối lượng"));

      await waitFor(() => {
        expect(getCount).toBe(2);
      });
    });

    test("Lỗi 400 có errors: hiện lỗi dưới đúng trường và giữ nguyên form", async () => {
      const user = userEvent.setup();
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });
      const err = new Error("Bad Request");
      err.response = {
        status: 400,
        data: {
          errors: {
            quantity: "Khối lượng không được âm",
            unit_price: "Đơn giá không hợp lệ",
          },
        },
      };
      api.put.mockRejectedValue(err);

      renderPage();
      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      const leaf1Row = screen.getByText("Hạng mục Lá 1").closest("tr");
      await user.click(within(leaf1Row).getByText("Khai/Sửa"));

      await user.click(screen.getByText("Lưu khối lượng"));

      expect(await screen.findByText("Khối lượng không được âm")).toBeInTheDocument();
      expect(await screen.findByText("Đơn giá không hợp lệ")).toBeInTheDocument();
      // Form vẫn mở
      expect(screen.getByText("Khai báo Khối lượng Hợp đồng")).toBeInTheDocument();
    });

    test("Lỗi 422: hiện thông báo lỗi và gọi lại GET", async () => {
      const user = userEvent.setup();
      let getCount = 0;
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") {
          getCount++;
          return Promise.resolve({ data: mockContractData });
        }
        return Promise.reject(new Error("Not found"));
      });
      const err = new Error("Unprocessable Entity");
      err.response = {
        status: 422,
        data: {
          message: "Hạng mục cha không khai khối lượng hợp đồng trực tiếp",
        },
      };
      api.put.mockRejectedValue(err);

      renderPage();
      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      const leaf1Row = screen.getByText("Hạng mục Lá 1").closest("tr");
      await user.click(within(leaf1Row).getByText("Khai/Sửa"));

      await user.click(screen.getByText("Lưu khối lượng"));

      expect(
        await screen.findByText("Hạng mục cha không khai khối lượng hợp đồng trực tiếp")
      ).toBeInTheDocument();
      expect(getCount).toBe(2);
    });

    test("Bấm đúp nút lưu chỉ gửi một request", async () => {
      const user = userEvent.setup();
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });

      // Trì hoãn resolve để nút lưu rơi vào trạng thái disabled
      api.put.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: { ok: true } }), 200))
      );

      renderPage();
      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      const leaf1Row = screen.getByText("Hạng mục Lá 1").closest("tr");
      await user.click(within(leaf1Row).getByText("Khai/Sửa"));

      const saveBtn = screen.getByText("Lưu khối lượng");
      await user.click(saveBtn);
      await user.click(saveBtn); // click lần 2

      expect(api.put).toHaveBeenCalledTimes(1);
    });
  });

  describe("7. Hộp thoại xác nhận xoá khối lượng", () => {
    test("Xoá có hộp xác nhận; huỷ thì không gọi API; xác nhận gọi DELETE rồi tải lại", async () => {
      const user = userEvent.setup();
      let getCount = 0;
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") {
          getCount++;
          return Promise.resolve({ data: mockContractData });
        }
        return Promise.reject(new Error("Not found"));
      });
      api.delete.mockResolvedValue({ data: { ok: true } });

      renderPage();
      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      const leaf1Row = screen.getByText("Hạng mục Lá 1").closest("tr");
      const deleteIconBtn = within(leaf1Row).getByTitle("Xoá khối lượng hợp đồng");

      // Bấm nút xoá
      await user.click(deleteIconBtn);

      // Mở modal xác nhận
      expect(await screen.findByText("Xoá khối lượng hợp đồng?")).toBeInTheDocument();

      // Bấm Huỷ
      await user.click(screen.getByText("Huỷ"));
      expect(api.delete).not.toHaveBeenCalled();

      // Bấm lại và Xác nhận xoá
      await user.click(deleteIconBtn);
      const confirmBtn = await screen.findByText("Xác nhận xoá");
      await user.click(confirmBtn);

      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith(
          "/projects/1/work-items/11/contract-quantity"
        );
        expect(getCount).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe("8. Test quét mã nguồn (Static Code Analysis - Không dùng số thực cho tiền)", () => {
    test("Các file mới không chứa parseFloat, toFixed, Intl.NumberFormat, toLocaleString, Number(", () => {
      const filesToCheck = [
        path.resolve(__dirname, "../ContractQuantityPage.jsx"),
        path.resolve(__dirname, "../../utils/decimal.js"),
      ];

      const forbiddenPatterns = [
        /parseFloat/g,
        /toFixed/g,
        /Intl\.NumberFormat/g,
        /toLocaleString/g,
        /\bNumber\s*\(/g,
      ];

      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, "utf-8");
        for (const pattern of forbiddenPatterns) {
          const match = content.match(pattern);
          expect(
            match,
            `Phát hiện từ khoá cấm ${pattern} trong file ${path.basename(filePath)}`
          ).toBeNull();
        }
      }
    });
  });

  describe("9. Các cải tiến Form theo Phần A (T-87)", () => {
    test("(a) Khai mới: ô đơn vị trống, placeholder 'Chọn đơn vị', Lưu bị chặn kèm lỗi 'Vui lòng chọn đơn vị', không gọi API", async () => {
      const user = userEvent.setup();
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });

      renderPage();
      expect(await screen.findByText("Hạng mục Chưa Khai")).toBeInTheDocument();

      // Mở modal khai mới cho HM-L4 (chưa khai, unit null)
      const unassignedRow = screen.getByText("Hạng mục Chưa Khai").closest("tr");
      await user.click(within(unassignedRow).getByText("Khai/Sửa"));

      // Ô đơn vị hiển thị placeholder "Chọn đơn vị"
      const unitTrigger = document.getElementById("field-unit");
      expect(within(unitTrigger).getByText("Chọn đơn vị")).toBeInTheDocument();

      // Nhập khối lượng và đơn giá hợp lệ nhưng KHÔNG chọn đơn vị
      const qInput = document.getElementById("field-quantity");
      const pInput = document.getElementById("field-unit-price");
      await user.type(qInput, "10");
      await user.type(pInput, "50000");

      // Bấm Lưu
      const saveBtn = screen.getByText("Lưu khối lượng");
      await user.click(saveBtn);

      // Phải báo lỗi "Vui lòng chọn đơn vị" và KHÔNG gọi API
      expect(await screen.findByText("Vui lòng chọn đơn vị")).toBeInTheDocument();
      expect(api.put).not.toHaveBeenCalled();
    });

    test("(b) Sửa hạng mục đã có giá trị: đơn vị được điền sẵn; hiện đơn vị cạnh ô khối lượng", async () => {
      const user = userEvent.setup();
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });

      renderPage();
      expect(await screen.findByText("Hạng mục Lá 1")).toBeInTheDocument();

      // Mở modal sửa HM-L1 (đã có unit "bộ")
      const leaf1Row = screen.getByText("Hạng mục Lá 1").closest("tr");
      await user.click(within(leaf1Row).getByText("Khai/Sửa"));

      // Ô đơn vị điền sẵn "bộ"
      const unitTrigger = document.getElementById("field-unit");
      expect(within(unitTrigger).getByText("bộ")).toBeInTheDocument();

      // A4: Tên đơn vị hiện cạnh ô khối lượng
      expect(screen.getByText("Đơn vị: bộ")).toBeInTheDocument();
    });

    test("(c) Ô thành tiền dự kiến hiện '—' khi chưa nhập đủ và hiện đúng khi nhập đủ ('333,333' và '3' ra '1.000,00 ₫'); có dòng chú thích '= Khối lượng × Đơn giá'", async () => {
      const user = userEvent.setup();
      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: mockContractData });
        return Promise.reject(new Error("Not found"));
      });

      renderPage();
      expect(await screen.findByText("Hạng mục Chưa Khai")).toBeInTheDocument();

      const unassignedRow = screen.getByText("Hạng mục Chưa Khai").closest("tr");
      await user.click(within(unassignedRow).getByText("Khai/Sửa"));

      const dialog = screen.getByRole("dialog");
      // Dòng chú thích công thức
      expect(within(dialog).getByText("= Khối lượng × Đơn giá")).toBeInTheDocument();

      // Ban đầu chưa nhập đủ: hiện "—"
      expect(within(dialog).getByText("—")).toBeInTheDocument();

      const qInput = document.getElementById("field-quantity");
      const pInput = document.getElementById("field-unit-price");

      // Nhập khối lượng nhưng chưa nhập đơn giá: vẫn là "—"
      await user.type(qInput, "333,333");
      expect(within(dialog).getByText("—")).toBeInTheDocument();

      // Nhập tiếp đơn giá 3: ô thành tiền dự kiến hiện 1.000,00 ₫
      await user.type(pInput, "3");
      expect(within(dialog).getByText("1.000,00 ₫")).toBeInTheDocument();
    });

    test("(d) Dòng hạng mục trong form không có dấu '–' khi hạng mục không có mã; chỉ hiện tên", async () => {
      const user = userEvent.setup();
      const noCodeData = {
        ...mockContractData,
        items: [
          ...mockContractData.items,
          {
            id: 99,
            parent_id: null,
            code: null,
            name: "Hạng mục Không Có Mã",
            is_leaf: true,
            quantity: null,
            unit: null,
            unit_price: null,
            contract_value: null,
            contract_total: "0.00",
          },
        ],
      };

      api.get.mockImplementation((url) => {
        if (url === "/projects/1") return Promise.resolve({ data: { membership: "ban_quan_ly" } });
        if (url === "/projects/1/contract-quantities") return Promise.resolve({ data: noCodeData });
        return Promise.reject(new Error("Not found"));
      });

      renderPage();
      expect(await screen.findByText("Hạng mục Không Có Mã")).toBeInTheDocument();

      const row = screen.getByText("Hạng mục Không Có Mã").closest("tr");
      await user.click(within(row).getByText("Khai/Sửa"));

      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Hạng mục Không Có Mã")).toBeInTheDocument();
      // Khẳng định không có dấu gạch '–' hoặc '—' trong tiêu đề hạng mục
      const headerBox = within(dialog).getByText("Hạng mục Không Có Mã").parentElement;
      expect(headerBox.textContent).toBe("Hạng mục Không Có Mã");
      expect(headerBox.textContent).not.toContain("–");
      expect(headerBox.textContent).not.toContain("—");
    });
  });
});
