"use strict";

const {
  multiplyAndRoundHalfUp,
} = require("./helpers/exactDecimal");
const { calculateTreeTotals } = require("./helpers/treeOracle");
const fixtures = require("./fixtures/contract-totals-expected.json");

describe("T1: Máy tính đối chứng độc lập (BigInt Exact Decimal)", () => {
  describe("1. Kiểm tra từng lá của Cây A", () => {
    test("A1: 333.333 x 3.00 = 1000.00", () => {
      expect(multiplyAndRoundHalfUp("333.333", "3.00")).toBe("1000.00");
    });

    test("A2: 2.675 x 1.00 = 2.68", () => {
      expect(multiplyAndRoundHalfUp("2.675", "1.00")).toBe("2.68");
    });

    test("A3: 1.005 x 1.00 = 1.01", () => {
      expect(multiplyAndRoundHalfUp("1.005", "1.00")).toBe("1.01");
    });

    test("B11: 1234.567 x 89000.50 = 109877080.28", () => {
      expect(multiplyAndRoundHalfUp("1234.567", "89000.50")).toBe("109877080.28");
    });

    test("B12: 0.001 x 0.01 = 0.00", () => {
      expect(multiplyAndRoundHalfUp("0.001", "0.01")).toBe("0.00");
    });

    test("B2: 0.100 x 0.20 = 0.02", () => {
      expect(multiplyAndRoundHalfUp("0.100", "0.20")).toBe("0.02");
    });
  });

  describe("2. Kiểm tra tổng cây A và các kịch bản", () => {
    test("Tổng cây A khớp chính xác vector cố định", () => {
      const result = calculateTreeTotals(fixtures.treeA.nodes);

      expect(result.nodeValues.get("A1")).toBe("1000.00");
      expect(result.nodeValues.get("A2")).toBe("2.68");
      expect(result.nodeValues.get("A3")).toBe("1.01");
      expect(result.nodeTotals.get("A")).toBe("1003.69");

      expect(result.nodeValues.get("B11")).toBe("109877080.28");
      expect(result.nodeValues.get("B12")).toBe("0.00");
      expect(result.nodeTotals.get("B1")).toBe("109877080.28");
      expect(result.nodeValues.get("B2")).toBe("0.02");
      expect(result.nodeTotals.get("B")).toBe("109877080.30");

      expect(result.nodeTotals.get("R")).toBe("109878083.99");
      expect(result.projectTotal).toBe("109878083.99");
    });

    test("Kịch bản S1: Đổi đơn giá A3 thành 2.00", () => {
      const nodes = JSON.parse(JSON.stringify(fixtures.treeA.nodes));
      const a3 = nodes.find((n) => n.id === "A3");
      a3.unit_price = "2.00";

      const result = calculateTreeTotals(nodes);
      expect(result.nodeValues.get("A3")).toBe("2.01");
      expect(result.nodeTotals.get("A")).toBe("1004.69");
      expect(result.projectTotal).toBe("109878084.99");
    });

    test("Kịch bản S2: Xóa khối lượng của A2", () => {
      const nodes = JSON.parse(JSON.stringify(fixtures.treeA.nodes));
      const a2 = nodes.find((n) => n.id === "A2");
      delete a2.quantity;
      delete a2.unit_price;

      const result = calculateTreeTotals(nodes);
      expect(result.nodeValues.get("A2")).toBeNull();
      expect(result.nodeTotals.get("A2")).toBe("0.00");
      expect(result.nodeTotals.get("A")).toBe("1001.01");
      expect(result.projectTotal).toBe("109878081.31");
    });

    test("Kịch bản S3: Xóa khối lượng của B12", () => {
      const nodes = JSON.parse(JSON.stringify(fixtures.treeA.nodes));
      const b12 = nodes.find((n) => n.id === "B12");
      delete b12.quantity;
      delete b12.unit_price;

      const result = calculateTreeTotals(nodes);
      expect(result.nodeValues.get("B12")).toBeNull();
      expect(result.nodeTotals.get("B12")).toBe("0.00");
      expect(result.nodeTotals.get("B1")).toBe("109877080.28");
      expect(result.nodeTotals.get("B")).toBe("109877080.30");
      expect(result.projectTotal).toBe("109878083.99");
    });

    test("Kịch bản S4: Xóa mọi khối lượng của A", () => {
      const nodes = JSON.parse(JSON.stringify(fixtures.treeA.nodes));
      for (const n of nodes) {
        if (["A1", "A2", "A3"].includes(n.id)) {
          delete n.quantity;
          delete n.unit_price;
        }
      }

      const result = calculateTreeTotals(nodes);
      expect(result.nodeTotals.get("A")).toBe("0.00");
      expect(result.projectTotal).toBe("109877080.30");
    });
  });

  describe("3. Kiểm tra các vector bổ sung (V1 -> V4)", () => {
    test("V1: Ba lá nhỏ 0.333 x 1.00 -> tổng 0.99 (không trượt thành 1.00)", () => {
      const v1 = fixtures.additionalVectors.V1;
      const leafVal = multiplyAndRoundHalfUp(v1.leaf_quantity, v1.leaf_unit_price);
      expect(leafVal).toBe("0.33");

      const nodes = [
        { id: "P", parent_id: null },
        { id: "L1", parent_id: "P", quantity: v1.leaf_quantity, unit_price: v1.leaf_unit_price },
        { id: "L2", parent_id: "P", quantity: v1.leaf_quantity, unit_price: v1.leaf_unit_price },
        { id: "L3", parent_id: "P", quantity: v1.leaf_quantity, unit_price: v1.leaf_unit_price },
      ];
      const result = calculateTreeTotals(nodes);
      expect(result.nodeTotals.get("P")).toBe("0.99");
    });

    test("V2: Hai lá 1 x 0.10 và 1 x 0.20 -> tổng 0.30 (không trượt số thực)", () => {
      const nodes = [
        { id: "P", parent_id: null },
        { id: "L1", parent_id: "P", quantity: "1", unit_price: "0.10" },
        { id: "L2", parent_id: "P", quantity: "1", unit_price: "0.20" },
      ];
      const result = calculateTreeTotals(nodes);
      expect(result.nodeTotals.get("P")).toBe("0.30");
    });

    test("V3: Biên lớn nhất: 3 lá x 99999999999.999 x 99999999999999.99", () => {
      const v3 = fixtures.additionalVectors.V3;
      const leafVal = multiplyAndRoundHalfUp(v3.leaf_quantity, v3.leaf_unit_price);
      expect(leafVal).toBe("9999999999999899000000000.00");

      const nodes = [
        { id: "P", parent_id: null },
        { id: "L1", parent_id: "P", quantity: v3.leaf_quantity, unit_price: v3.leaf_unit_price },
        { id: "L2", parent_id: "P", quantity: v3.leaf_quantity, unit_price: v3.leaf_unit_price },
        { id: "L3", parent_id: "P", quantity: v3.leaf_quantity, unit_price: v3.leaf_unit_price },
      ];
      const result = calculateTreeTotals(nodes);
      expect(result.nodeTotals.get("P")).toBe("29999999999999697000000000.00");
      expect(result.projectTotal).toBe("29999999999999697000000000.00");
    });

    test("V4: Quy mô 2000 lá và 1000 lá", () => {
      // 2000 lá 0.1 x 0.1
      const leaf2000 = multiplyAndRoundHalfUp("0.1", "0.1");
      expect(leaf2000).toBe("0.01");

      const nodes2000 = [{ id: "P", parent_id: null }];
      for (let i = 1; i <= 2000; i++) {
        nodes2000.push({ id: `L${i}`, parent_id: "P", quantity: "0.1", unit_price: "0.1" });
      }
      const res2000 = calculateTreeTotals(nodes2000);
      expect(res2000.nodeTotals.get("P")).toBe("20.00");

      // 1000 lá 0.1 x 0.20
      const nodes1000 = [{ id: "P2", parent_id: null }];
      for (let i = 1; i <= 1000; i++) {
        nodes1000.push({ id: `L${i}`, parent_id: "P2", quantity: "0.1", unit_price: "0.20" });
      }
      const res1000 = calculateTreeTotals(nodes1000);
      expect(res1000.nodeTotals.get("P2")).toBe("20.00");
    });
  });
});
