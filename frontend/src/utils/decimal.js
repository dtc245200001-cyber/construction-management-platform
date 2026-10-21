/**
 * decimal.js — Các hàm tiện ích thuần xử lý chuỗi số thập phân chính xác không dùng float.
 * Không dùng các phép toán số thực dấu phẩy động cho số tiền / khối lượng.
 */

/**
 * Chuẩn hoá và kiểm tra đầu vào số thập phân từ form.
 * Cho phép dấu phẩy (,) hoặc dấu chấm (.) làm dấu thập phân nhưng chỉ được xuất hiện một lần.
 * Từ chối khoảng trắng, dấu phân cách hàng nghìn, số âm, ký hiệu khoa học.
 *
 * @param {string} text - Chuỗi nhập từ người dùng
 * @param {Object} options
 * @param {number} options.maxIntDigits - Số chữ số nguyên tối đa
 * @param {number} options.maxScale - Số chữ số thập phân tối đa
 * @param {string} [options.fieldName="Giá trị"] - Tên trường cho thông báo lỗi
 * @returns {{ ok: boolean, value?: string, error?: string }}
 */
export function normalizeDecimalInput(text, { maxIntDigits, maxScale, fieldName = "Giá trị" }) {
  if (text === undefined || text === null || typeof text !== "string") {
    return { ok: false, error: `${fieldName} không hợp lệ` };
  }

  // Từ chối khoảng trắng ở bất kỳ vị trí nào (kể cả đầu/cuối)
  if (/\s/.test(text)) {
    return { ok: false, error: `${fieldName} không được chứa khoảng trắng` };
  }

  const raw = text.trim();
  if (raw === "") {
    return { ok: false, error: `${fieldName} không được để trống` };
  }

  // Từ chối số âm
  if (raw.startsWith("-")) {
    return { ok: false, error: `${fieldName} không được âm` };
  }

  // Từ chối ký hiệu khoa học
  if (/[eE]/.test(raw)) {
    return { ok: false, error: `${fieldName} không được dùng ký hiệu khoa học` };
  }

  // Kiểm tra dấu phân cách hàng nghìn hoặc nhiều dấu phân tách
  // Nếu có cả dấu chấm và dấu phẩy, hoặc nhiều hơn 1 dấu
  const dots = (raw.match(/\./g) || []).length;
  const commas = (raw.match(/,/g) || []).length;

  if (dots + commas > 1 || (dots > 0 && commas > 0)) {
    return {
      ok: false,
      error: "Không nhập dấu phân cách hàng nghìn; chỉ dùng dấu phẩy hoặc dấu chấm cho phần thập phân",
    };
  }

  // Đổi dấu phẩy sang dấu chấm để kiểm tra thống nhất
  const normalizedChar = raw.replace(",", ".");

  // Chỉ cho phép định dạng số thập phân chuẩn: ^\d+(\.\d+)?$
  // Từ chối trường hợp ".5", "5.", "+5", hay chứa chữ cái
  if (!/^\d+(\.\d+)?$/.test(normalizedChar)) {
    return { ok: false, error: `${fieldName} không hợp lệ` };
  }

  const parts = normalizedChar.split(".");
  let intPart = parts[0].replace(/^0+/, "");
  if (intPart === "") intPart = "0";

  let fracPart = parts.length > 1 ? parts[1] : "";

  // Kiểm tra phần thập phân
  if (fracPart.length > maxScale) {
    // Nếu phần dư vượt quá maxScale có chứa chữ số khác 0 -> từ chối
    const excess = fracPart.slice(maxScale);
    if (/[1-9]/.test(excess)) {
      return {
        ok: false,
        error: `${fieldName} không được có quá ${maxScale} chữ số thập phân`,
      };
    }
    // Nếu phần dư chỉ toàn 0 -> cắt bỏ phần 0 thừa
    fracPart = fracPart.slice(0, maxScale);
  }

  // Cắt bớt các số 0 thừa ở cuối phần thập phân
  while (fracPart.length > 0 && fracPart.endsWith("0")) {
    fracPart = fracPart.slice(0, -1);
  }

  // Kiểm tra số chữ số phần nguyên
  if (intPart.length > maxIntDigits) {
    return {
      ok: false,
      error: `${fieldName} vượt quá giới hạn cho phép (tối đa ${maxIntDigits} chữ số nguyên)`,
    };
  }

  const resultValue = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;

  return {
    ok: true,
    value: resultValue,
  };
}

