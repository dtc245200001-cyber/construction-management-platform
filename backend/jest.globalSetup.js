/**
 * jest.globalSetup.js
 *
 * Chạy MỘT LẦN trước khi toàn bộ test suite khởi động.
 * Nhiệm vụ: Migrate (tạo schema) cho DB test (construction_db_test)
 * để mỗi lần chạy test đều bắt đầu từ schema mới, sạch sẽ.
 *
 * Tại sao cần file này:
 *   - Các test (beforeAll) thường INSERT dữ liệu tạm nhưng không tạo được table.
 *   - Table phải tồn tại trước, globalSetup là nơi duy nhất chạy trước tất cả.
 *   - Dùng node-pg-migrate (đã có trong dependencies) để chạy migration giống
 *     môi trường production → không cần viết SQL tạo bảng 2 lần.
 */
"use strict";

const path = require("path");

module.exports = async () => {
  const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

  // Tải .env.test để các module con (db.js) dùng đúng DB test
  require("dotenv").config({
    path: path.resolve(__dirname, ".env.test"),
    override: !isCI,
  });

  const dbUrl = isCI
    ? (process.env.DATABASE_URL || "postgres://postgres:postgres123@localhost:5433/construction_db_test")
    : (process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL || "postgres://postgres:postgres123@localhost:5432/construction_db_test");

  console.log("\n[Jest globalSetup] Đang chạy migration trên DB test:", dbUrl.split("@")[1]);

  // ── Reconcile pgmigrations cho migration bị đổi tên ─────────────────────
  // Lịch sử: migration password_reset_tokens từng được commit tên
  //   1800000000000_create-password-reset-tokens  (đã chạy & ghi vào pgmigrations
  //   trên construction_db_test ngày 2026-10-15).
  // Sau đó file được đổi tên thành
  //   1800100000000_create-password-reset-tokens  (commit 8f4eb9a),
  // để nhường timestamp 1800000000000 cho migration add-photo-gps-source-and-basis
  // (commit 24a04af). node-pg-migrate so khớp theo TÊN FILE → vẫn coi bản
  // 1800100000000 là "chưa chạy" → cố createTable → "already exists" → làm
  // beforeAll migrate của nhiều suite integration ném lỗi.
  // Bảng thật trong DB đã khớp đúng schema của 1800100000000 (đã xác minh), nên
  // chỉ cần ĐỔI TÊN dòng lịch sử — pure bookkeeping, KHÔNG đụng schema/dữ liệu.
  // Chỉ thực hiện trên DB test cô lập (dbUrl đã trỏ construction_db_test).
  try {
    const { Pool } = require("pg");
    const reconPool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 4000,
    });
    try {
      // Chỉ đổi tên khi: (a) tên cũ còn trong pgmigrations, (b) tên mới chưa có.
      // Điều này idempotent — chạy lại an toàn, không ghi đè lịch sử hợp lệ.
      const stale = await reconPool.query(
        `SELECT name FROM pgmigrations
         WHERE name = '1800000000000_create-password-reset-tokens'`
      );
      if (stale.rows.length > 0) {
        const newer = await reconPool.query(
          `SELECT name FROM pgmigrations
           WHERE name = '1800100000000_create-password-reset-tokens'`
        );
        if (newer.rows.length === 0) {
          await reconPool.query(
            `UPDATE pgmigrations
             SET name = '1800100000000_create-password-reset-tokens'
             WHERE name = '1800000000000_create-password-reset-tokens'`
          );
          console.log(
            "[Jest globalSetup] Đã reconcile pgmigrations: rename " +
            "1800000000000 -> 1800100000000 (password_reset_tokens)."
          );
        }
      }
    } finally {
      await reconPool.end();
    }
  } catch (reconErr) {
    // Reconcile là best-effort: nếu pgmigrations chưa tồn tại (DB mới) thì bỏ qua.
    console.warn(
      `[Jest globalSetup] Bỏ qua reconcile pgmigrations (${reconErr.message}).`
    );
  }

  // Chạy node-pg-migrate bằng API (không gọi CLI để tránh lỗi PATH trên Windows)
  const runner = require("node-pg-migrate").default || require("node-pg-migrate");

  try {
    await runner({
      databaseUrl: dbUrl,
      dir: path.resolve(__dirname, "migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
      count: Infinity,
      checkOrder: false,
      log: () => {}, // Tắt verbose log trong test
    });
    console.log("[Jest globalSetup] Migration hoàn tất.\n");
  } catch (err) {
    console.warn(
      `[Jest globalSetup] Không thể kết nối DB test (${err.message || err}). Các unit test dùng mock vẫn tiếp tục chạy.\n`
    );
  }
};
