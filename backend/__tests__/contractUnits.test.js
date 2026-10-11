"use strict";

const { normalizeContractUnit, VALID_CONTRACT_UNITS } = require("../utils/contractUnits");

describe("T-86 Unit Test: contractUnits.js", () => {
  it("Chuẩn hoá thành công các đơn vị thường gặp", () => {
    expect(normalizeContractUnit("m")).toBe("m");
    expect(normalizeContractUnit("m2")).toBe("m2");
    expect(normalizeContractUnit("M2")).toBe("m2");
    expect(normalizeContractUnit("m²")).toBe("m2");
    expect(normalizeContractUnit("M²")).toBe("m2");
    expect(normalizeContractUnit("m3")).toBe("m3");
    expect(normalizeContractUnit("m³")).toBe("m3");
    expect(normalizeContractUnit(" Tấn ")).toBe("tấn");
    expect(normalizeContractUnit("TẤN")).toBe("tấn");
    expect(normalizeContractUnit("trọn gói")).toBe("trọn gói");
    expect(normalizeContractUnit("TRỌN GÓI")).toBe("trọn gói");
    expect(normalizeContractUnit("cái")).toBe("cái");
  });

  it("Từ chối các đơn vị không hợp lệ hoặc sai kiểu", () => {
    expect(normalizeContractUnit("xyz")).toBeNull();
    expect(normalizeContractUnit("")).toBeNull();
    expect(normalizeContractUnit("   ")).toBeNull();
    expect(normalizeContractUnit(123)).toBeNull();
    expect(normalizeContractUnit(null)).toBeNull();
    expect(normalizeContractUnit(undefined)).toBeNull();
    expect(normalizeContractUnit("a".repeat(40))).toBeNull();
  });

  it("Danh sách VALID_CONTRACT_UNITS đầy đủ các đơn vị theo yêu cầu", () => {
    const required = [
      "m", "m2", "m3", "md", "kg", "tấn", "lít", "cái", "bộ", "cây", "viên", "tấm", "công", "ca", "trọn gói"
    ];
    for (const u of required) {
      expect(VALID_CONTRACT_UNITS).toContain(u);
    }
  });
});
