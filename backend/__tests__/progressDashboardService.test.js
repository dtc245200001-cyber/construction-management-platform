"use strict";

// S-49 / T-124 — Unit test các hàm thuần của progressDashboardService.
// Kiểm tra parse số không NaN/Infinity, chia an toàn mẫu số 0, parse ngày.

const svc = require("../services/progressDashboardService");
const { qtyToMillis, moneyToCents, centsToStr, percentRatio } = svc._internal;

describe("progressDashboardService — hàm thuần", () => {
  describe("qtyToMillis (NUMERIC x,3 -> bigint x1000)", () => {
    it("chuyển số nguyên và thập phân đúng", () => {
      expect(qtyToMillis("1200")).toBe(1200000n);
      expect(qtyToMillis("12.5")).toBe(12500n);
      expect(qtyToMillis("0.001")).toBe(1n);
      expect(qtyToMillis("300.000")).toBe(300000n);
    });
    it("hỗ trợ số âm", () => {
      expect(qtyToMillis("-5.5")).toBe(-5500n);
    });
    it("trả null cho giá trị không hợp lệ", () => {
      expect(qtyToMillis(null)).toBeNull();
      expect(qtyToMillis(undefined)).toBeNull();
      expect(qtyToMillis("abc")).toBeNull();
      expect(qtyToMillis("")).toBeNull();
      expect(qtyToMillis("1.2.3")).toBeNull();
    });
  });

  describe("moneyToCents (NUMERIC x,2 -> bigint x100)", () => {
    it("chuyển đúng tiền", () => {
      expect(moneyToCents("2500000.00")).toBe(250000000n);
      expect(moneyToCents("1234.56")).toBe(123456n);
      expect(moneyToCents("0.01")).toBe(1n);
    });
    it("trả null cho giá trị không hợp lệ", () => {
      expect(moneyToCents(null)).toBeNull();
      expect(moneyToCents("xyz")).toBeNull();
    });
  });

  describe("centsToStr", () => {
    it("chuyển cents về chuỗi tiền", () => {
      expect(centsToStr(250000000n)).toBe("2500000.00");
      expect(centsToStr(123456n)).toBe("1234.56");
      expect(centsToStr(5n)).toBe("0.05");
    });
    it("xử lý số âm", () => {
      expect(centsToStr(-100n)).toBe("-1.00");
    });
  });

  describe("percentRatio — tỷ lệ phần trăm an toàn", () => {
    it("tính đúng phần trăm", () => {
      expect(percentRatio(50n, 100n)).toBe(50);
      expect(percentRatio(1n, 3n)).toBeCloseTo(33.33, 2);
      expect(percentRatio(0n, 100n)).toBe(0);
    });
    it("mẫu số 0 hoặc âm -> null (không NaN/Infinity)", () => {
      expect(percentRatio(100n, 0n)).toBeNull();
      expect(percentRatio(100n, -50n)).toBeNull();
    });
    it("tử số âm -> null (không tiến độ âm)", () => {
      expect(percentRatio(-10n, 100n)).toBeNull();
    });
    it("null input -> null", () => {
      expect(percentRatio(null, 100n)).toBeNull();
      expect(percentRatio(50n, null)).toBeNull();
    });
    it("clamp vượt 100% (lũy kế vượt hợp đồng) về 100", () => {
      expect(percentRatio(150n, 100n)).toBe(100);
    });
    it("không bao giờ trả NaN hoặc Infinity", () => {
      const cases = [
        [0n, 0n],
        [10n, 0n],
        [null, null],
        [999999999n, 1n],
      ];
      cases.forEach(([a, b]) => {
        const r = percentRatio(a, b);
        if (r !== null) expect(Number.isFinite(r)).toBe(true);
      });
    });
  });
});
