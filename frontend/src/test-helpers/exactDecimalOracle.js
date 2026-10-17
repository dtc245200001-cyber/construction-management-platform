/**
 * exactDecimalOracle.js
 * Máy đối chứng độc lập phía FRONTEND sử dụng BigInt cho tiền và khối lượng (S-35 / T-88 / vitest).
 * TUYỆT ĐỐI KHÔNG import từ utils/decimal.js, không dùng Number, parseFloat, toFixed, Math.round.
 */

const ZERO_BIGINT = 0n;
const TEN_BIGINT = 10n;

/**
 * Phân tích chuỗi số thập phân thành BigInt
 */
export function parseDecimalToBigInt(str) {
  if (typeof str !== "string") {
    return null;
  }
  const trimmed = str.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "undefined") {
    return null;
  }

  let isNegative = false;
  let clean = trimmed;
  if (clean.startsWith("-")) {
    isNegative = true;
    clean = clean.slice(1);
  } else if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }

  const parts = clean.split(".");
  if (parts.length > 2) return null;

  const intPart = parts[0] || "0";
  const fracPart = parts[1] || "";

  if (!/^\d+$/.test(intPart) || (fracPart !== "" && !/^\d+$/.test(fracPart))) {
    return null;
  }

  let raw = BigInt(intPart + fracPart);
  if (isNegative) raw = -raw;

  return { raw, scale: fracPart.length };
}

/**
 * Nhân khối lượng và đơn giá, làm tròn nửa lên (half-up) về 2 chữ số thập phân
 */
export function multiplyAndRoundHalfUp(qtyStr, priceStr) {
  const qtyParsed = parseDecimalToBigInt(qtyStr);
  const priceParsed = parseDecimalToBigInt(priceStr);

  if (!qtyParsed || !priceParsed) return null;

  const rawProduct = qtyParsed.raw * priceParsed.raw;
  const totalScale = qtyParsed.scale + priceParsed.scale;

  const targetScale = 2;
  if (totalScale === targetScale) {
    return formatBigIntCurrency(rawProduct);
  }

  if (totalScale < targetScale) {
    const diff = targetScale - totalScale;
    return formatBigIntCurrency(rawProduct * (TEN_BIGINT ** BigInt(diff)));
  }

  const diff = totalScale - targetScale;
  const factor = TEN_BIGINT ** BigInt(diff);
  const half = factor / 2n;

  const rounded = rawProduct >= ZERO_BIGINT
    ? (rawProduct + half) / factor
    : (rawProduct - half) / factor;

  return formatBigIntCurrency(rounded);
}

/**
 * Cộng 2 chuỗi tiền tệ
 */
export function addCurrency(aStr, bStr) {
  const aParsed = parseDecimalToBigInt(aStr || "0.00");
  const bParsed = parseDecimalToBigInt(bStr || "0.00");

  const aRaw = aParsed ? scaleToFixed2(aParsed) : ZERO_BIGINT;
  const bRaw = bParsed ? scaleToFixed2(bParsed) : ZERO_BIGINT;

  return formatBigIntCurrency(aRaw + bRaw);
}

function scaleToFixed2(parsed) {
  if (parsed.scale === 2) return parsed.raw;
  if (parsed.scale < 2) {
    return parsed.raw * (TEN_BIGINT ** BigInt(2 - parsed.scale));
  }
  const factor = TEN_BIGINT ** BigInt(parsed.scale - 2);
  const half = factor / 2n;
  return parsed.raw >= ZERO_BIGINT
    ? (parsed.raw + half) / factor
    : (parsed.raw - half) / factor;
}

export function formatBigIntCurrency(cents) {
  const isNeg = cents < ZERO_BIGINT;
  const absVal = isNeg ? -cents : cents;

  const intPart = absVal / 100n;
  const fracPart = absVal % 100n;

  const fracStr = fracPart.toString().padStart(2, "0");
  const result = `${intPart.toString()}.${fracStr}`;
  return isNeg ? `-${result}` : result;
}

/**
 * Định dạng chuỗi tiền tệ thành chuỗi hiển thị VN: "109.878.083,99 ₫"
 * (Dùng thuật toán chuỗi và BigInt, KHÔNG dùng Intl / toLocaleString)
 */
export function formatCurrencyVNDisplay(valStr) {
  if (!valStr || valStr === "null") return "—";
  const parts = valStr.split(".");
  const intPart = parts[0];
  const fracPart = parts[1] || "00";

  // Thêm dấu chấm hàng nghìn
  const isNeg = intPart.startsWith("-");
  const digits = isNeg ? intPart.slice(1) : intPart;

  let formattedInt = "";
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    formattedInt = digits[i] + formattedInt;
    count++;
    if (count % 3 === 0 && i > 0) {
      formattedInt = "." + formattedInt;
    }
  }

  const sign = isNeg ? "-" : "";
  return `${sign}${formattedInt},${fracPart} ₫`;
}

/**
 * Đọc ngược chuỗi hiển thị VN ("109.878.083,99 ₫") về chuỗi số nguyên bản ("109877080.28")
 */
export function parseVNDisplayToStandard(displayStr) {
  if (!displayStr || displayStr === "—" || displayStr === "Chưa khai") return null;
  // Bỏ " ₫", bỏ dấu chấm hàng nghìn, đổi dấu phẩy thành dấu chấm
  const clean = displayStr.replace(/\s*₫/, "").replace(/\./g, "").replace(",", ".");
  return clean.trim();
}

/**
 * Tính toán cây đối chứng phía Frontend
 */
export function calculateFrontendTreeTotals(flatNodes) {
  const childrenMap = new Map();
  const rootIds = [];

  for (const node of flatNodes) {
    const id = node.id;
    if (!childrenMap.has(id)) childrenMap.set(id, []);
    if (node.parent_id == null) {
      rootIds.push(id);
    } else {
      if (!childrenMap.has(node.parent_id)) childrenMap.set(node.parent_id, []);
      childrenMap.get(node.parent_id).push(id);
    }
  }

  const nodeValues = new Map();
  for (const node of flatNodes) {
    const children = childrenMap.get(node.id) || [];
    if (children.length === 0) {
      if (node.quantity != null && node.unit_price != null) {
        nodeValues.set(node.id, multiplyAndRoundHalfUp(node.quantity, node.unit_price));
      } else {
        nodeValues.set(node.id, null);
      }
    } else {
      nodeValues.set(node.id, null);
    }
  }

  const nodeTotals = new Map();
  function computeTotal(nodeId) {
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      const leafVal = nodeValues.get(nodeId);
      const tot = leafVal != null ? leafVal : "0.00";
      nodeTotals.set(nodeId, tot);
      return tot;
    }
    let sum = "0.00";
    for (const c of children) {
      sum = addCurrency(sum, computeTotal(c));
    }
    nodeTotals.set(nodeId, sum);
    return sum;
  }

  let projectTotal = "0.00";
  for (const r of rootIds) {
    projectTotal = addCurrency(projectTotal, computeTotal(r));
  }

  return { nodeValues, nodeTotals, projectTotal };
}
