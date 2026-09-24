// server.js — điểm vào duy nhất khi chạy thật.
//
// Chỉ chịu trách nhiệm:
//   1. Khởi động HTTP server (listen).
//   2. Graceful shutdown khi nhận SIGTERM / SIGINT.
//
// Mọi middleware, session, route được cấu hình trong app.js.

"use strict";

const app = require("./app");
const pool = require("./config/db");
const logger = require("./utils/logger");

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Server đang chạy trên cổng ${PORT}`);
});

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
// Đảm bảo node là PID 1 (docker-entrypoint.sh dùng exec) để nhận tín hiệu này.
// Cho phép các request đang xử lý hoàn thành trong vòng SHUTDOWN_TIMEOUT_MS.

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10_000;

async function shutdown(signal) {
  logger.info(`Nhận ${signal} — bắt đầu tắt êm...`);

  // Cưỡng bức thoát sau timeout để tránh treo vô hạn
  const forceExit = setTimeout(() => {
    logger.error("Hết thời gian tắt êm — buộc thoát.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref(); // Không giữ event loop sống

  try {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    logger.info("HTTP server đã dừng nhận kết nối mới.");

    await pool.end();
    logger.info("Pool PostgreSQL đã đóng.");

    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Lỗi trong quá trình tắt êm.");
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));