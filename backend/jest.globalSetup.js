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

  // Chạy node-pg-migrate bằng API (không gọi CLI để tránh lỗi PATH trên Windows)
  const runner = require("node-pg-migrate").default || require("node-pg-migrate");
  
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
};
