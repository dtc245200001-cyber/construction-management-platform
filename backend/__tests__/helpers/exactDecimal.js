"use strict";

/**
 * exactDecimal.js
 * Máy tính đối chứng độc lập sử dụng BigInt cho tiền và khối lượng (S-35 / T-88).
 * TUYỆT ĐỐI không sử dụng Number, parseFloat, toFixed, Math.round.
 * Quy ước tiền tệ: 2 chữ số thập phân, làm tròn nửa lên xa số 0 (half-up).
 */

const ZERO_BIGINT = 0n;
const TEN_BIGINT = 10n;

/**
 * Phân tích chuỗi số thập phân thành BigInt phần nguyên và số chữ số thập phân.
 * Ví dụ "123.456" -> { raw: 123456n, scale: 3 }
 */
function parseDecimalToBigInt(str) {
  if (typeof str !== "string") {
    throw new TypeError("exactDecimal: giá trị đầu vào phải là chuỗi");
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
  if (parts.length > 2) {
    throw new Error(`exactDecimal: định dạng số không hợp lệ "${str}"`);
  }

  const intPart = parts[0] || "0";
  const fracPart = parts[1] || "";

  if (!/^\d+$/.test(intPart) || (fracPart !== "" && !/^\d+$/.test(fracPart))) {
    throw new Error(`exactDecimal: chuỗi chứa ký tự không phải số "${str}"`);
  }

  const rawDigits = intPart + fracPart;
  let raw = BigInt(rawDigits);
  if (isNegative) {
    raw = -raw;
  }

  return {
    raw,
    scale: fracPart.length,
  };
}

/**
 * Chuyển đổi số BigInt tại scale cố định sang chuỗi định dạng đúng 2 chữ số thập phân (tiền tệ).
 * Làm tròn nửa lên (half-up): nếu chữ số tiếp theo >= 5 thì tăng giá trị tuyệt đối.
 */
function roundToTwoDecimals(raw, scale) {
  const targetScale = 2;
  if (scale === targetScale) {
    return formatBigIntCurrency(raw);
  }

  if (scale < targetScale) {
    const diff = targetScale - scale;
    const factor = TEN_BIGINT ** BigInt(diff);
    return formatBigIntCurrency(raw * factor);
  }

  // scale > targetScale: cần làm tròn
  const diff = scale - targetScale;
  const factor = TEN_BIGINT ** BigInt(diff);
  const half = factor / 2n; // ví dụ diff=1 (scale=3) -> factor=10, half=5

  let rounded;
  if (raw >= ZERO_BIGINT) {
    rounded = (raw + half) / factor;
  } else {
    rounded = (raw - half) / factor;
  }

  return formatBigIntCurrency(rounded);
}

/**
 * Nhân khối lượng (quantity) và đơn giá (unit_price), làm tròn nửa lên về 2 chữ số thập phân.
 * contract_value = ROUND(quantity * unit_price, 2)
 */
function multiplyAndRoundHalfUp(qtyStr, priceStr) {
  const qtyParsed = parseDecimalToBigInt(qtyStr);
  const priceParsed = parseDecimalToBigInt(priceStr);

  if (!qtyParsed || !priceParsed) {
    return null;
  }

  // Tích của hai số: scale_total = qty.scale + price.scale
  const rawProduct = qtyParsed.raw * priceParsed.raw;
  const totalScale = qtyParsed.scale + priceParsed.scale;

  return roundToTwoDecimals(rawProduct, totalScale);
}

/**
 * Cộng 2 chuỗi tiền (đều có 2 chữ số thập phân)
 */
function addCurrency(valAStr, valBStr) {
  const aParsed = parseDecimalToBigInt(valAStr || "0.00");
  const bParsed = parseDecimalToBigInt(valBStr || "0.00");

  const aRaw = aParsed ? scaleToFixed2(aParsed) : ZERO_BIGINT;
  const bRaw = bParsed ? scaleToFixed2(bParsed) : ZERO_BIGINT;

  return formatBigIntCurrency(aRaw + bRaw);
}

/**
 * Đưa BigInt về đúng chuẩn scale = 2
 */
function scaleToFixed2(parsed) {
  if (parsed.scale === 2) return parsed.raw;
  if (parsed.scale < 2) {
    return parsed.raw * (TEN_BIGINT ** BigInt(2 - parsed.scale));
  }
  // scale > 2
  const factor = TEN_BIGINT ** BigInt(parsed.scale - 2);
  const half = factor / 2n;
  return parsed.raw >= ZERO_BIGINT
    ? (parsed.raw + half) / factor
    : (parsed.raw - half) / factor;
}

/**
 * Định dạng BigInt (đã ở scale 2) thành chuỗi "XXXX.XX"
 */
function formatBigIntCurrency(cents) {
  const isNeg = cents < ZERO_BIGINT;
  let absVal = isNeg ? -cents : cents;

  const intPart = absVal / 100n;
  const fracPart = absVal % 100n;

  const fracStr = fracPart.toString().padStart(2, "0");
  const result = `${intPart.toString()}.${fracStr}`;
  return isNeg ? `-${result}` : result;
}

/**
 * So sánh 2 chuỗi tiền tệ (trả về -1, 0, 1)
 */
function compareCurrency(strA, strB) {
  const a = scaleToFixed2(parseDecimalToBigInt(strA || "0.00"));
  const b = scaleToFixed2(parseDecimalToBigInt(strB || "0.00"));
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

module.exports = {
  parseDecimalToBigInt,
  multiplyAndRoundHalfUp,
  addCurrency,
  formatBigIntCurrency,
  compareCurrency,
};
