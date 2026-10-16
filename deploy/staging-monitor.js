#!/usr/bin/env node
"use strict";

/**
 * Runner giám sát Staging định kỳ và gửi cảnh báo (T-128 & T-129)
 *
 * Chạy trên máy chủ Staging hoặc qua Docker service:
 * node deploy/staging-monitor.js
 */

const path = require("path");
const fs = require("fs");

// Nạp biến môi trường từ .env.staging hoặc .env nếu có
const stagingEnvPath = path.resolve(__dirname, ".env.staging");
const rootEnvPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(stagingEnvPath)) {
  require("dotenv").config({ path: stagingEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  require("dotenv").config({ path: rootEnvPath });
}

let StagingMonitor;
try {
  StagingMonitor = require("../backend/services/stagingMonitor");
} catch {
  try {
    StagingMonitor = require("../services/stagingMonitor");
  } catch {
    StagingMonitor = require("./services/stagingMonitor");
  }
}

const monitor = new StagingMonitor({
  targetUrl: process.env.MONITOR_TARGET_URL || "http://localhost:3000/health",
  checkIntervalSeconds: Number(process.env.CHECK_INTERVAL_SECONDS) || 30,
  alertThresholdSeconds: Number(process.env.ALERT_THRESHOLD_SECONDS) || 300,
  webhookUrl: process.env.ALERT_WEBHOOK_URL || "",
  channelType: process.env.ALERT_CHANNEL_TYPE || "auto",
  environment: process.env.ALERT_ENVIRONMENT || "staging",
});

console.log("==================================================================");
console.log("🚀 KHỞI ĐỘNG HỆ THỐNG GIÁM SÁT SỨC KHỎE STAGING (T-128 & T-129)");
console.log(`- Mục tiêu giám sát:    ${monitor.targetUrl}`);
console.log(`- Chu kỳ kiểm tra:      ${monitor.checkIntervalSeconds}s`);
console.log(`- Ngưỡng kích cảnh báo: ${monitor.alertThresholdSeconds}s (5 phút)`);
console.log(`- Kênh thông báo:       ${monitor.resolveChannelType()} (Webhook: ${monitor.webhookUrl ? "Đã cấu hình" : "Chưa cấu hình (Console Mock)"})`);
console.log("==================================================================");

monitor.start();

const shutdown = () => {
  console.log("\n[STAGING MONITOR] Nhận tín hiệu dừng tiến trình. Đang dọn dẹp...");
  monitor.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