/**
 * Nhân hai chuỗi số thập phân không âm và làm tròn nửa lên (Round Half Away from Zero / Half Up) về 2 chữ số thập phân.
 * Thực hiện 100% bằng BigInt.
 *
 * @param {string} aStr - Khối lượng dạng chuỗi
 * @param {string} bStr - Đơn giá dạng chuỗi
 * @returns {string} - Giá trị kết quả với đúng 2 chữ số thập phân (e.g. "109877080.28")
 */
export function multiplyAndRoundVND(aStr, bStr) {
  if (!aStr || !bStr) return "0.00";

  // Tách phần nguyên và phần thập phân cho a
  const [aIntRaw, aFracRaw = ""] = aStr.split(".");
  const aScale = aFracRaw.length;
  const aBig = BigInt(aIntRaw + aFracRaw);

  // Tách phần nguyên và phần thập phân cho b
  const [bIntRaw, bFracRaw = ""] = bStr.split(".");
  const bScale = bFracRaw.length;
  const bBig = BigInt(bIntRaw + bFracRaw);

  // Tích nguyên: aBig * bBig có quy mô scale = aScale + bScale
  const prod = aBig * bBig;
  const totalScale = aScale + bScale;
  const targetScale = 2;

  let resultScaled;

  if (totalScale >= targetScale) {
    const diff = totalScale - targetScale;
    let factor = 1n;
    for (let i = 0; i < diff; i++) {
      factor *= 10n;
    }

    const quotient = prod / factor;
    const remainder = prod % factor;

    // Quy tắc làm tròn nửa lên: nếu remainder >= factor / 2 thì +1n
    const half = factor / 2n;
    if (remainder >= half) {
      resultScaled = quotient + 1n;
    } else {
      resultScaled = quotient;
    }
  } else {
    // Nếu tổng scale < 2 (ví dụ a=2, b=3 -> totalScale=0)
    const diff = targetScale - totalScale;
    let factor = 1n;
    for (let i = 0; i < diff; i++) {
      factor *= 10n;
    }
    resultScaled = prod * factor;
  }

  // Chuyển resultScaled (đang có scale 2) thành chuỗi dạng X.YY
  let resStr = resultScaled.toString();
  if (resStr.length <= 2) {
    resStr = resStr.padStart(3, "0");
  }

  const intPart = resStr.slice(0, resStr.length - 2);
  const fracPart = resStr.slice(resStr.length - 2);

  return `${intPart}.${fracPart}`;
}

/**
 * Định dạng chuỗi số tiền sang định dạng tiền Việt Nam (VND).
 * - Dùng dấu chấm (.) phân cách hàng nghìn.
 * - Dùng dấu phẩy (,) phân cách phần thập phân (LUÔN 2 chữ số thập phân).
 * - Kèm ký hiệu " ₫" ở cuối.
 * Ví dụ: "1234567.89" -> "1.234.567,89 ₫"
 *
 * @param {string|null} str
 * @returns {string}
 */
export function formatMoneyVND(str, { noDecimals = false } = {}) {
  if (str === null || str === undefined || str === "") {
    return "—";
  }

  if (noDecimals) {
    return formatVND(str);
  }

  const s = String(str);
  const [intPartRaw, fracPartRaw = ""] = s.split(".");
  const intPart = intPartRaw === "" ? "0" : intPartRaw;
  const fracPart = (fracPartRaw + "00").slice(0, 2);

  // Thêm dấu chấm phân cách hàng nghìn
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${formattedInt},${fracPart} ₫`;
}

/**
 * Định dạng tiền Việt Nam không lẻ thập phân (chuẩn VND cho đề nghị thanh toán).
 * Dấu chấm ngăn cách hàng nghìn, không lẻ thập phân, kèm ký hiệu ₫.
 * Xử lý thuần chuỗi ký tự, không dùng phép toán số thực.
 * Ví dụ: "15432088" -> "15.432.088 ₫"
 *
 * @param {string|number|null} str
 * @returns {string}
 */
export function formatVND(str) {
  if (str === null || str === undefined || str === "") {
    return "—";
  }

  const s = String(str).trim();
  if (s === "") return "—";

  const isNegative = s.startsWith("-");
  const abs = isNegative ? s.slice(1) : s;

  const [intPartRaw = "0"] = abs.split(/[.,]/);
  let intPart = intPartRaw.replace(/^0+/, "");
  if (intPart === "") intPart = "0";

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${isNegative ? "-" : ""}${formattedInt} ₫`;
}

