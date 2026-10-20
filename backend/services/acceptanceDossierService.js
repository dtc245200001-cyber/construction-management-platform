"use strict";

// S-50 / T-126 + T-127
// Dịch vụ dựng hồ sơ nghiệm thu của MỘT HẠNG MỤC (leaf work item) ra PDF chuẩn in ấn & hoàn công.
//
// Dữ liệu lấy 100% từ backend (không nhận nội dung từ client):
//   - Hạng mục: work_items (phải thuộc project, phải là lá).
//   - Các đợt nghiệm thu: acceptance_voucher_items JOIN acceptance_vouchers,
//     lọc theo work_item_id + project_id, sắp xếp theo thời gian lập phiếu (created_at).
//   - Người lập / người duyệt: users.name qua created_by / reviewed_by.
//   - Ảnh: acceptance_voucher_photos của các phiếu chứa hạng mục này kèm:
//     thời điểm chụp, toạ độ GPS, tình trạng geofence, người lập phiếu và người phê duyệt.
//   - Toạ độ thô chỉ in khi người xuất có quyền photo.view_gps (CĐT / BQL).

const path = require("path");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const db = require("../config/db");
const { extractPhotoMetadata } = require("./photoMetadata");

// Font tiếng Việt nhúng (DejaVu hỗ trợ đầy đủ dấu). Đọc từ package đã cài.
const FONT_DIR = path.join(
  path.dirname(require.resolve("dejavu-fonts-ttf/package.json")),
  "ttf"
);
const FONT_REGULAR = path.join(FONT_DIR, "DejaVuSans.ttf");
const FONT_BOLD = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");
const FONT_ITALIC = path.join(FONT_DIR, "DejaVuSans-Oblique.ttf");
const FONT_BOLDITALIC = path.join(FONT_DIR, "DejaVuSans-BoldOblique.ttf");

const STATUS_LABELS = {
  draft: "Bản nháp",
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  returned: "Bị trả lại",
};

const METADATA_STATUS_LABELS = {
  complete: "Đầy đủ",
  time_only: "Chỉ có thời gian",
  gps_only: "Chỉ có toạ độ",
  none: "Không có siêu dữ liệu",
  unreadable: "Không đọc được",
  unsupported: "Định dạng không hỗ trợ",
  not_processed: "Chưa xử lý",
};

const PAGE = { width: 595.28, height: 841.89, margin: 35 }; // A4, 35pt margin

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtQty(v) {
  if (v === null || v === undefined) return "—";
  const s = String(v);
  if (s === "" || s === "null") return "—";
  return s.replace(".", ",");
}

function fmtMoney(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("vi-VN") + " VNĐ";
}

function fmtDateTime(v) {
  if (!v) return "—";
  try {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return "—";
  }
}

// ── data loading ─────────────────────────────────────────────────────────────

async function loadDossierData(projectId, workItemId) {
  // 1. Hạng mục + dự án (phải thuộc project, phải lá)
  const wiRes = await db.query(
    `
      SELECT wi.id, wi.code, wi.name, wi.unit, wi.quantity::text AS contract_quantity,
             wi.unit_price::text AS unit_price, wi.contract_value::text AS contract_value,
             p.id AS project_id, p.name AS project_name, p.code AS project_code,
             NOT EXISTS (SELECT 1 FROM work_items c WHERE c.parent_id = wi.id) AS is_leaf
      FROM work_items wi
      JOIN projects p ON p.id = wi.project_id
      WHERE wi.id = $1 AND wi.project_id = $2
    `,
    [workItemId, projectId]
  );
  if (wiRes.rows.length === 0) return { notFound: true };
  const wi = wiRes.rows[0];

  // 2. Các dòng nghiệm thu của hạng mục này (mọi phiếu, mọi trạng thái),
  //    kèm thông tin phiếu + người lập/duyệt.
  const itemsRes = await db.query(
    `
      SELECT
        av.id                AS voucher_id,
        av.batch_name,
        av.status,
        av.created_at        AS voucher_created_at,
        av.reviewed_at,
        av.review_note,
        avi.id               AS item_id,
        avi.cumulative_quantity::text      AS cumulative_quantity,
        avi.prev_approved_cumulative::text AS prev_approved_cumulative,
        avi.delta_quantity::text           AS delta_quantity,
        avi.unit             AS item_unit,
        creator.name         AS created_by_name,
        reviewer.name        AS reviewed_by_name
      FROM acceptance_voucher_items avi
      JOIN acceptance_vouchers av ON av.id = avi.voucher_id
      JOIN users creator  ON creator.id  = av.created_by
      LEFT JOIN users reviewer ON reviewer.id = av.reviewed_by
      WHERE avi.work_item_id = $1 AND av.project_id = $2
      ORDER BY av.created_at ASC, av.id ASC
    `,
    [workItemId, projectId]
  );

  // 3. Ảnh của các phiếu chứa hạng mục này (kèm metadata cột riêng + người lập/duyệt).
  const voucherIds = itemsRes.rows.map((r) => r.voucher_id);
  let photos = [];
  if (voucherIds.length > 0) {
    const phRes = await db.query(
      `
        SELECT
          avp.id, avp.voucher_id, avp.file_name, avp.mime_type, avp.caption,
          avp.file_size,
          avp.captured_at, avp.captured_at_source,
          avp.gps_latitude, avp.gps_longitude, avp.gps_accuracy_m,
          avp.gps_source, avp.metadata_status, avp.metadata_source,
          avp.geofence_status, avp.created_at,
          av.batch_name, av.status AS voucher_status, av.created_at AS voucher_created_at,
          av.reviewed_at AS voucher_reviewed_at,
          creator.name AS creator_name,
          reviewer.name AS reviewer_name,
          u.name AS uploaded_by_name
        FROM acceptance_voucher_photos avp
        JOIN acceptance_vouchers av ON av.id = avp.voucher_id
        JOIN users creator ON creator.id = av.created_by
        LEFT JOIN users reviewer ON reviewer.id = av.reviewed_by
        LEFT JOIN users u ON u.id = avp.uploaded_by
        WHERE avp.voucher_id = ANY($1::int[])
        ORDER BY avp.voucher_id, avp.created_at, avp.id
      `,
      [voucherIds]
    );
    photos = phRes.rows;

    // Tự động kiểm tra và trích xuất siêu dữ liệu EXIF/GPS cho ảnh chưa xử lý
    for (const p of photos) {
      if (p.metadata_status === "not_processed" || !p.metadata_status) {
        try {
          const bufRes = await db.query(
            `SELECT file_data, mime_type FROM acceptance_voucher_photos WHERE id = $1`,
            [p.id]
          );
          if (bufRes.rows.length > 0 && bufRes.rows[0].file_data) {
            const raw = bufRes.rows[0].file_data;
            const meta = await extractPhotoMetadata(raw, bufRes.rows[0].mime_type || p.mime_type);
            if (meta) {
              p.metadata_status = meta.metadata_status;
              if (meta.captured_at) p.captured_at = meta.captured_at;
              if (meta.gps_latitude != null) p.gps_latitude = meta.gps_latitude;
              if (meta.gps_longitude != null) p.gps_longitude = meta.gps_longitude;
              if (meta.gps_accuracy_m != null) p.gps_accuracy_m = meta.gps_accuracy_m;
              p.metadata_source = meta.metadata_source;
            }
          }
        } catch (_err) {
          // Bỏ qua lỗi enrichment nếu không truy vấn được metadata
        }
      }
    }
  }

  return { notFound: false, workItem: wi, lines: itemsRes.rows, photos };
}

