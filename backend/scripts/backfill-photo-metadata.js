#!/usr/bin/env node
"use strict";

/**
 * Script backfill siêu dữ liệu EXIF/GPS cho các ảnh đã tải lên trước khi có Story S-40
 *
 * Cách dùng:
 *   node backend/scripts/backfill-photo-metadata.js           # Dry-run (mặc định)
 *   node backend/scripts/backfill-photo-metadata.js --apply   # Ghi vào DB
 *
 * Nguyên tắc:
 *   - Tuyệt đối KHÔNG log toạ độ hay thời gian chụp ra terminal / log file.
 *   - Xử lý theo lô (batchSize = 100).
 */

const db = require("../config/db");
const { extractPhotoMetadata } = require("../services/photoMetadata");

const BATCH_SIZE = 100;
const isApply = process.argv.includes("--apply");

async function backfillTable(tableName) {
  console.log(`\n=== Bắt đầu quét bảng ${tableName} (Chế độ: ${isApply ? "APPLY (Ghi thật)" : "DRY-RUN (Thử nghiệm)"}) ===`);

  let totalProcessed = 0;
  let stats = {
    complete: 0,
    time_only: 0,
    gps_only: 0,
    none: 0,
    unreadable: 0,
    unsupported: 0,
  };

  let hasMore = true;
  while (hasMore) {
    const res = await db.query(
      `SELECT id, file_name, mime_type, file_data
       FROM ${tableName}
       WHERE metadata_status = 'not_processed'
       ORDER BY id ASC
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (res.rows.length === 0) {
      hasMore = false;
      break;
    }

    for (const row of res.rows) {
      const meta = await extractPhotoMetadata(row.file_data, row.mime_type);
      stats[meta.metadata_status] = (stats[meta.metadata_status] || 0) + 1;
      totalProcessed++;

      if (isApply) {
        await db.query(
          `UPDATE ${tableName}
           SET captured_at = $1,
               captured_at_source = $2,
               gps_latitude = $3,
               gps_longitude = $4,
               gps_accuracy_m = $5,
               metadata_status = $6,
               metadata_source = $7
           WHERE id = $8`,
          [
            meta.captured_at,
            meta.captured_at_source,
            meta.gps_latitude,
            meta.gps_longitude,
            meta.gps_accuracy_m,
            meta.metadata_status,
            meta.metadata_source,
            row.id,
          ]
        );
      }
    }

    console.log(`Đã xử lý lô ${res.rows.length} bản ghi... (Tổng: ${totalProcessed})`);
    if (!isApply) {
      // Trong chế độ dry-run, kiểm tra xem còn bản ghi nào có id lớn hơn không
      const nextCheck = await db.query(
        `SELECT COUNT(*)::int AS remaining
         FROM ${tableName}
         WHERE metadata_status = 'not_processed' AND id > $1`,
        [res.rows[res.rows.length - 1].id]
      );
      if (nextCheck.rows[0].remaining === 0) {
        hasMore = false;
        break;
      }
    }
  }

  console.log(`Kết quả ${tableName}:`);
  console.log(`- Tổng số ảnh đã quét: ${totalProcessed}`);
  console.log(`- Phân bố trạng thái:`, JSON.stringify(stats, null, 2));
}

async function run() {
  try {
    await backfillTable("diary_entry_attachments");
    await backfillTable("acceptance_voucher_photos");
    console.log("\nHoàn tất backfill.");
  } catch (err) {
    console.error("Lỗi khi chạy backfill:", err.message);
    process.exit(1);
  } finally {
    await db.end();
  }
}

run();
