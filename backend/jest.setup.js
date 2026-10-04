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

// Load .env.test — ghi đè bất kỳ biến nào đã tồn tại
require("dotenv").config({
  path: path.resolve(__dirname, ".env.test"),
  override: true,
});

// Đảm bảo db.js dùng DB local test (không phải Supabase)
process.env.DATABASE_URL = process.env.LOCAL_DATABASE_URL || "postgres://postgres:postgres123@localhost:5433/construction_db_test";

