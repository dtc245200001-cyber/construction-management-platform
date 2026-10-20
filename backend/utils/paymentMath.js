"use strict";

/**
 * paymentMath.js — Tiện ích tính toán số học tiền tệ và khối lượng chính xác bằng BigInt (S-43).
 * TUYỆT ĐỐI không dùng float/Number/Math.round/parseFloat.
 *
 * Quy tắc:
 *   - Khối lượng (quantity): NUMERIC(14,3)
 *   - Đơn giá (unit_price): NUMERIC(16,2)
 *   - Thành tiền dòng (amount): ROUND(quantity * unit_price, 0) theo half-up (xa số 0)
 *   - Tổng đề nghị: Tổng các amount đã làm tròn
 */

function parseDecimal(str) {
  if (typeof str !== "string" && typeof str !== "number") {
    throw new TypeError("Giá trị đầu vào phải là chuỗi hoặc số");
  }
  const s = String(str).trim();
  if (s === "" || s === "null" || s === "undefined") {
    throw new Error("Giá trị số không được rỗng");
  }

  let isNegative = false;
  let clean = s;
  if (clean.startsWith("-")) {
    isNegative = true;
    clean = clean.slice(1);
  } else if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }

  const parts = clean.split(".");
  if (parts.length > 2) {
    throw new Error(`Định dạng số không hợp lệ: "${str}"`);
  }

  const intPart = parts[0] || "0";
  const fracPart = parts[1] || "";

  if (!/^\d+$/.test(intPart) || (fracPart !== "" && !/^\d+$/.test(fracPart))) {
    throw new Error(`Số chứa ký tự không hợp lệ: "${str}"`);
  }

  const rawDigits = intPart + fracPart;
  let raw = BigInt(rawDigits);
  if (isNegative) {
    raw = -raw;
  }

  return { raw, scale: fracPart.length };
}

/**
 * Nhân khối lượng và đơn giá, làm tròn nửa lên xa 0 (half-up) đến hàng đơn vị (0 chữ số thập phân).
 * Trả về chuỗi dạng "15432088.00" để khớp với cột NUMERIC(18,2) của PostgreSQL.
 */
function multiplyAndRoundHalfUp0(qty, price) {
  const q = parseDecimal(qty);
  const p = parseDecimal(price);

  const rawProduct = q.raw * p.raw;
  const totalScale = q.scale + p.scale;

  let roundedInt;
  if (totalScale === 0) {
    roundedInt = rawProduct;
  } else {
    const factor = 10n ** BigInt(totalScale);
    const half = factor / 2n;

    if (rawProduct >= 0n) {
      roundedInt = (rawProduct + half) / factor;
    } else {
      roundedInt = (rawProduct - half) / factor;
    }
  }

  return `${roundedInt.toString()}.00`;
}

/**
 * Cộng danh sách các chuỗi số tiền (đều có scale 2 hoặc nguyên).
 * Trả về chuỗi dạng "123456.00" hoặc "-123456.00".
 */
function addCurrency(amounts) {
  if (!Array.isArray(amounts) || amounts.length === 0) {
    return "0.00";
  }

  let totalScaled = 0n;
  for (const amt of amounts) {
    const parsed = parseDecimal(amt);
    if (parsed.scale > 2) {
      throw new Error(`Số tiền vượt quá 2 chữ số thập phân: "${amt}"`);
    }
    const factor = 10n ** BigInt(2 - parsed.scale);
    totalScaled += parsed.raw * factor;
  }

  const isNeg = totalScaled < 0n;
  const absVal = isNeg ? -totalScaled : totalScaled;
  const intPart = (absVal / 100n).toString();
  const fracPart = (absVal % 100n).toString().padStart(2, "0");
  const formatted = `${intPart}.${fracPart}`;

  return isNeg ? `-${formatted}` : formatted;
}

/**
 * Chuẩn hóa chuỗi số về dạng 2 chữ số thập phân (e.g. "123" -> "123.00", "123.4" -> "123.40")
 */
function formatTwoDecimals(val) {
  const p = parseDecimal(val);
  const isNeg = p.raw < 0n;
  const absRaw = isNeg ? -p.raw : p.raw;

  if (p.scale === 2) {
    const intPart = (absRaw / 100n).toString();
    const fracPart = (absRaw % 100n).toString().padStart(2, "0");
    const res = `${intPart}.${fracPart}`;
    return isNeg ? `-${res}` : res;
  }

  if (p.scale < 2) {
    const factor = 10n ** BigInt(2 - p.scale);
    const scaled = absRaw * factor;
    const intPart = (scaled / 100n).toString();
    const fracPart = (scaled % 100n).toString().padStart(2, "0");
    const res = `${intPart}.${fracPart}`;
    return isNeg ? `-${res}` : res;
  }

  // scale > 2
  const factor = 10n ** BigInt(p.scale - 2);
  const scaled = absRaw / factor;
  const intPart = (scaled / 100n).toString();
  const fracPart = (scaled % 100n).toString().padStart(2, "0");
  const res = `${intPart}.${fracPart}`;
  return isNeg ? `-${res}` : res;
}


/**
 * Multiply a currency amount by a percentage and round half-up to whole VND.
 * Examples:
 *   1001.00 * 5% = 50.05 -> 50.00
 *   1010.00 * 5% = 50.50 -> 51.00
 */
function multiplyPercentAndRoundHalfUp0(amount, percent) {
  const a = parseDecimal(amount);
  const p = parseDecimal(percent);

  if (a.raw < 0n || p.raw < 0n) {
    throw new Error("Số tiền và tỷ lệ tạm giữ không được âm");
  }

  // amount * percent / 100.
  const numerator = a.raw * p.raw;
  const denominator =
    100n * (10n ** BigInt(a.scale + p.scale));

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * 2n >= denominator
    ? quotient + 1n
    : quotient;

  return `${rounded.toString()}.00`;
}

function toCurrencyCents(value) {
  const parsed = parseDecimal(value);
  if (parsed.scale > 2) {
    throw new Error(`Số tiền vượt quá 2 chữ số thập phân: "${value}"`);
  }
  return parsed.raw * (10n ** BigInt(2 - parsed.scale));
}

function fromCurrencyCents(value) {
  const isNegative = value < 0n;
  const abs = isNegative ? -value : value;
  const result = `${(abs / 100n).toString()}.${(abs % 100n)
    .toString()
    .padStart(2, "0")}`;
  return isNegative ? `-${result}` : result;
}

function subtractCurrency(left, right) {
  return fromCurrencyCents(toCurrencyCents(left) - toCurrencyCents(right));
}

function compareCurrency(left, right) {
  const a = toCurrencyCents(left);
  const b = toCurrencyCents(right);
  return a === b ? 0 : a > b ? 1 : -1;
}

function minCurrency(left, right) {
  return compareCurrency(left, right) <= 0
    ? formatTwoDecimals(left)
    : formatTwoDecimals(right);
}

module.exports = {
  parseDecimal,
  multiplyAndRoundHalfUp0,
  multiplyPercentAndRoundHalfUp0,
  addCurrency,
  subtractCurrency,
  compareCurrency,
  minCurrency,
  formatTwoDecimals,
};
