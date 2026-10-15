#!/usr/bin/env node
"use strict";

/**
 * Script mô phỏng Staging ngừng phản hồi và phục hồi (T-129 AC)
 *
 * Chạy thử nghiệm:
 *   node deploy/simulate-staging-alert.js
 *
 * Quy trình mô phỏng:
 * 1. Khởi tạo Mock Server đại diện cho Staging.
 * 2. Giai đoạn 1: Staging hoạt động bình thường (200 Healthy).
 * 3. Giai đoạn 2: Staging gặp sự cố ngừng phản hồi (503 / Down).
 * 4. Vượt ngưỡng thất bại (mô phỏng rút gọn 5 giây để test nhanh, hoặc 300 giây thực tế).
 * 5. Kích hoạt CẢNH BÁO (Alert: Staging down > 5 phút) gửi đến webhook / log.
 * 6. Giai đoạn 3: Staging phục hồi (200 Healthy trở lại).
 * 7. Kích hoạt PHỤC HỒI (Recovery: Staging recovered) chuyển trạng thái cảnh báo.
 */

const http = require("http");
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

const SIMULATION_PORT = Number(process.env.SIMULATION_PORT) || 3099;
const SIMULATION_THRESHOLD = Number(process.env.SIMULATION_THRESHOLD_SECONDS) || 5;

let serverState = "healthy"; // 'healthy' | 'unhealthy'
let alertCount = 0;
let recoveryCount = 0;
const alertEvents = [];

// Khởi tạo mock staging server
const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    if (serverState === "healthy") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          app: { status: "healthy", uptime: 100 },
          database: { status: "healthy", responseTimeMs: 5 },
        })
      );
    } else {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          app: { status: "healthy", uptime: 100 },
          database: { status: "unhealthy", error: "Không thể kết nối cơ sở dữ liệu" },
        })
      );
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(SIMULATION_PORT, async () => {
  console.log("================================================================================");
  console.log("🧪 BẮT ĐẦU KỊCH BẢN MÔ PHỎNG SỰ CỐ & PHỤC HỒI STAGING (T-129)");
  console.log(`- Cổng Mock Staging: http://localhost:${SIMULATION_PORT}/health`);
  console.log(`- Ngưỡng kích hoạt mô phỏng: ${SIMULATION_THRESHOLD} giây (thay cho 300s để kiểm thử nhanh)`);
  console.log("================================================================================\n");

  const monitor = new StagingMonitor({
    targetUrl: `http://localhost:${SIMULATION_PORT}/health`,
    checkIntervalSeconds: 1, // 1 giây một lần để chạy kịch bản mượt mà
    alertThresholdSeconds: SIMULATION_THRESHOLD,
    webhookUrl: process.env.ALERT_WEBHOOK_URL || "mock",
    channelType: "generic",
    environment: "staging-simulation",
    onAlertSent: (payload, details) => {
      alertCount += 1;
      alertEvents.push({ type: "alert", payload, details });
      console.log(">>> [TRIGGER ALERT] 🚨 ĐÃ KÍCH HOẠT CẢNH BÁO:", payload.title || payload.event);
    },
    onRecoverySent: (payload, details) => {
      recoveryCount += 1;
      alertEvents.push({ type: "recovery", payload, details });
      console.log(">>> [TRIGGER RECOVERY] ✅ ĐÃ KÍCH HOẠT PHỤC HỒI:", payload.title || payload.event);
    },
    logger: {
      info: (msg, data) => console.log(`   [INFO] ${msg}`, data ? JSON.stringify(data) : ""),
      error: (msg) => console.error(`   [ERROR] ${msg}`),
    },
  });

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    // 1. Kiểm tra trạng thái bình thường
    console.log("[BƯỚC 1] Staging đang hoạt động bình thường...");
    serverState = "healthy";
    const check1 = await monitor.checkHealthOnce();
    console.log(`   Kết quả: ${check1.status.toUpperCase()} (Alert sent: ${check1.alertSent || false})`);

    // 2. Mô phỏng Staging gặp sự cố (Down)
    console.log("\n[BƯỚC 2] Mô phỏng: Cắt kết nối DB / Staging ngừng phản hồi...");
    serverState = "unhealthy";

    console.log(`   Chờ chuỗi thất bại vượt ngưỡng ${SIMULATION_THRESHOLD}s...`);
    for (let i = 1; i <= SIMULATION_THRESHOLD + 2; i++) {
      const res = await monitor.checkHealthOnce();
      console.log(`   + Giây thứ ${i}: status=${res.status}, duration=${res.durationSeconds}s, alertTriggered=${res.alertTriggered}`);
      await sleep(1000);
    }

    if (alertCount === 0) {
      throw new Error("LỖI: Cảnh báo chưa được kích hoạt sau khi vượt ngưỡng thời gian!");
    }
    console.log(`   => Đạt yêu cầu AC 1: Đã phát hiện sự cố kéo dài và tạo cảnh báo!`);

    // 3. Mô phỏng Staging phục hồi
    console.log("\n[BƯỚC 3] Mô phỏng: Khôi phục DB / Staging phản hồi trở lại...");
    serverState = "healthy";
    const resRecovered = await monitor.checkHealthOnce();
    console.log(`   Kết quả sau khi phục hồi: status=${resRecovered.status}, recoverySent=${resRecovered.recoverySent}`);

    if (recoveryCount === 0) {
      throw new Error("LỖI: Thông báo phục hồi chưa được gửi khi Staging khỏe trở lại!");
    }
    console.log(`   => Đạt yêu cầu AC 2: Staging phục hồi thì cảnh báo tự động chuyển trạng thái!`);

    console.log("\n================================================================================");
    console.log("🎉 MÔ PHỎNG HOÀN TẤT THÀNH CÔNG VỚI TẤT CẢ TIÊU CHÍ CHẤP NHẬN (AC):");
    console.log(`- Tổng số cảnh báo sự cố đã gửi:   ${alertCount}`);
    console.log(`- Tổng số thông báo phục hồi đã gửi: ${recoveryCount}`);
    console.log("================================================================================");
  } catch (err) {
    console.error("❌ MÔ PHỎNG THẤT BẠI:", err.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});
