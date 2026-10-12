"use strict";

// S-36 / T-91
// Unit test cho hàm tính khối lượng đợt (computeVoucherItems) và
// phát hiện MIME thật từ magic bytes (detectMimeFromBuffer).
//
// SỐ KỲ VỌNG TÍNH TAY (không sinh từ chính hàm đang kiểm):
//   Ví dụ: cumulative=100.000, prev=60.000  => delta=40.000 (tính tay: 100.000-60.000)
//   Ví dụ: cumulative=60.000, prev=60.000   => delta=0.000  (đợt bằng 0)
//   Ví dụ: cumulative=50.000, prev=60.000   => delta=-10.000 (đợt âm)
//
// Tất cả số test là số cứng tính tay, không dùng hàm đang test để sinh kỳ vọng.

const { computeVoucherItems, detectMimeFromBuffer } = require("../utils/acceptanceHelpers");

// ─── Mock DB client ────────────────────────────────────────────────────────────
// computeVoucherItems nhận client để query prev_approved.
// Ở unit test, ta mock client để trả dữ liệu kiểm soát được.

function makeMockClient(prevRows) {
  return {
    query: jest.fn().mockResolvedValue({ rows: prevRows }),
  };
}

describe("acceptanceHelpers.computeVoucherItems", () => {
  // ── TC-1: Chưa có phiếu approved nào → prev = 0, delta = cumulative ────────
  test("TC-1: không có phiếu approved trước → delta bằng luỹ kế mới", async () => {
    const client = makeMockClient([]); // prevRows rỗng
    const items = [
      { work_item_id: 1, cumulative_quantity: "100.000", unit: "m3" },
      { work_item_id: 2, cumulative_quantity: "50.500", unit: "m2" },
    ];

    const result = await computeVoucherItems(client, items);

    expect(result).toHaveLength(2);

    // Hạng mục 1: 100.000 - 0 = 100.000 (tính tay)
    expect(result[0].work_item_id).toBe(1);
    expect(result[0].cumulative_quantity).toBe("100.000");
    expect(result[0].prev_approved_cumulative).toBe("0.000");
    expect(result[0].delta_quantity).toBe("100.000");
    expect(result[0].is_negative).toBe(false);

    // Hạng mục 2: 50.500 - 0 = 50.500 (tính tay)
    expect(result[1].work_item_id).toBe(2);
    expect(result[1].delta_quantity).toBe("50.500");
    expect(result[1].is_negative).toBe(false);
  });

  // ── TC-2: Có 1 phiếu approved trước → delta = cumulative - prev ───────────
  test("TC-2: có 1 phiếu approved → tính đúng delta đợt", async () => {
    const client = makeMockClient([
      { work_item_id: 1, prev_approved_cumulative: "60.000" },
    ]);
    const items = [{ work_item_id: 1, cumulative_quantity: "100.000", unit: "m3" }];

    const result = await computeVoucherItems(client, items);

    // 100.000 - 60.000 = 40.000 (tính tay)
    expect(result[0].delta_quantity).toBe("40.000");
    expect(result[0].prev_approved_cumulative).toBe("60.000");
    expect(result[0].is_negative).toBe(false);
  });

  // ── TC-3: Nhiều đợt liên tiếp (mock prev đã là luỹ kế gần nhất) ──────────
  test("TC-3: nhiều đợt → delta đúng cho từng đợt", async () => {
    // Đợt 2: prev = luỹ kế đợt 1 đã approved = 60.000
    const client = makeMockClient([
      { work_item_id: 5, prev_approved_cumulative: "60.000" },
    ]);
    const items = [{ work_item_id: 5, cumulative_quantity: "90.000", unit: "m3" }];

    const result = await computeVoucherItems(client, items);

    // Đợt 2: 90.000 - 60.000 = 30.000 (tính tay)
    expect(result[0].delta_quantity).toBe("30.000");

    // Giả lập đợt 3: prev = 90.000 (đã approved ở đợt 2)
    const client3 = makeMockClient([
      { work_item_id: 5, prev_approved_cumulative: "90.000" },
    ]);
    const items3 = [{ work_item_id: 5, cumulative_quantity: "130.000", unit: "m3" }];
    const result3 = await computeVoucherItems(client3, items3);

    // Đợt 3: 130.000 - 90.000 = 40.000 (tính tay)
    expect(result3[0].delta_quantity).toBe("40.000");
  });

  // ── TC-4: Delta bằng 0 (luỹ kế không đổi so với đã duyệt) ───────────────
  test("TC-4: luỹ kế bằng đợt trước → delta = 0", async () => {
    const client = makeMockClient([
      { work_item_id: 3, prev_approved_cumulative: "75.000" },
    ]);
    const items = [{ work_item_id: 3, cumulative_quantity: "75.000", unit: "m2" }];

    const result = await computeVoucherItems(client, items);

    // 75.000 - 75.000 = 0.000 (tính tay)
    expect(result[0].delta_quantity).toBe("0.000");
    expect(result[0].is_negative).toBe(false);
  });

  // ── TC-5: Đợt âm (quyết định A) ─────────────────────────────────────────
  test("TC-5: luỹ kế mới < luỹ kế đã duyệt → delta âm, is_negative=true", async () => {
    const client = makeMockClient([
      { work_item_id: 4, prev_approved_cumulative: "60.000" },
    ]);
    const items = [{ work_item_id: 4, cumulative_quantity: "50.000", unit: "m3" }];

    const result = await computeVoucherItems(client, items);

    // 50.000 - 60.000 = -10.000 (tính tay)
    expect(result[0].delta_quantity).toBe("-10.000");
    expect(result[0].is_negative).toBe(true);
  });

  // ── TC-6: Nhiều hạng mục cùng phiếu, một hạng mục âm ─────────────────────
  test("TC-6: nhiều hạng mục — hạng mục âm được đánh dấu riêng", async () => {
    const client = makeMockClient([
      { work_item_id: 10, prev_approved_cumulative: "20.000" },
      { work_item_id: 11, prev_approved_cumulative: "30.000" },
    ]);
    const items = [
      { work_item_id: 10, cumulative_quantity: "25.000", unit: "m3" },
      { work_item_id: 11, cumulative_quantity: "28.000", unit: "m3" }, // âm
    ];

    const result = await computeVoucherItems(client, items);

    // HM10: 25.000 - 20.000 = 5.000 (tính tay)
    expect(result[0].delta_quantity).toBe("5.000");
    expect(result[0].is_negative).toBe(false);

    // HM11: 28.000 - 30.000 = -2.000 (tính tay)
    expect(result[1].delta_quantity).toBe("-2.000");
    expect(result[1].is_negative).toBe(true);
  });

  // ── TC-7: Tính thập phân chính xác (không lỗi float) ─────────────────────
  test("TC-7: số thập phân — không có sai số float", async () => {
    const client = makeMockClient([
      { work_item_id: 7, prev_approved_cumulative: "0.100" },
    ]);
    const items = [{ work_item_id: 7, cumulative_quantity: "0.300", unit: "m3" }];

    const result = await computeVoucherItems(client, items);

    // 0.300 - 0.100 = 0.200 chính xác (không bị 0.19999... như float)
    expect(result[0].delta_quantity).toBe("0.200");
  });

  // ── TC-8: items rỗng → trả mảng rỗng ─────────────────────────────────────
  test("TC-8: items rỗng → trả mảng rỗng", async () => {
    const client = makeMockClient([]);
    const result = await computeVoucherItems(client, []);
    expect(result).toEqual([]);
  });
});

