/**
 * jest.setup.js — Chạy TRƯỚC MỖI TEST FILE (setupFilesAfterFramework).
 *
 * Mục đích:
 *  1. Load .env.test thay cho .env, đảm bảo mọi module (db.js, emailSender.js…)
 *     dùng đúng biến môi trường của môi trường test.
 *  2. Ghi đè DATABASE_URL = LOCAL_DATABASE_URL (DB test local) để db.js
 *     không bao giờ kết nối tới Supabase cloud khi test.
 *
 * Tại sao không dùng dotenv trong từng test file:
 *  Jest cache module giữa các test. Nếu mỗi test tự load .env khác nhau sẽ
 *  gây race condition. Tập trung vào 1 file setup là cách an toàn nhất.
 */
"use strict";

const path = require("path");

const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

// Load .env.test — ghi đè bất kỳ biến nào đã tồn tại khi chạy local
require("dotenv").config({
  path: path.resolve(__dirname, ".env.test"),
  override: !isCI,
});

// Đảm bảo db.js dùng DB test đúng cổng (CI: 5433, Local: 5432)
if (isCI) {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres123@localhost:5433/construction_db_test";
} else {
  process.env.DATABASE_URL =
    process.env.LOCAL_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres123@localhost:5432/construction_db_test";
}

// Auth integration tests exercise public registration; keep this override test-only.
process.env.ALLOW_PUBLIC_REGISTER = "true";

// Cô lập Google OAuth trong test: xoá credential thật có thể rò từ ../.env
// (app.js load ../.env lúc require, độc lập với .env.test) để test
// "google/status trả configured=false khi chưa cấu hình" luôn xác định.
// Chỉ ảnh hưởng môi trường test — không đổi behavior production.
process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";
// authRoutes kiểm tra GOOGLE_CALLBACK_URL; xoá cả hai biến redirect cho chắc.
process.env.GOOGLE_CALLBACK_URL = "";
process.env.GOOGLE_REDIRECT_URI = "";
