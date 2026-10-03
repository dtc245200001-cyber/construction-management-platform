// utils/logger.js — Logger tập trung dùng pino.
//
// - Production: JSON thuần (dễ ingest vào log aggregator).
// - Development: pino-pretty để dễ đọc.
// - Redact: tự động che các trường nhạy cảm trước khi ghi log.

"use strict";

const pino = require("pino");

const isProd = process.env.NODE_ENV === "production";

// Danh sách path redact theo cú pháp pino (dấu * = bất kỳ key cha nào).
// Các trường này sẽ bị thay bằng chuỗi "[Redacted]" trong output log.
const redact = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.body.password",
    "req.body.confirmPassword",
    "*.password",
    "*.password_hash",
    "*.DATABASE_URL",
    "*.connectionString",
  ],
  censor: "[Redacted]",
};

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact,
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

module.exports = logger;
