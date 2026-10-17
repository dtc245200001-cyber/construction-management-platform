"use strict";

// S-50 / T-126 — Unit test hàm định dạng + render PDF của acceptanceDossierService.
// Không chạm DB: kiểm tra helper thuần + khả năng sinh PDF hợp lệ với dữ liệu tối thiểu.

const svc = require("../services/acceptanceDossierService");
const { STATUS_LABELS, METADATA_STATUS_LABELS, fmtQty, buildDossierPdf } = svc._internal;

describe("acceptanceDossierService — nhãn & định dạng", () => {
  it("STATUS_LABELS phủ đủ trạng thái phiếu", () => {
    expect(STATUS_LABELS.draft).toBeDefined();
    expect(STATUS_LABELS.pending_review).toBeDefined();
    expect(STATUS_LABELS.approved).toBeDefined();
    expect(STATUS_LABELS.returned).toBeDefined();
  });

  it("METADATA_STATUS_LABELS phủ đủ trạng thái metadata", () => {
    ["complete", "time_only", "gps_only", "none", "unreadable", "unsupported", "not_processed"].forEach(
      (k) => expect(METADATA_STATUS_LABELS[k]).toBeDefined()
    );
  });

  it("fmtQty hiển thị dấu phẩy VN và không in 'null/undefined'", () => {
    expect(fmtQty("300.000")).toBe("300,000");
    expect(fmtQty(null)).toBe("—");
    expect(fmtQty(undefined)).toBe("—");
    expect(fmtQty("")).toBe("—");
    expect(fmtQty("12.5")).toBe("12,5");
  });
});

describe("acceptanceDossierService — buildDossierPdf", () => {
  const baseData = (over = {}) => ({
    workItem: {
      id: 7,
      code: "HM-07",
      name: "Đổ bê tông sàn tầng 3",
      unit: "m³",
      contract_quantity: "500.000",
      unit_price: "1800000.00",
      contract_value: "900000000.00",
      is_leaf: true,
      project_id: 3,
      project_name: "Dự án KĐT XYZ",
      project_code: "PRJ-03",
    },
    lines: [
      {
        voucher_id: 21,
        batch_name: "Đợt 1",
        status: "approved",
        voucher_created_at: new Date("2025-10-01T08:00:00"),
        reviewed_at: new Date("2025-10-02T09:00:00"),
        review_note: "OK",
        item_id: 1,
        cumulative_quantity: "120.000",
        prev_approved_cumulative: "0.000",
        delta_quantity: "120.000",
        item_unit: "m³",
        created_by_name: "Nguyễn A",
        reviewed_by_name: "Trần B",
      },
    ],
    photos: [],
    ...over,
  });

  it("sinh PDF hợp lệ (header %PDF) với dữ liệu đầy đủ", async () => {
    const buf = await buildDossierPdf(baseData(), { canViewGps: true });
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  });

  it("sinh PDF không lỗi khi không có phiếu nào", async () => {
    const buf = await buildDossierPdf(baseData({ lines: [] }), {});
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("sinh PDF không lỗi khi thiếu trường tuỳ chọn (code, giá, đơn giá null)", async () => {
    const d = baseData();
    d.workItem = { ...d.workItem, code: null, unit_price: null, contract_value: null, contract_quantity: null };
    const buf = await buildDossierPdf(d, {});
    expect(buf.slice(0, 5).toString()).toBe("%PDF-");
  });

  it("không in toạ độ thô khi canViewGps=false", async () => {
    const d = baseData({
      photos: [
        {
          id: 1, voucher_id: 21, file_name: "a.jpg", mime_type: "image/jpeg",
          caption: "A", file_size: 1, captured_at: new Date(),
          gps_latitude: 10.7, gps_longitude: 106.6, gps_accuracy_m: 5,
          gps_source: "exif", metadata_status: "complete",
          geofence_status: "inside", created_at: new Date(),
          batch_name: "Đợt 1", uploaded_by_name: "Ng",
        },
      ],
    });
    // stub db.query trả ảnh lỗi -> fallback không ảnh nhưng vẫn in metadata
    const db = require("../config/db");
    const orig = db.query;
    db.query = async () => ({ rows: [] });
    const buf = await buildDossierPdf(d, { canViewGps: false });
    db.query = orig;
    const text = buf.toString("latin1");
    // Toạ độ thô KHÔNG được xuất hiện dạng số trong nội dung
    expect(text.includes("10.7") && text.includes("106.6")).toBe(false);
  });
});