// ── pdf rendering ────────────────────────────────────────────────────────────

function registerFonts(doc) {
  doc.registerFont("regular", FONT_REGULAR);
  doc.registerFont("bold", FONT_BOLD);
  doc.registerFont("italic", FONT_ITALIC);
  doc.registerFont("bolditalic", FONT_BOLDITALIC);
}

function drawStatusBadge(doc, status, x, y, width = 74, height = 16) {
  let bg = "#F1F5F9";
  let border = "#CBD5E1";
  let textColor = "#475569";
  let label = STATUS_LABELS[status] || status || "—";

  if (status === "approved") {
    bg = "#DCFCE7";
    border = "#86EFAC";
    textColor = "#15803D";
    label = "✓ " + label;
  } else if (status === "returned") {
    bg = "#FEE2E2";
    border = "#FCA5A5";
    textColor = "#DC2626";
    label = "✕ " + label;
  } else if (status === "pending_review") {
    bg = "#FEF3C7";
    border = "#FDE68A";
    textColor = "#B45309";
    label = "⏳ " + label;
  } else if (status === "draft") {
    bg = "#F1F5F9";
    border = "#CBD5E1";
    textColor = "#64748B";
    label = "✎ " + label;
  }

  const radius = height / 2;
  doc.save()
    .roundedRect(x, y, width, height, radius)
    .fillAndStroke(bg, border)
    .restore();

  doc.font("bold").fontSize(6.8).fillColor(textColor)
    .text(label, x, y + 3.5, { width, align: "center", lineBreak: false });
}

function fitText(doc, text, maxWidth) {
  if (!text) return "";
  let str = String(text).trim();
  if (doc.widthOfString(str) <= maxWidth) return str;
  while (str.length > 0 && doc.widthOfString(str + "...") > maxWidth) {
    str = str.slice(0, -1);
  }
  return str + "...";
}

function drawSectionHeading(doc, sectionNum, titleText, contentWidth) {
  const y = doc.y;
  const bannerH = 22;
  const badgeW = 26;

  // Nền banner mềm mại, phân tách rõ ràng từng phần 1, 2, 3, 4, 5
  doc.save()
    .roundedRect(PAGE.margin, y, contentWidth, bannerH, 4)
    .fillAndStroke("#F0F9FF", "#BAE6FD")
    .restore();

  // Khối badge số màu xanh thương hiệu (#0284C7) bo góc trái
  doc.save()
    .roundedRect(PAGE.margin, y, badgeW, bannerH, 4)
    .fill("#0284C7")
    .restore();

  // Số phần (1, 2, 3, 4, 5) nổi bật chữ trắng đậm
  doc.font("bold").fontSize(10).fillColor("#FFFFFF")
    .text(String(sectionNum), PAGE.margin, y + 4.5, { width: badgeW, align: "center", lineBreak: false });

  // Tiêu đề phần viết hoa, đậm, màu xanh đậm chuyên nghiệp (#0369A1)
  doc.font("bold").fontSize(9.5).fillColor("#0369A1")
    .text(titleText, PAGE.margin + badgeW + 10, y + 5, { width: contentWidth - badgeW - 16, lineBreak: false });

  // Khoảng cách bên dưới tiêu đề để nội dung bên trong không bị dính vào header
  doc.y = y + bannerH + 10;
}

