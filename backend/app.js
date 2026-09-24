// app.js — khởi tạo Express app đầy đủ (middleware, session, routes, error handler).
//
// server.js chỉ require('./app') rồi gọi listen().
// __tests__/ import trực tiếp module này để test mà không cần listen().

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const PgSession = require("connect-pg-simple")(session);

const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const projectRoutes = require("./routes/projectRoutes");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const logger = require("./utils/logger");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const isProd = process.env.NODE_ENV === "production";

// ─── SESSION SECRET GUARD ─────────────────────────────────────────────────────
if (isProd && !process.env.SESSION_SECRET) {
  logger.fatal("SESSION_SECRET bắt buộc phải được đặt trong môi trường production. Thoát ứng dụng.");
  process.exit(1);
}
if (!isProd && !process.env.SESSION_SECRET) {
  logger.warn("SESSION_SECRET chưa được đặt — đang dùng giá trị mặc định không an toàn (chỉ chấp nhận ở môi trường dev).");
}

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-key-unsafe";

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Đọc danh sách origin được phép từ CORS_ORIGINS (phân tách bằng dấu phẩy).
// Ví dụ: CORS_ORIGINS=http://localhost:5173,https://app.example.com
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

// ─── RATE LIMIT ───────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau." },
});

const registerLimiter = rateLimit({
  windowMs: Number(process.env.REGISTER_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000,
  max: Number(process.env.REGISTER_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Quá nhiều lần thử đăng ký. Vui lòng thử lại sau." },
});

// ─── APP ──────────────────────────────────────────────────────────────────────
const app = express();

// Tin tưởng reverse proxy (Nginx, Render) để đọc đúng IP thật cho rate-limit và cookie secure.
if (isProd) {
  app.set("trust proxy", 1);
}

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

// Body parser
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// HTTP request logging (pino-http)
const pinoHttp = require("pino-http")({ logger });
app.use(pinoHttp);

// Session
const sameSite = process.env.COOKIE_SAMESITE || "lax";
app.use(
  session({
    name: "cmp.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: new PgSession({
      pool,
      tableName: "session",
      pruneSessionInterval: 60, // giây — dọn session hết hạn mỗi phút
    }),
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite,
      maxAge: 12 * 60 * 60 * 1000, // 12 giờ
    },
  })
);

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Liveness probe — không đụng DB, trả ngay
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
  });
});

// Readiness probe — kiểm tra DB
app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready", db: "ok" });
  } catch (err) {
    logger.error({ err }, "Readiness check: lỗi kết nối DB");
    res.status(503).json({ status: "unavailable", db: "error" });
  }
});

// Swagger docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/projects", projectRoutes);

// ─── ERROR HANDLERS ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
