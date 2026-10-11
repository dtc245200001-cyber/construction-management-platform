"use strict";

const fs = require("fs");
const path = require("path");

describe("T10: Quét mã nguồn tĩnh chống số thực (Float Guard)", () => {
  const backendRoot = path.resolve(__dirname, "..");

  const targetFiles = [
    path.join(backendRoot, "routes", "contractQuantityRoutes.js"),
    path.join(backendRoot, "utils", "decimalInput.js"),
    path.join(backendRoot, "utils", "contractUnits.js"),
    path.join(backendRoot, "migrations", "1798000000000_add-contract-quantity-to-work-items.js"),
    path.join(backendRoot, "migrations", "1798100000000_add-contract-leaf-guard-to-work-items.js"),
  ];

  test("Không file mã nguồn nào của T-85/T-86 chứa parseFloat, toFixed, Math.round", () => {
    for (const file of targetFiles) {
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, "utf8");

      expect(content).not.toMatch(/\bparseFloat\b/);
      expect(content).not.toMatch(/\btoFixed\b/);
      expect(content).not.toMatch(/\bMath\.round\b/);
    }
  });

  test("Các file migration của T-85 không chứa các kiểu dữ liệu float, real, double precision, money", () => {
    const migrationFiles = [
      path.join(backendRoot, "migrations", "1798000000000_add-contract-quantity-to-work-items.js"),
      path.join(backendRoot, "migrations", "1798100000000_add-contract-leaf-guard-to-work-items.js"),
    ];

    for (const file of migrationFiles) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toMatch(/\bfloat\b/i);
      expect(content).not.toMatch(/\breal\b/i);
      expect(content).not.toMatch(/\bdouble\s+precision\b/i);
      expect(content).not.toMatch(/\bmoney\b/i);
    }
  });

  test("Hàm Number() chỉ được dùng trong parsePositiveInt hoặc phân trang không liên quan tiền tệ", () => {
    // contractQuantityRoutes chỉ được dùng parsePositiveInt cho projectId/workItemId
    const content = fs.readFileSync(path.join(backendRoot, "routes", "contractQuantityRoutes.js"), "utf8");
    // Kiểm tra không có phép tính Number() trực tiếp lên giá trị tiền
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Nếu có Number(, đảm bảo chỉ liên quan tới ID hoặc index
      if (line.includes("Number(")) {
        expect(line).toMatch(/id|Id|index|Index/);
      }
    }
  });
});