// Sinh Buffer PDF cho hồ sơ. canViewGps quyết định có in toạ độ thô không.
async function buildDossierPdf(data, { canViewGps = false } = {}) {
  const { workItem: wi, lines, photos } = data;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: PAGE.margin, bottom: PAGE.margin + 20, left: PAGE.margin, right: PAGE.margin },
    bufferPages: true,
    info: {
      Title: `Hồ sơ nghiệm thu - ${wi.code || wi.id}`,
      Author: "Công trường 360",
      Subject: "Hồ sơ nghiệm thu chất lượng & khối lượng hoàn công",
    },
  });
  registerFonts(doc);

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const contentWidth = PAGE.width - PAGE.margin * 2; // ~525.28

  // Helper đảm bảo khoảng trống cho trang
  const ensureSpace = (needed) => {
    if (doc.y + needed > PAGE.height - (PAGE.margin + 25)) {
      doc.addPage();
      doc.x = PAGE.margin;
    }
  };

  // ── Header cơ quan & Tiêu đề hồ sơ ──
  const topBarY = doc.y;
  doc.save().rect(PAGE.margin, topBarY, contentWidth, 3).fill("#0284C7").restore();
  doc.y = topBarY + 6;

  // Thanh tổ chức & ngày xuất hồ sơ
  doc.font("bold").fontSize(8).fillColor("#0284C7")
    .text("CÔNG TRƯỜNG 360", PAGE.margin, doc.y, { continued: true, lineBreak: false });
  doc.font("regular").fontSize(7.5).fillColor("#64748B")
    .text("  |  Hệ thống Quản lý Thi công & Nghiệm thu Số", { continued: false, lineBreak: false });
  doc.font("regular").fontSize(7).fillColor("#64748B")
    .text(`Ngày xuất: ${fmtDateTime(new Date())}`, PAGE.margin, doc.y, { width: contentWidth, align: "right" });

  doc.moveDown(0.2);
  doc.font("bold").fontSize(15).fillColor("#0F172A")
    .text("HỒ SƠ NGHIỆM THU KHỐI LƯỢNG HẠNG MỤC", { align: "center" });
  doc.moveDown(0.15);
  doc.font("italic").fontSize(8).fillColor("#475569")
    .text("Tổng hợp lịch sử nghiệm thu các đợt, khối lượng lũy kế & bằng chứng ảnh hiện trường", { align: "center" });
  doc.moveDown(0.4);
  doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.margin + contentWidth, doc.y).strokeColor("#CBD5E1").lineWidth(0.8).stroke();
  doc.moveDown(0.4);

  // ── 1. THÔNG TIN NHẬN DIỆN (2 thẻ thông tin cân đối, phân cấp rõ ràng) ──
  drawSectionHeading(doc, 1, "THÔNG TIN NHẬN DIỆN HẠNG MỤC", contentWidth);

  const sec1Y = doc.y;
  const colGap = 10;
  const colW = (contentWidth - colGap) / 2;
  const card1X = PAGE.margin;
  const card2X = PAGE.margin + colW + colGap;
  const card1H = 80;

  // Thẻ trái: Thông tin hạng mục & dự án
  doc.save().roundedRect(card1X, sec1Y, colW, card1H, 4).fillAndStroke("#F8FAFC", "#E2E8F0").restore();
  doc.save().roundedRect(card1X, sec1Y, colW, 19, 4).fill("#EEF2F6").restore();
  doc.font("bold").fontSize(7.5).fillColor("#1E3A8A").text("HẠNG MỤC CÔNG TRÌNH", card1X + 8, sec1Y + 5.5);

  let c1Y = sec1Y + 24;
  const drawCardRow = (x, y, label, val, isBold = false, valColor = "#0F172A") => {
    doc.font("bold").fontSize(7.2).fillColor("#475569").text(`${label}:`, x + 8, y, { width: 85, lineBreak: false });
    const fitted = fitText(doc.font(isBold ? "bold" : "regular").fontSize(7.2), val, colW - 96);
    doc.fillColor(valColor).text(fitted, x + 84, y, { width: colW - 90, lineBreak: false });
  };

  drawCardRow(card1X, c1Y, "Dự án", wi.project_name || "—", true);
  c1Y += 13.5;
  drawCardRow(card1X, c1Y, "Hạng mục", `${wi.code ? `[${wi.code}] ` : ""}${wi.name}`, true, "#1E40AF");
  c1Y += 13.5;
  drawCardRow(card1X, c1Y, "Phân loại", wi.is_leaf ? "Hạng mục lá (Nghiệm thu)" : "Hạng mục cha");
  c1Y += 13.5;
  drawCardRow(card1X, c1Y, "Đơn vị tính", wi.unit || "—");

  // Thẻ phải: Chỉ tiêu hợp đồng & pháp lý
  doc.save().roundedRect(card2X, sec1Y, colW, card1H, 4).fillAndStroke("#F8FAFC", "#E2E8F0").restore();
  doc.save().roundedRect(card2X, sec1Y, colW, 19, 4).fill("#EEF2F6").restore();
  doc.font("bold").fontSize(7.5).fillColor("#1E3A8A").text("CHỈ TIÊU HỢP ĐỒNG & PHÁP LÝ", card2X + 8, sec1Y + 5.5);

  let c2Y = sec1Y + 24;
  drawCardRow(card2X, c2Y, "Khối lượng HĐ", wi.contract_quantity != null ? `${fmtQty(wi.contract_quantity)} ${wi.unit || ""}`.trim() : "—", true);
  c2Y += 13.5;
  drawCardRow(card2X, c2Y, "Đơn giá dự toán", fmtMoney(wi.unit_price));
  c2Y += 13.5;
  drawCardRow(card2X, c2Y, "Giá trị hợp đồng", fmtMoney(wi.contract_value), true, "#166534");
  c2Y += 13.5;
  drawCardRow(card2X, c2Y, "Toạ độ GPS", canViewGps ? "✓ Cho phép xem toạ độ" : "Đã ẩn theo quyền", false, canViewGps ? "#166534" : "#64748B");

  doc.y = sec1Y + card1H + 16;
  doc.x = PAGE.margin;

  // ── 2. TỔNG HỢP TIẾN ĐỘ & KHỐI LƯỢNG NGHIỆM THU ──
  const totalLines = lines.length;
  const approvedLines = lines.filter((l) => l.status === "approved");
  const returnedLines = lines.filter((l) => l.status === "returned");
  const lastApproved = [...approvedLines].sort((a, b) => {
    const ta = a.reviewed_at ? new Date(a.reviewed_at).getTime() : -1;
    const tb = b.reviewed_at ? new Date(b.reviewed_at).getTime() : -1;
    if (tb !== ta) return tb - ta;
    return b.voucher_id - a.voucher_id;
  })[0] || null;
  const latestCumulative = lastApproved ? Number(lastApproved.cumulative_quantity) : (lines.length ? Number(lines[lines.length - 1].cumulative_quantity) : 0);
  const contractQty = wi.contract_quantity != null ? Number(wi.contract_quantity) : null;
  const pct = contractQty && contractQty > 0 ? Math.min(100, (latestCumulative / contractQty) * 100) : null;
  const remainingQty = contractQty != null ? Math.max(0, contractQty - latestCumulative) : null;

  drawSectionHeading(doc, 2, "TỔNG HỢP TIẾN ĐỘ & KHỐI LƯỢNG NGHIỆM THU", contentWidth);

  // Khung thống kê 3 ô KPI lớn + thanh tiến độ trực quan
  const kpiBoxY = doc.y;
  const kpiGap = 8;
  const kpiBoxW = (contentWidth - kpiGap * 2) / 3;
  const kpiBoxH = 46;

  // Box 1: Tổng số đợt
  doc.save().roundedRect(PAGE.margin, kpiBoxY, kpiBoxW, kpiBoxH, 4).fillAndStroke("#F8FAFC", "#E2E8F0").restore();
  doc.font("bold").fontSize(7).fillColor("#64748B").text("TỔNG SỐ ĐỢT NGHIỆM THU", PAGE.margin + 8, kpiBoxY + 6, { lineBreak: false });
  doc.font("bold").fontSize(13.5).fillColor("#0F172A").text(`${totalLines} đợt`, PAGE.margin + 8, kpiBoxY + 18, { lineBreak: false });
  doc.font("regular").fontSize(6.5).fillColor("#64748B").text(`${approvedLines.length} đã duyệt · ${returnedLines.length} bị trả lại`, PAGE.margin + 8, kpiBoxY + 33, { lineBreak: false });

  // Box 2: Đã duyệt
  const kpi2X = PAGE.margin + kpiBoxW + kpiGap;
  doc.save().roundedRect(kpi2X, kpiBoxY, kpiBoxW, kpiBoxH, 4).fillAndStroke("#F0FDF4", "#BBF7D0").restore();
  doc.font("bold").fontSize(7).fillColor("#15803D").text("LŨY KẾ ĐÃ DUYỆT GẦN NHẤT", kpi2X + 8, kpiBoxY + 6, { lineBreak: false });
  doc.font("bold").fontSize(13.5).fillColor("#166534").text(`${latestCumulative != null ? fmtQty(latestCumulative) : "0"} ${wi.unit || ""}`, kpi2X + 8, kpiBoxY + 18, { lineBreak: false });
  doc.font("bold").fontSize(6.5).fillColor("#15803D").text(`Tỷ lệ: ${pct != null ? pct.toFixed(1) + "%" : "—"} hợp đồng`, kpi2X + 8, kpiBoxY + 33, { lineBreak: false });

  // Box 3: Còn lại
  const kpi3X = kpi2X + kpiBoxW + kpiGap;
  doc.save().roundedRect(kpi3X, kpiBoxY, kpiBoxW, kpiBoxH, 4).fillAndStroke("#EFF6FF", "#BFDBFE").restore();
  doc.font("bold").fontSize(7).fillColor("#1D4ED8").text("KHỐI LƯỢNG CÒN LẠI", kpi3X + 8, kpiBoxY + 6, { lineBreak: false });
  doc.font("bold").fontSize(13.5).fillColor("#1E40AF").text(`${remainingQty != null ? fmtQty(remainingQty) : "—"} ${wi.unit || ""}`, kpi3X + 8, kpiBoxY + 18, { lineBreak: false });
  doc.font("regular").fontSize(6.5).fillColor("#1D4ED8").text(`${pct != null ? (100 - pct).toFixed(1) + "%" : "—"} chưa nghiệm thu`, kpi3X + 8, kpiBoxY + 33, { lineBreak: false });

  // Thanh tiến độ tổng hợp (Visual Progress Bar)
  const barY = kpiBoxY + kpiBoxH + 7;
  const barH = 14;
  doc.save().roundedRect(PAGE.margin, barY, contentWidth, barH, 3).fillAndStroke("#F1F5F9", "#CBD5E1").restore();
  if (pct != null && pct > 0) {
    const filledW = Math.max(6, Math.min(contentWidth - 2, (contentWidth - 2) * (pct / 100)));
    doc.save().roundedRect(PAGE.margin + 1, barY + 1, filledW, barH - 2, 2.5).fill("#10B981").restore();
  }
  doc.font("bold").fontSize(6.8).fillColor("#0F172A")
    .text(
      `Tiến độ hoàn thành: ${pct != null ? pct.toFixed(1) + "%" : "—"}  ·  Lũy kế đã duyệt: ${fmtQty(latestCumulative)} / ${fmtQty(contractQty)} ${wi.unit || ""}`,
      PAGE.margin,
      barY + 3.5,
      { width: contentWidth, align: "center", lineBreak: false }
    );

  doc.y = barY + barH + 16;
  doc.x = PAGE.margin;

  // ── 3. CHI TIẾT CÁC ĐỢT NGHIỆM THU (Bảng thoáng đãng, phân cột rõ ràng, không đè chữ) ──
  drawSectionHeading(doc, 3, "CHI TIẾT CÁC ĐỢT NGHIỆM THU", contentWidth);

  if (lines.length === 0) {
    doc.font("italic").fontSize(8.5).fillColor("#64748B").text("Chưa có đợt nghiệm thu nào cho hạng mục này.", PAGE.margin, doc.y);
    doc.moveDown(0.6);
  } else {
    // 6 cột cân đối, rộng rãi: STT (26) | Đợt & Phiếu (168) | KL đợt (53) | Lũy kế duyệt (66) | Trạng thái (68) | Bên liên quan (144) => Tổng 525
    const cols = [
      { key: "idx", label: "STT", width: 26, align: "center" },
      { key: "batch", label: "Đợt & Phiếu nghiệm thu", width: 168, align: "left" },
      { key: "delta", label: "KL đợt", width: 53, align: "right" },
      { key: "cum", label: "Lũy kế duyệt", width: 66, align: "right" },
      { key: "status", label: "Trạng thái", width: 68, align: "center" },
      { key: "parties", label: "Bên liên quan (Lập / Duyệt)", width: 144, align: "left" },
    ];
    const tableWidth = cols.reduce((a, c) => a + c.width, 0);

    const drawHeader = () => {
      let x = PAGE.margin;
      const y = doc.y;
      const headerH = 21;
      doc.save().rect(x, y, tableWidth, headerH).fill("#1E293B").restore();
      cols.forEach((c) => {
        doc.font("bold").fontSize(7.2).fillColor("#FFFFFF")
          .text(c.label, x + 4, y + 6, { width: c.width - 8, align: c.align, lineBreak: false });
        x += c.width;
      });
      doc.y = y + headerH;
    };

    drawHeader();

    lines.forEach((l, i) => {
      const hasNote = Boolean(l.review_note && l.review_note.trim());
      const baseRowH = 40; // Chiều cao 40pt đảm bảo cách biệt 2 dòng 16pt, hoàn toàn không bao giờ đè chữ
      const noteH = hasNote ? 21 : 0;
      const totalRowH = baseRowH + noteH;
      ensureSpace(totalRowH + 2);

      let x = PAGE.margin;
      const y = doc.y;
      const zebra = i % 2 === 1 ? "#F8FAFC" : "#FFFFFF";

      // Nền hàng
      doc.save().rect(x, y, tableWidth, baseRowH).fill(zebra).restore();

      // subtle column divider
      let colDividerX = PAGE.margin;
      cols.forEach((c) => {
        colDividerX += c.width;
        doc.moveTo(colDividerX, y).lineTo(colDividerX, y + baseRowH).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
      });

      // 1. STT
      doc.font("bold").fontSize(7.5).fillColor("#64748B")
        .text(String(i + 1), x, y + 14, { width: cols[0].width, align: "center", lineBreak: false });
      x += cols[0].width;

      // 2. Đợt & Phiếu nghiệm thu (Dòng 1: Tên phiếu & đợt; Dòng 2: Ngày lập)
      doc.font("bold").fontSize(7.5).fillColor("#0F172A");
      const batchTitle = `Phiếu #${l.voucher_id} — ${l.batch_name || `Đợt ${i + 1}`}`;
      const fittedBatch = fitText(doc, batchTitle, cols[1].width - 10);
      doc.text(fittedBatch, x + 5, y + 8, { width: cols[1].width - 10, lineBreak: false });

      doc.font("regular").fontSize(6.5).fillColor("#64748B");
      const createdDateStr = `Ngày lập: ${fmtDateTime(l.voucher_created_at)}`;
      const fittedDate = fitText(doc, createdDateStr, cols[1].width - 10);
      doc.text(fittedDate, x + 5, y + 23, { width: cols[1].width - 10, lineBreak: false });
      x += cols[1].width;

      // 3. Khối lượng đợt
      doc.font("bold").fontSize(8).fillColor("#0F172A")
        .text(`+${fmtQty(l.delta_quantity)}`, x, y + 8, { width: cols[2].width - 6, align: "right", lineBreak: false });
      doc.font("regular").fontSize(6.5).fillColor("#64748B")
        .text(l.item_unit || wi.unit || "", x, y + 23, { width: cols[2].width - 6, align: "right", lineBreak: false });
      x += cols[2].width;

      // 4. Lũy kế sau đợt
      doc.font("bold").fontSize(8).fillColor("#1E40AF")
        .text(fmtQty(l.cumulative_quantity), x, y + 8, { width: cols[3].width - 6, align: "right", lineBreak: false });
      doc.font("regular").fontSize(6.5).fillColor("#64748B")
        .text(l.item_unit || wi.unit || "", x, y + 23, { width: cols[3].width - 6, align: "right", lineBreak: false });
      x += cols[3].width;

      // 5. Trạng thái (Pill Badge nổi bật được căn giữa hoàn hảo)
      drawStatusBadge(doc, l.status, x + (cols[4].width - 64) / 2, y + 12.5, 64, 15);
      x += cols[4].width;

      // 6. Bên liên quan (Lập / Duyệt)
      doc.font("regular").fontSize(6.8).fillColor("#334155");
      const creatorStr = `Lập: ${l.created_by_name || "—"}`;
      doc.text(fitText(doc, creatorStr, cols[5].width - 8), x + 5, y + 8, { width: cols[5].width - 8, lineBreak: false });

      const revText = l.reviewed_by_name ? `Duyệt: ${l.reviewed_by_name}` : "Chưa duyệt";
      const revDate = l.reviewed_at ? ` · ${fmtDateTime(l.reviewed_at).split(" ")[0]}` : "";
      doc.text(fitText(doc, `${revText}${revDate}`, cols[5].width - 8), x + 5, y + 23, { width: cols[5].width - 8, lineBreak: false });

      // Đường viền đáy hàng chính
      doc.moveTo(PAGE.margin, y + baseRowH).lineTo(PAGE.margin + tableWidth, y + baseRowH).strokeColor("#CBD5E1").lineWidth(0.5).stroke();

      // Nếu có Ý kiến thẩm định / Lý do trả lại: Vẽ BANNER RIÊNG TRẢI DÀI TOÀN BỘ CHIỀU RỘNG BẢNG
      if (hasNote) {
        const isRet = l.status === "returned";
        const noteBg = isRet ? "#FEF2F2" : "#FFFBEB";
        const noteBorder = isRet ? "#FCA5A5" : "#FDE68A";
        const noteAccent = isRet ? "#DC2626" : "#D97706";
        const noteText = isRet ? "#991B1B" : "#92400E";

        // Khung callout
        doc.save()
          .rect(PAGE.margin, y + baseRowH, tableWidth, noteH)
          .fillAndStroke(noteBg, noteBorder)
          .rect(PAGE.margin, y + baseRowH, 3.5, noteH)
          .fill(noteAccent)
          .restore();

        doc.font("bold").fontSize(7).fillColor(noteAccent)
          .text(isRet ? "⚠️ Lý do trả lại: " : "💬 Ý kiến thẩm định: ", PAGE.margin + 8, y + baseRowH + 6, { continued: true, lineBreak: false });
        doc.font("italic").fontSize(7).fillColor(noteText)
          .text(`"${l.review_note}"`, { width: tableWidth - 30, lineBreak: false });

        // Đường gạch đáy note
        doc.moveTo(PAGE.margin, y + totalRowH).lineTo(PAGE.margin + tableWidth, y + totalRowH).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
      }

      doc.y = y + totalRowH;
    });

    doc.x = PAGE.margin;
    doc.y += 16;
  }

  // ── 4. BẰNG CHỨNG ẢNH HIỆN TRƯỜNG (Bố cục thông minh: 1 ảnh dùng Horizontal Showcase; >=2 ảnh dùng Grid 2 cột) ──
  ensureSpace(160);
  doc.x = PAGE.margin;
  drawSectionHeading(doc, 4, "BẰNG CHỨNG ẢNH HIỆN TRƯỜNG THEO CÁC ĐỢT NGHIỆM THU", contentWidth);

  if (photos.length === 0) {
    doc.font("italic").fontSize(8.5).fillColor("#64748B")
      .text("Không có bằng chứng ảnh hiện trường đính kèm cho các đợt nghiệm thu của hạng mục này.", PAGE.margin, doc.y);
    doc.moveDown(0.8);
  } else if (photos.length === 1) {
    // ── TRƯỜNG HỢP ĐẶC BIỆT: 1 ẢNH DUY NHẤT ──
    // Vẽ thành thẻ ngang Showcase trải rộng 100% chiều ngang trang (525pt), không để hổng lãng phí bên phải!
    const p = photos[0];
    const showcaseH = 135;
    ensureSpace(showcaseH + 10);

    const cardX = PAGE.margin;
    const cardY = doc.y;
    const imgPaneW = 205;
    const metaPaneX = cardX + imgPaneW + 10;
    const metaPaneW = contentWidth - imgPaneW - 10;

    // Khung viền ngoài
    doc.save().roundedRect(cardX, cardY, contentWidth, showcaseH, 5).fillAndStroke("#FFFFFF", "#CBD5E1").restore();

    // Khung nền chứa ảnh
    doc.save().roundedRect(cardX + 6, cardY + 6, imgPaneW - 12, showcaseH - 12, 4).fillAndStroke("#F8FAFC", "#E2E8F0").restore();

    // Vẽ ảnh
    let embedded = false;
    try {
      const bufRes = await db.query(
        `SELECT file_data, mime_type FROM acceptance_voucher_photos WHERE id = $1`,
        [p.id]
      );
      if (bufRes.rows.length > 0 && bufRes.rows[0].file_data) {
        const raw = bufRes.rows[0].file_data;
        const jpeg = await sharp(raw)
          .rotate()
          .resize({ width: 600, height: 420, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();

        doc.image(jpeg, cardX + 10, cardY + 10, {
          fit: [imgPaneW - 20, showcaseH - 20],
          align: "center",
          valign: "center",
        });
        embedded = true;
      }
    } catch (_) {
      embedded = false;
    }

    if (!embedded) {
      doc.font("italic").fontSize(7.5).fillColor("#94A3B8")
        .text("[Ảnh không khả dụng hoặc định dạng không hỗ trợ]", cardX + 12, cardY + showcaseH / 2 - 5, {
          width: imgPaneW - 24,
          align: "center",
        });
    }

    // Đường phân cách giữa ảnh và thông tin
    doc.moveTo(cardX + imgPaneW, cardY + 6).lineTo(cardX + imgPaneW, cardY + showcaseH - 6).strokeColor("#E2E8F0").lineWidth(0.8).stroke();

    // Bảng thông tin ảnh bên phải
    let metaY = cardY + 10;

    // Tiêu đề phiếu & Badge
    doc.font("bold").fontSize(9).fillColor("#0F172A")
      .text(`Phiếu #${p.voucher_id} — ${p.batch_name || "Đợt nghiệm thu"}`, metaPaneX, metaY, { width: metaPaneW - 75, lineBreak: false, ellipsis: true });
    drawStatusBadge(doc, p.voucher_status, metaPaneX + metaPaneW - 72, metaY - 1, 70, 15);
    metaY += 18;

    doc.moveTo(metaPaneX, metaY).lineTo(cardX + contentWidth - 8, metaY).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
    metaY += 8;

    const drawMetaRow = (label, val, isRed = false) => {
      doc.font("bold").fontSize(7.2).fillColor("#475569").text(`${label}:`, metaPaneX, metaY, { width: 85, lineBreak: false });
      doc.font("regular").fontSize(7.2).fillColor(isRed ? "#DC2626" : "#0F172A").text(val, metaPaneX + 85, metaY, { width: metaPaneW - 90, lineBreak: false, ellipsis: true });
      metaY += 13.5;
    };

    // 1. Thời điểm chụp
    let timeText = "Không có siêu dữ liệu";
    if (p.captured_at) timeText = `${fmtDateTime(p.captured_at)} (EXIF gốc thiết bị)`;
    else if (p.created_at || p.voucher_created_at) timeText = `${fmtDateTime(p.created_at || p.voucher_created_at)} (Thời điểm tải lên)`;
    drawMetaRow("Thời điểm chụp", timeText);

    // 2. Toạ độ GPS
    let gpsText = "Không có toạ độ GPS trong ảnh";
    let isOutside = false;
    if (canViewGps && p.gps_latitude !== null && p.gps_longitude !== null) {
      const acc = p.gps_accuracy_m != null ? ` (±${p.gps_accuracy_m}m)` : "";
      const geo = p.geofence_status === "inside" ? " ✓ Trong công trường" : p.geofence_status === "outside" ? " ⚠️ Ngoài phạm vi công trường" : "";
      gpsText = `${p.gps_latitude}, ${p.gps_longitude}${acc}${geo}`;
      isOutside = p.geofence_status === "outside";
    } else if (!canViewGps && p.gps_latitude !== null && p.gps_longitude !== null) {
      gpsText = "Đã ẩn (không có quyền xem vị trí)";
    }
    drawMetaRow("Toạ độ GPS", gpsText, isOutside);

    // 3. Người lập & duyệt
    drawMetaRow("Người lập phiếu", p.creator_name || p.uploaded_by_name || "—");
    drawMetaRow("Người phê duyệt", p.reviewer_name || (p.voucher_status === "approved" ? "Ban quản lý" : "Chưa duyệt"));

    // 4. File gốc & chú thích
    drawMetaRow("Tệp hình ảnh", `${p.file_name || `Ảnh #${p.id}`}${p.caption ? ` — Ghi chú: ${p.caption}` : ""}`);

    doc.y = cardY + showcaseH + 12;
  } else {
    // ── TRƯỜNG HỢP NHIỀU ẢNH (>=2 ẢNH): LƯỚI 2 CỘT ──
    doc.font("regular").fontSize(7.5).fillColor("#475569")
      .text(`Tổng số ảnh hiện trường: ${photos.length} ảnh (kèm thời điểm, toạ độ GPS, người lập và người phê duyệt).`, PAGE.margin, doc.y);
    doc.moveDown(0.3);

    const cardGap = 10;
    const cardW = (contentWidth - cardGap) / 2; // ~257.64pt
    const imgAreaH = 105;
    const infoAreaH = 75;
    const cardH = imgAreaH + infoAreaH; // 180pt tổng

    let col = 0;
    let rowStartY = doc.y;

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];

      if (col === 0 && rowStartY + cardH > PAGE.height - (PAGE.margin + 30)) {
        doc.addPage();
        doc.x = PAGE.margin;
        rowStartY = doc.y;
      }

      const cardX = PAGE.margin + col * (cardW + cardGap);
      const cardY = rowStartY;

      // Khung thẻ ảnh
      doc.save().roundedRect(cardX, cardY, cardW, cardH, 4).fillAndStroke("#FFFFFF", "#CBD5E1").restore();
      // Nền vùng thông tin
      doc.save().roundedRect(cardX, cardY + imgAreaH, cardW, infoAreaH, 3).fillAndStroke("#F8FAFC", "#E2E8F0").restore();

      // Tải và vẽ ảnh
      let embedded = false;
      try {
        const bufRes = await db.query(
          `SELECT file_data, mime_type FROM acceptance_voucher_photos WHERE id = $1`,
          [p.id]
        );
        if (bufRes.rows.length > 0 && bufRes.rows[0].file_data) {
          const raw = bufRes.rows[0].file_data;
          const jpeg = await sharp(raw)
            .rotate()
            .resize({ width: 500, height: 350, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();

          doc.image(jpeg, cardX + 5, cardY + 5, {
            fit: [cardW - 10, imgAreaH - 10],
            align: "center",
            valign: "center",
          });
          embedded = true;
        }
      } catch (_) {
        embedded = false;
      }

      if (!embedded) {
        doc.font("italic").fontSize(7.5).fillColor("#94A3B8")
          .text("[Ảnh không khả dụng hoặc định dạng không hỗ trợ]", cardX + 8, cardY + imgAreaH / 2 - 5, {
            width: cardW - 16,
            align: "center",
          });
      }

      // Thông tin chi tiết ảnh
      let infoY = cardY + imgAreaH + 5;
      const textPadding = cardX + 6;
      const textW = cardW - 12;

      // 1. Tiêu đề đợt + Badge
      doc.font("bold").fontSize(7.5).fillColor("#0F172A")
        .text(fitText(doc, `Phiếu #${p.voucher_id} — ${p.batch_name || "Đợt"}`, textW - 65), textPadding, infoY, { width: textW - 65, lineBreak: false });
      drawStatusBadge(doc, p.voucher_status, textPadding + textW - 62, infoY - 1, 62, 13);
      infoY += 13.5;

      // 2. Thời điểm
      let timeText = "Không có siêu dữ liệu";
      if (p.captured_at) timeText = `${fmtDateTime(p.captured_at)} (EXIF)`;
      else if (p.created_at || p.voucher_created_at) timeText = `${fmtDateTime(p.created_at || p.voucher_created_at)} (Tải lên)`;
      doc.font("bold").fontSize(6.8).fillColor("#475569").text("Thời điểm: ", textPadding, infoY, { continued: true, lineBreak: false });
      doc.font("regular").fillColor("#0F172A").text(fitText(doc, timeText, textW - 45), { lineBreak: false });
      infoY += 11;

      // 3. Toạ độ GPS
      let gpsText = "Không có toạ độ GPS";
      if (canViewGps && p.gps_latitude !== null && p.gps_longitude !== null) {
        const acc = p.gps_accuracy_m != null ? ` (±${p.gps_accuracy_m}m)` : "";
        const geo = p.geofence_status === "inside" ? " ✓ Trong CT" : p.geofence_status === "outside" ? " ⚠️ Ngoài CT" : "";
        gpsText = `${p.gps_latitude}, ${p.gps_longitude}${acc}${geo}`;
      } else if (!canViewGps && p.gps_latitude !== null && p.gps_longitude !== null) {
        gpsText = "Đã ẩn theo quyền";
      }
      doc.font("bold").fontSize(6.8).fillColor("#475569").text("Toạ độ GPS: ", textPadding, infoY, { continued: true, lineBreak: false });
      doc.font("regular").fillColor(p.geofence_status === "outside" ? "#DC2626" : "#0F172A").text(fitText(doc, gpsText, textW - 48), { lineBreak: false });
      infoY += 11;

      // 4. Người lập & duyệt
      const creatorName = p.creator_name || p.uploaded_by_name || "—";
      const reviewerName = p.reviewer_name || (p.voucher_status === "approved" ? "Ban quản lý" : "Chưa duyệt");
      doc.font("bold").fontSize(6.8).fillColor("#475569").text("Lập / Duyệt: ", textPadding, infoY, { continued: true, lineBreak: false });
      doc.font("regular").fillColor("#0F172A").text(fitText(doc, `${creatorName}  ·  ${reviewerName}`, textW - 48), { lineBreak: false });
      infoY += 11;

      // 5. Tệp & chú thích
      const captionText = p.caption ? `Ghi chú: ${p.caption} · ` : "";
      doc.font("italic").fontSize(6.2).fillColor("#64748B")
        .text(fitText(doc, `${captionText}${p.file_name || `Ảnh #${p.id}`}`, textW), textPadding, infoY, { lineBreak: false });

      if (col === 0) {
        col = 1;
      } else {
        col = 0;
        rowStartY += cardH + 10;
      }
    }

    if (col === 1) {
      rowStartY += cardH + 10;
    }
    doc.y = rowStartY;
  }

  doc.x = PAGE.margin;

  // ── 5. PHẦN KÝ TÊN VÀ XÁC NHẬN HOÀN CÔNG (2 khung chữ ký trang trọng, chỉn chu) ──
  ensureSpace(95);
  doc.moveDown(0.6);
  drawSectionHeading(doc, 5, "XÁC NHẬN VÀ KÝ TÊN HOÀN CÔNG", contentWidth);
  const signY = doc.y;
  const signGap = 12;
  const signBoxW = (contentWidth - signGap) / 2;
  const signBoxH = 75;
  const signB1X = PAGE.margin;
  const signB2X = PAGE.margin + signBoxW + signGap;

  // Khung 1: Đơn vị thi công
  doc.save().roundedRect(signB1X, signY, signBoxW, signBoxH, 4).fillAndStroke("#F8FAFC", "#CBD5E1").restore();
  doc.font("bold").fontSize(8).fillColor("#0F172A")
    .text("ĐẠI DIỆN ĐƠN VỊ THI CÔNG / LẬP HỒ SƠ", signB1X + 8, signY + 8, { width: signBoxW - 16, align: "center", lineBreak: false });
  doc.font("italic").fontSize(7).fillColor("#64748B")
    .text("(Ký, ghi rõ họ tên và chức vụ)", signB1X + 8, signY + 20, { width: signBoxW - 16, align: "center", lineBreak: false });
  doc.font("regular").fontSize(6.8).fillColor("#94A3B8")
    .text("Ngày ký: ...... / ...... / 202...", signB1X + 10, signY + signBoxH - 20, { width: signBoxW - 20, align: "center", lineBreak: false });
  doc.font("bold").fontSize(7).fillColor("#475569")
    .text("Họ và tên: .....................................................", signB1X + 10, signY + signBoxH - 10, { width: signBoxW - 20, align: "center", lineBreak: false });

  // Khung 2: Ban quản lý / Chủ đầu tư
  doc.save().roundedRect(signB2X, signY, signBoxW, signBoxH, 4).fillAndStroke("#F8FAFC", "#CBD5E1").restore();
  doc.font("bold").fontSize(8).fillColor("#0F172A")
    .text("ĐẠI DIỆN BAN QUẢN LÝ / CHỦ ĐẦU TƯ", signB2X + 8, signY + 8, { width: signBoxW - 16, align: "center", lineBreak: false });
  doc.font("italic").fontSize(7).fillColor("#64748B")
    .text("(Ký, đóng dấu, ghi rõ họ tên và chức vụ)", signB2X + 8, signY + 20, { width: signBoxW - 16, align: "center", lineBreak: false });
  doc.font("regular").fontSize(6.8).fillColor("#94A3B8")
    .text("Ngày ký: ...... / ...... / 202...", signB2X + 10, signY + signBoxH - 20, { width: signBoxW - 20, align: "center", lineBreak: false });
  doc.font("bold").fontSize(7).fillColor("#475569")
    .text("Họ và tên: .....................................................", signB2X + 10, signY + signBoxH - 10, { width: signBoxW - 20, align: "center", lineBreak: false });
  doc.y = signY + signBoxH + 8;

  // ── Đánh số trang và tiêu đề chân trang (Footer) ──
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const origBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // Tránh PDFKit tự addPage() khi vẽ ở chân trang
    const bottomY = PAGE.height - PAGE.margin - 6;
    doc.moveTo(PAGE.margin, bottomY - 4).lineTo(PAGE.margin + contentWidth, bottomY - 4).strokeColor("#E2E8F0").lineWidth(0.5).stroke();
    doc.font("regular").fontSize(7).fillColor("#94A3B8")
      .text(
        `Hồ sơ hoàn công nghiệm thu hạng mục ${wi.code ? `[${wi.code}] ` : ""}${wi.name} · Dự án ${wi.project_name}`,
        PAGE.margin,
        bottomY,
        { width: contentWidth - 90, align: "left", lineBreak: false }
      );
    doc.font("bold").fontSize(7).fillColor("#94A3B8")
      .text(`Trang ${i + 1} / ${range.count}`, PAGE.margin + contentWidth - 80, bottomY, {
        width: 80,
        align: "right",
        lineBreak: false,
      });
    doc.page.margins.bottom = origBottom;
  }

  doc.end();
  return done;
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Dữ liệu + PDF cho hồ sơ nghiệm thu của 1 hạng mục.
 * @returns {{notFound:boolean, filename:string, buffer:Buffer} | {notFound:true}}
 */
async function generateAcceptanceDossier(projectId, workItemId, { canViewGps = false } = {}) {
  const data = await loadDossierData(projectId, workItemId);
  if (data.notFound) return { notFound: true };

  const buffer = await buildDossierPdf(data, { canViewGps });
  const safeCode = String(data.workItem.code || data.workItem.id).replace(/[^A-Za-z0-9_-]/g, "_");
  const filename = `ho-so-nghiem-thu-${safeCode}-p${projectId}.pdf`;
  return { notFound: false, filename, buffer, data };
}

module.exports = {
  generateAcceptanceDossier,
  loadDossierData,
  _internal: { buildDossierPdf, STATUS_LABELS, METADATA_STATUS_LABELS, fmtQty },
};
