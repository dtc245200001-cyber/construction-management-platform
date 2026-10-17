"use strict";

const { parseDecimalInput } = require("../utils/decimalInput");

describe("T-86 Unit Test: decimalInput.js", () => {
  const quantityOpts = { maxIntDigits: 11, maxScale: 3, fieldName: "Khối lượng" };
  const priceOpts = { maxIntDigits: 14, maxScale: 2, fieldName: "Đơn giá" };

  describe("1. Các ca hợp lệ (chấp nhận)", () => {
    it("Chấp nhận chuỗi số nguyên và số thập phân hợp lệ", () => {
      const res1 = parseDecimalInput("1234.567", quantityOpts);
      expect(res1.valid).toBe(true);
      expect(res1.value).toBe("1234.567");

      const res2 = parseDecimalInput("89000.50", priceOpts);
      expect(res2.valid).toBe(true);
      expect(res2.value).toBe("89000.50");
    });

    it("Chấp nhận '0', 0, '0.00'", () => {
      expect(parseDecimalInput("0", quantityOpts)).toEqual({ valid: true, value: "0" });
      expect(parseDecimalInput(0, quantityOpts)).toEqual({ valid: true, value: "0" });
      expect(parseDecimalInput("0.00", quantityOpts)).toEqual({ valid: true, value: "0.00" });
    });

    it("Chấp nhận phần thập phân thừa toàn số 0 và cắt gọn (ví dụ '1.2300' thành '1.230')", () => {
      const res = parseDecimalInput("1.2300", quantityOpts);
      expect(res.valid).toBe(true);
      expect(res.value).toBe("1.230");
    });

    it("Chấp nhận giá trị biên tối đa cho phép", () => {
      const resQ = parseDecimalInput("99999999999.999", quantityOpts);
      expect(resQ.valid).toBe(true);
      expect(resQ.value).toBe("99999999999.999");

      const resP = parseDecimalInput("99999999999999.99", priceOpts);
      expect(resP.valid).toBe(true);
      expect(resP.value).toBe("99999999999999.99");
    });

    it("Chấp nhận số JSON thông thường có tối đa 15 chữ số", () => {
      const resNumQ = parseDecimalInput(1234.567, quantityOpts);
      expect(resNumQ.valid).toBe(true);
      expect(resNumQ.value).toBe("1234.567");

      const resNumP = parseDecimalInput(89000.5, priceOpts);
      expect(resNumP.valid).toBe(true);
      expect(resNumP.value).toBe("89000.5");
    });
  });

  describe("2. Các ca từ chối (lỗi 400)", () => {
    it("Từ chối số âm", () => {
      expect(parseDecimalInput(-1, quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("-0.001", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("-10", priceOpts).error).toContain("không được âm");
    });

    it("Từ chối boolean, null, undefined, mảng, object, chuỗi rỗng", () => {
      expect(parseDecimalInput(true, quantityOpts).valid).toBe(false);
      expect(parseDecimalInput(false, quantityOpts).valid).toBe(false);
      expect(parseDecimalInput(null, quantityOpts).valid).toBe(false);
      expect(parseDecimalInput(undefined, quantityOpts).valid).toBe(false);
      expect(parseDecimalInput([], quantityOpts).valid).toBe(false);
      expect(parseDecimalInput({}, quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("   ", quantityOpts).valid).toBe(false);
    });

    it("Từ chối chuỗi chữ, ký hiệu, dấu phẩy, dấu cộng, ký hiệu khoa học", () => {
      expect(parseDecimalInput("abc", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("1,5", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("+5", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("1e3", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("1E3", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("1e-2", quantityOpts).valid).toBe(false);
    });

    it("Từ chối dạng thiếu số '.5', '5.', phân tách hàng nghìn '1.000.000', khoảng trắng giữa số ' 12 3 '", () => {
      expect(parseDecimalInput(".5", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("5.", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput("1.000.000", quantityOpts).valid).toBe(false);
      expect(parseDecimalInput(" 12 3 ", quantityOpts).valid).toBe(false);
    });

    it("Từ chối khi phần thập phân có quá nhiều chữ số khác 0 (tránh Postgres làm tròn im lặng)", () => {
      // quantity max scale = 3
      const resQ = parseDecimalInput("1.0005", quantityOpts);
      expect(resQ.valid).toBe(false);
      expect(resQ.error).toContain("không được có quá 3 chữ số thập phân");

      // price max scale = 2
      const resP = parseDecimalInput("0.005", priceOpts);
      expect(resP.valid).toBe(false);
      expect(resP.error).toContain("không được có quá 2 chữ số thập phân");
    });

    it("Từ chối khi phần nguyên vượt quá giới hạn", () => {
      // quantity max int = 11 digits
      const resQ = parseDecimalInput("100000000000", quantityOpts); // 12 digits
      expect(resQ.valid).toBe(false);
      expect(resQ.error).toContain("vượt quá giới hạn cho phép");

      // price max int = 14 digits
      const resP = parseDecimalInput("100000000000000", priceOpts); // 15 digits
      expect(resP.valid).toBe(false);
      expect(resP.error).toContain("vượt quá giới hạn cho phép");
    });

    it("Từ chối số JSON có hơn 15 chữ số có nghĩa vì có thể đã mất độ chính xác", () => {
      const res = parseDecimalInput(1234567890123456, quantityOpts);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("vui lòng gửi dạng chuỗi");
    });
  });
});