/**
 * Định dạng khối lượng kiểu Việt Nam:
 * - Dấu chấm (.) phân cách hàng nghìn.
 * - Dấu phẩy (,) phân cách phần thập phân và bỏ các số 0 thừa.
 * Ví dụ: "1234.567" -> "1.234,567", "2.000" -> "2", "0.100" -> "0,1"
 *
 * @param {string|null} str
 * @returns {string}
 */
export function formatQuantityVN(str) {
  if (str === null || str === undefined || str === "") {
    return "—";
  }

  const parts = str.split(".");
  const intPart = parts[0] === "" ? "0" : parts[0];
  let fracPart = parts.length > 1 ? parts[1] : "";

  // Bỏ số 0 thừa ở cuối phần thập phân
  while (fracPart.length > 0 && fracPart.endsWith("0")) {
    fracPart = fracPart.slice(0, -1);
  }

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (fracPart.length > 0) {
    return `${formattedInt},${fracPart}`;
  }
  return formattedInt;
}

/**
 * Hiển thị số khi chỉnh sửa trong input form:
 * Đổi dấu chấm (.) thành dấu phẩy (,).
 *
 * @param {string|null} str
 * @returns {string}
 */
export function formatInputDisplayVN(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(".", ",");
}

/**
 * Chuẩn hoá chuỗi số định dạng Việt Nam (có dấu chấm phân cách hàng nghìn, ví dụ "150.000.000" hoặc "150.000,50")
 * về chuỗi số thuần để truyền vào normalizeDecimalInput.
 *
 * @param {string|number|null} input
 * @returns {string}
 */
export function parseVietnameseNumber(input) {
  if (input === null || input === undefined) return "";
  const raw = String(input).trim();
  if (raw === "") return "";

  // Nếu có dấu phẩy thập phân (ví dụ "150.000.000,50") -> bỏ toàn bộ dấu chấm hàng nghìn, giữ dấu phẩy
  if (raw.includes(",")) {
    return raw.replace(/\./g, "");
  }

  // Nếu có nhiều dấu chấm hoặc dấu chấm theo cụm 3 chữ số hàng nghìn (ví dụ "150.000.000" hoặc "50.000")
  const dotParts = raw.split(".");
  if (
    dotParts.length > 2 ||
    (dotParts.length === 2 && dotParts[1].length === 3)
  ) {
    return raw.replace(/\./g, "");
  }

  return raw;
}

/**
 * Tính hiệu giữa hai số lượng thập phân (a - b) với độ chính xác tuyệt đối bằng BigInt.
 * Phục vụ tính khối lượng phát sinh đợt: luỹ kế mới - luỹ kế đã duyệt trước.
 *
 * @param {string|number} aStr - Luỹ kế mới
 * @param {string|number} bStr - Luỹ kế đã duyệt trước
 * @returns {{ delta: string, isNegative: boolean, formatted: string }}
 */
export function subtractQuantities(aStr, bStr) {
  if (aStr === undefined || aStr === null || String(aStr).trim() === "") {
    return { delta: "0.000", isNegative: false, formatted: "0" };
  }
  const toMillis = (val) => {
    const s = String(val ?? "0").trim();
    if (!s) return 0n;
    const isNeg = s.startsWith("-");
    const abs = isNeg ? s.slice(1) : s;
    const [intP = "0", fracP = ""] = abs.split(/[.,]/);
    const frac3 = (fracP + "000").slice(0, 3);
    const m = BigInt(intP || "0") * 1000n + BigInt(frac3);
    return isNeg ? -m : m;
  };

  const diffMillis = toMillis(aStr) - toMillis(bStr);
  const isNegative = diffMillis < 0n;
  const absMillis = isNegative ? -diffMillis : diffMillis;
  const intPart = absMillis / 1000n;
  const fracPart = absMillis % 1000n;
  const rawDelta = `${intPart}.${String(fracPart).padStart(3, "0")}`;
  const delta = isNegative ? `-${rawDelta}` : rawDelta;
  const formatted = (isNegative ? "-" : "") + formatQuantityVN(rawDelta);

  return { delta, isNegative, formatted };
}

