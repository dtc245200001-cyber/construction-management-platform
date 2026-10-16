import { describe, it, expect } from "vitest";
import {
  normalizeDecimalInput,
  multiplyAndRoundVND,
  formatMoneyVND,
  formatVND,
  formatQuantityVN,
  formatInputDisplayVN,
} from "../decimal";

describe("T-87 Unit Test: decimal.js", () => {
  const quantityOpts = { maxIntDigits: 11, maxScale: 3, fieldName: "Khối lượng" };
  const priceOpts = { maxIntDigits: 14, maxScale: 2, fieldName: "Đơn giá" };

  describe("1. normalizeDecimalInput", () => {
    it("Chấp nhận '1,5' và '1.5' chuẩn hoá thành '1.5'", () => {
      expect(normalizeDecimalInput("1,5", quantityOpts)).toEqual({ ok: true, value: "1.5" });
      expect(normalizeDecimalInput("1.5", quantityOpts)).toEqual({ ok: true, value: "1.5" });
    });

    it("Chấp nhận '0', '1,2300' (cắt thành '1.23')", () => {
      expect(normalizeDecimalInput("0", quantityOpts)).toEqual({ ok: true, value: "0" });
      expect(normalizeDecimalInput("1,2300", quantityOpts)).toEqual({ ok: true, value: "1.23" });
      expect(normalizeDecimalInput("2,000", quantityOpts)).toEqual({ ok: true, value: "2" });
    });

    it("Chấp nhận giá trị biên tối đa cho phép", () => {
      expect(normalizeDecimalInput("99999999999,999", quantityOpts)).toEqual({
        ok: true,
        value: "99999999999.999",
      });
      expect(normalizeDecimalInput("99999999999999,99", priceOpts)).toEqual({
        ok: true,
        value: "99999999999999.99",
      });
    });

    it("Từ chối số âm, phân tách hàng nghìn, nhiều dấu phân tách, khoảng trắng", () => {
      expect(normalizeDecimalInput("-1", quantityOpts).ok).toBe(false);
      expect(normalizeDecimalInput("1.000.000", quantityOpts).ok).toBe(false);
      expect(normalizeDecimalInput("1.000,5", quantityOpts).ok).toBe(false);
      expect(normalizeDecimalInput("1,5,5", quantityOpts).ok).toBe(false);
      expect(normalizeDecimalInput(" 12", quantityOpts).ok).toBe(false);
      expect(normalizeDecimalInput("1 2", quantityOpts).ok).toBe(false);
      expect(normalizeDecimalInput("1e3", quantityOpts).ok).toBe(false);
      expect(normalizeDecimalInput("abc", quantityOpts).ok).toBe(false);
      expect(normalizeDecimalInput("", quantityOpts).ok).toBe(false);
      expect(normalizeDecimalInput("   ", quantityOpts).ok).toBe(false);
    });

    it("Từ chối quá số chữ số thập phân khác 0 hoặc vượt phần nguyên", () => {
      // 4 chữ số thập phân khác 0 cho khối lượng (max 3)
      const resQ = normalizeDecimalInput("1,0005", quantityOpts);
      expect(resQ.ok).toBe(false);
      expect(resQ.error).toContain("không được có quá 3 chữ số thập phân");

      // 3 chữ số thập phân khác 0 cho đơn giá (max 2)
      const resP = normalizeDecimalInput("0,005", priceOpts);
      expect(resP.ok).toBe(false);
      expect(resP.error).toContain("không được có quá 2 chữ số thập phân");

      // 12 chữ số nguyên cho khối lượng (max 11)
      const resMaxInt = normalizeDecimalInput("100000000000", quantityOpts);
      expect(resMaxInt.ok).toBe(false);
      expect(resMaxInt.error).toContain("vượt quá giới hạn cho phép");
    });
  });

  describe("2. multiplyAndRoundVND (Nhân và làm tròn số học chính xác nửa lên)", () => {
    it("1234.567 x 89000.50 -> '109877080.28'", () => {
      expect(multiplyAndRoundVND("1234.567", "89000.50")).toBe("109877080.28");
    });

    it("2.675 x 1.00 -> '2.68'", () => {
      expect(multiplyAndRoundVND("2.675", "1.00")).toBe("2.68");
    });

    it("1.005 x 1.00 -> '1.01'", () => {
      expect(multiplyAndRoundVND("1.005", "1.00")).toBe("1.01");
    });

    it("0.100 x 0.20 -> '0.02'", () => {
      expect(multiplyAndRoundVND("0.100", "0.20")).toBe("0.02");
    });

    it("333.333 x 3.00 -> '1000.00'", () => {
      expect(multiplyAndRoundVND("333.333", "3.00")).toBe("1000.00");
    });

    it("0.001 x 0.01 -> '0.00'", () => {
      expect(multiplyAndRoundVND("0.001", "0.01")).toBe("0.00");
    });

    it("Biên lớn: 99999999999.999 x 99999999999999.99 -> '9999999999999899000000000.00'", () => {
      expect(
        multiplyAndRoundVND("99999999999.999", "99999999999999.99")
      ).toBe("9999999999999899000000000.00");
    });
  });

  describe("3. formatMoneyVND (Định dạng tiền tệ Việt Nam)", () => {
    it("'1003.69' -> '1.003,69 ₫'", () => {
      expect(formatMoneyVND("1003.69")).toBe("1.003,69 ₫");
    });

    it("'0.00' -> '0,00 ₫'", () => {
      expect(formatMoneyVND("0.00")).toBe("0,00 ₫");
    });

    it("'99999999999999.99' -> '99.999.999.999.999,99 ₫'", () => {
      expect(formatMoneyVND("99999999999999.99")).toBe("99.999.999.999.999,99 ₫");
    });

    it("'9999999999999899000000000.00' -> không mất chữ số", () => {
      expect(formatMoneyVND("9999999999999899000000000.00")).toBe(
        "9.999.999.999.999.899.000.000.000,00 ₫"
      );
    });

    it("null hoặc undefined -> '—'", () => {
      expect(formatMoneyVND(null)).toBe("—");
      expect(formatMoneyVND(undefined)).toBe("—");
      expect(formatMoneyVND("")).toBe("—");
    });

    it("noDecimals option -> không hiển thị phần lẻ", () => {
      expect(formatMoneyVND("15432088", { noDecimals: true })).toBe("15.432.088 ₫");
      expect(formatMoneyVND("15432088.00", { noDecimals: true })).toBe("15.432.088 ₫");
    });
  });

  describe("3b. formatVND (Định dạng tiền VND không lẻ thập phân - T-113)", () => {
    it("15432088 -> '15.432.088 ₫'", () => {
      expect(formatVND("15432088")).toBe("15.432.088 ₫");
    });

    it("15432088.00 -> '15.432.088 ₫'", () => {
      expect(formatVND("15432088.00")).toBe("15.432.088 ₫");
    });

    it("0 -> '0 ₫'", () => {
      expect(formatVND(0)).toBe("0 ₫");
      expect(formatVND("0")).toBe("0 ₫");
      expect(formatVND("0.00")).toBe("0 ₫");
    });

    it("Số lớn không dùng float", () => {
      expect(formatVND("99999999999999")).toBe("99.999.999.999.999 ₫");
    });

    it("null, undefined, rỗng -> '—'", () => {
      expect(formatVND(null)).toBe("—");
      expect(formatVND(undefined)).toBe("—");
      expect(formatVND("")).toBe("—");
    });
  });

  describe("4. formatQuantityVN (Định dạng khối lượng)", () => {
    it("'1234.567' -> '1.234,567'", () => {
      expect(formatQuantityVN("1234.567")).toBe("1.234,567");
    });

    it("'2.000' -> '2'", () => {
      expect(formatQuantityVN("2.000")).toBe("2");
    });

    it("'0.100' -> '0,1'", () => {
      expect(formatQuantityVN("0.100")).toBe("0,1");
    });

    it("null hoặc undefined -> '—'", () => {
      expect(formatQuantityVN(null)).toBe("—");
    });
  });

  describe("5. formatInputDisplayVN", () => {
    it("Chuyển dấu chấm thành dấu phẩy cho input", () => {
      expect(formatInputDisplayVN("123.456")).toBe("123,456");
      expect(formatInputDisplayVN("100")).toBe("100");
      expect(formatInputDisplayVN(null)).toBe("");
    });
  });
});