// ─── detectMimeFromBuffer ──────────────────────────────────────────────────────
describe("acceptanceHelpers.detectMimeFromBuffer", () => {
  // ── TC-9: JPEG magic bytes ────────────────────────────────────────────────
  test("TC-9: JPEG magic bytes → image/jpeg", () => {
    // JPEG bắt đầu bằng FF D8 FF
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(detectMimeFromBuffer(buf)).toBe("image/jpeg");
  });

  // ── TC-10: PNG magic bytes ────────────────────────────────────────────────
  test("TC-10: PNG magic bytes → image/png", () => {
    // PNG: 89 50 4E 47 0D 0A 1A 0A ...
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(detectMimeFromBuffer(buf)).toBe("image/png");
  });

  // ── TC-11: WebP magic bytes ───────────────────────────────────────────────
  test("TC-11: WebP magic bytes → image/webp", () => {
    // RIFF????WEBP
    const buf = Buffer.alloc(12);
    buf.write("RIFF", 0, "ascii");
    buf.writeUInt32LE(100, 4); // file size (irrelevant)
    buf.write("WEBP", 8, "ascii");
    expect(detectMimeFromBuffer(buf)).toBe("image/webp");
  });

  // ── TC-12: HEIC magic bytes ───────────────────────────────────────────────
  test("TC-12: HEIC ftyp magic bytes → image/heic", () => {
    // ????ftypheic
    const buf = Buffer.alloc(12);
    buf.writeUInt32BE(12, 0); // box size
    buf.write("ftyp", 4, "ascii");
    buf.write("heic", 8, "ascii");
    expect(detectMimeFromBuffer(buf)).toBe("image/heic");
  });

  // ── TC-13: Không nhận dạng được (ví dụ file PDF) → null ────────────────
  test("TC-13: magic bytes lạ → null", () => {
    // PDF: %PDF
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x00, 0x00, 0x00, 0x00]);
    expect(detectMimeFromBuffer(buf)).toBeNull();
  });

  // ── TC-14: Buffer quá ngắn → null ─────────────────────────────────────────
  test("TC-14: buffer quá ngắn → null", () => {
    const buf = Buffer.from([0xff, 0xd8]); // chỉ 2 bytes
    expect(detectMimeFromBuffer(buf)).toBeNull();
  });

  // ── TC-15: Buffer null/undefined → null ──────────────────────────────────
  test("TC-15: null/undefined → null", () => {
    expect(detectMimeFromBuffer(null)).toBeNull();
    expect(detectMimeFromBuffer(undefined)).toBeNull();
  });
});
