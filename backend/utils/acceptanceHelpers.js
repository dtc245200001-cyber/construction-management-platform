"use strict";

// S-36 / T-91
// Hàm thuần tính khối lượng phát sinh đợt và phát hiện MIME thật từ magic bytes.
//
// computeVoucherItems:
//   - Lấy luỹ kế đã duyệt gần nhất từ phiếu APPROVED (không lấy draft/pending_review).
//   - delta = cumulative_quantity - prev_approved_cumulative (dùng BigInt tránh float).
//   - Đúng khi có nhiều đợt liên tiếp (lấy phiếu approved GẦN NHẤT theo created_at).
//   - Đợt âm: trả ra giá trị âm + đánh dấu is_negative = true (quyết định A).
//     TODO (quy tắc điều chỉnh đợt âm): khi có quyết định chính thức, cập nhật hàm này
//     và logic upstream trong acceptanceRoutes.js để xử lý theo quy tắc mới.
//     KHÔNG tự bịa quy tắc điều chỉnh.
//
// detectMimeFromBuffer:
//   - Kiểm tra magic bytes thật của file (không tin đuôi file hay Content-Type).
//   - Hỗ trợ: JPEG, PNG, WebP, HEIC/HEIF.

// Không dùng thư viện ngoài để tránh thêm dependency.
// Dùng BigInt (chuỗi NUMERIC(14,3) = integer x 1000) để tính chính xác tuyệt đối.

/**
 * Chuyển chuỗi số thập phân (ví dụ '12.500') thành BigInt x 1000.
 * Hỗ trợ số âm.
 * @param {string} str
 * @returns {bigint}
 */
function strToMillis(str) {
  const s = String(str).trim();
  const negative = s.startsWith('-');
  const abs = negative ? s.slice(1) : s;
  const [intPart, fracPart = ''] = abs.split('.');
  // Chuẩn hoá về đúng 3 chữ số thập phân
  const frac3 = (fracPart + '000').slice(0, 3);
  const millis = BigInt(intPart) * 1000n + BigInt(frac3);
  return negative ? -millis : millis;
}

/**
 * Chuyển BigInt millis thành chuỗi NUMERIC(14,3).
 * @param {bigint} millis
 * @returns {string}
 */
function millisToStr(millis) {
  const negative = millis < 0n;
  const abs = negative ? -millis : millis;
  const intPart = abs / 1000n;
  const fracPart = abs % 1000n;
  const result = `${intPart}.${String(fracPart).padStart(3, '0')}`;
  return negative ? `-${result}` : result;
}

/**
 * Tính khối lượng phát sinh đợt cho từng hạng mục.
 *
 * @param {import('pg').PoolClient} client - DB client đang trong transaction
 * @param {Array<{work_item_id: number, cumulative_quantity: string, unit: string|null}>} items
 * @returns {Promise<Array<{
 *   work_item_id: number,
 *   cumulative_quantity: string,
 *   prev_approved_cumulative: string,
 *   delta_quantity: string,
 *   unit: string|null,
 *   is_negative: boolean,
 * }>>}
 */
async function computeVoucherItems(client, items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const workItemIds = items.map((i) => i.work_item_id);

  // Truy vấn luỹ kế đã duyệt gần nhất theo từng hạng mục.
  // Chỉ lấy từ phiếu có status = 'approved' (không lấy draft/pending_review).
  // Dùng DISTINCT ON (work_item_id) sắp xếp theo av.created_at DESC để lấy gần nhất.
  const prevApprovedRes = await client.query(
    `SELECT DISTINCT ON (avi.work_item_id)
       avi.work_item_id,
       avi.cumulative_quantity::text AS prev_approved_cumulative
     FROM acceptance_voucher_items avi
     JOIN acceptance_vouchers av ON av.id = avi.voucher_id
     WHERE avi.work_item_id = ANY($1::int[])
       AND av.status = 'approved'
     ORDER BY avi.work_item_id, av.created_at DESC`,
    [workItemIds]
  );

  // Map: work_item_id => luỹ kế đã duyệt gần nhất (hoặc '0' nếu chưa có)
  const prevMap = new Map(
    prevApprovedRes.rows.map((r) => [r.work_item_id, r.prev_approved_cumulative])
  );

  return items.map((item) => {
    const prevStr = prevMap.get(item.work_item_id) || "0";

    // Dùng BigInt millis (x1000) để tính chính xác tuyệt đối — không có sai số float
    const cumulativeMillis = strToMillis(item.cumulative_quantity);
    const prevMillis = strToMillis(prevStr);
    const deltaMillis = cumulativeMillis - prevMillis;

    return {
      work_item_id: item.work_item_id,
      cumulative_quantity: millisToStr(cumulativeMillis),
      prev_approved_cumulative: millisToStr(prevMillis),
      delta_quantity: millisToStr(deltaMillis),
      unit: item.unit || null,
      // Cờ tiện lợi để upstream xác định phiếu có dòng âm
      is_negative: deltaMillis < 0n,
    };
  });
}

/**
 * Phát hiện MIME type thật từ magic bytes của buffer.
 * Hỗ trợ: JPEG, PNG, WebP, HEIC/HEIF.
 *
 * @param {Buffer} buffer
 * @returns {string|null} mime type hoặc null nếu không nhận dạng được
 */
function detectMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: RIFF????WEBP
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50   // P
  ) {
    return "image/webp";
  }

  // HEIC/HEIF: ftyp box ở offset 4
  // Signatures: ftyp heic, ftyp heix, ftyp hevc, ftyp mif1, ftyp msf1
  if (buffer.length >= 12) {
    const ftyp = buffer.slice(4, 8).toString("ascii");
    if (ftyp === "ftyp") {
      const brand = buffer.slice(8, 12).toString("ascii");
      const heicBrands = ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "MiHE", "MiPr"];
      if (heicBrands.some((b) => brand.startsWith(b.slice(0, 4)))) {
        return "image/heic";
      }
    }
  }

  return null;
}

module.exports = {
  computeVoucherItems,
  detectMimeFromBuffer,
};
