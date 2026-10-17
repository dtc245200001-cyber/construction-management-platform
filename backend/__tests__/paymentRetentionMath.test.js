"use strict";

const {
  multiplyPercentAndRoundHalfUp0,
  addCurrency,
  subtractCurrency,
  compareCurrency,
  minCurrency,
} = require("../utils/paymentMath");

describe("S-45 / T-116 retention decimal math", () => {
  test("tính tỷ lệ bằng decimal và làm tròn half-up đến VND", () => {
    expect(multiplyPercentAndRoundHalfUp0("1010.00", "5.00")).toBe("51.00");
    expect(multiplyPercentAndRoundHalfUp0("1001.00", "5.00")).toBe("50.00");
    expect(multiplyPercentAndRoundHalfUp0("15432088.00", "5.25")).toBe("810185.00");
  });

  test("tỷ lệ 0% và 100% cho kết quả biên chính xác", () => {
    expect(multiplyPercentAndRoundHalfUp0("123456.00", "0")).toBe("0.00");
    expect(multiplyPercentAndRoundHalfUp0("123456.00", "100")).toBe("123456.00");
  });

  test("phép cộng/trừ/so sánh tiền không dùng float", () => {
    expect(addCurrency(["100.00", "25.00", "0.50"])).toBe("125.50");
    expect(subtractCurrency("100.00", "25.50")).toBe("74.50");
    expect(compareCurrency("10.00", "9.99")).toBe(1);
    expect(minCurrency("10.00", "9.99")).toBe("9.99");
  });
});
