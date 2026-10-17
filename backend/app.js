// app.js â€” khá»Ÿi táº¡o Express app Ä‘áº§y Ä‘á»§ (middleware, session, routes, error handler).
//
// server.js chá»‰ require('./app') rá»“i gá»i listen().
// __tests__/ import trá»±c tiáº¿p module nÃ y Ä‘á»ƒ test mÃ  khÃ´ng cáº§n listen().

"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
require("dotenv").config({
  path: require("path").resolve(__dirname, ".env"),
  override: process.env.NODE_ENV !== "test",
});

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
const dependencyRoutes = require("./routes/dependencyRoutes");
const taskRoutes = require("./routes/taskRoutes");
const teamsRoutes = require("./routes/teamsRoutes");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const logger = require("./utils/logger");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const isProd = process.env.NODE_ENV === "production";

// â”€â”€â”€ SESSION SECRET GUARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if (isProd && !process.env.SESSION_SECRET) {
  logger.fatal("SESSION_SECRET báº¯t buá»™c pháº£i Ä‘Æ°á»£c Ä‘áº·t trong mÃ´i trÆ°á»ng production. ThoÃ¡t á»©ng dá»¥ng.");
  process.exit(1);
}
if (!isProd && !process.env.SESSION_SECRET) {
  logger.warn("SESSION_SECRET chÆ°a Ä‘Æ°á»£c Ä‘áº·t â€” Ä‘ang dÃ¹ng giÃ¡ trá»‹ máº·c Ä‘á»‹nh khÃ´ng an toÃ n (chá»‰ cháº¥p nháº­n á»Ÿ mÃ´i trÆ°á»ng dev).");
}

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-key-unsafe";

// â”€â”€â”€ CORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Äá»c danh sÃ¡ch origin Ä‘Æ°á»£c phÃ©p tá»« CORS_ORIGINS (phÃ¢n tÃ¡ch báº±ng dáº¥u pháº©y).
// VÃ­ dá»¥: CORS_ORIGINS=http://localhost:5173,https://app.example.com
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

// â”€â”€â”€ RATE LIMIT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'test' ? 100 : 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "TÃ i khoáº£n bá»‹ táº¡m khÃ³a 15 phÃºt do nháº­p sai quÃ¡ nhiá»u láº§n. Vui lÃ²ng thá»­ láº¡i sau." },
});

const registerLimiter = rateLimit({
  windowMs: Number(process.env.REGISTER_RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000,
  max: Number(process.env.REGISTER_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "QuÃ¡ nhiá»u láº§n thá»­ Ä‘Äƒng kÃ½. Vui lÃ²ng thá»­ láº¡i sau." },
});

const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 150, // Tối đa 150 request / 15 phút mỗi IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Quá nhiều yêu cầu, vui lòng thử lại sau." },
});

const newsletterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 5, // Tối đa 5 lần đăng ký email / 15 phút mỗi IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Bạn đã đăng ký quá nhiều lần. Vui lòng thử lại sau." },
});

const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10, // Tối đa 10 lần kiểm tra/chấp nhận token / 15 phút mỗi IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau." },
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  // Giống loginLimiter: ở môi trường test cho ngân sách cao để suite integration
  // (nhiều request reset-password liên tiếp) không bị 429; production giữ nguyên 5.
  max:
    Number(process.env.PASSWORD_RESET_RATE_LIMIT_MAX) ||
    (process.env.NODE_ENV === "test" ? 100 : 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Bạn đã yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau." },
});

// ─── APP ──────────────────────────────────────────────────────────────────────

const app = express();

// Tin tÆ°á»Ÿng reverse proxy (Nginx, Render) Ä‘á»ƒ Ä‘á»c Ä‘Ãºng IP tháº­t cho rate-limit vÃ  cookie secure.
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


// HTTP request logging (pino-http)
const pinoHttp = require("pino-http")({ logger });
app.use(pinoHttp);

// ─── HEALTH CHECK & PROBES (T-128 / S-51) ──────────────────────────────────
// Đặt trước session & body parser để đảm bảo:
// 1. Không bị nghẽn bởi PgSession khi DB gặp sự cố
// 2. Tối ưu hiệu năng cho orchestrator và monitor pings
const { getHealthReport, checkDatabase } = require("./services/healthCheck");

const healthHandler = async (_req, res) => {
  const { statusCode, body } = await getHealthReport(pool);
  if (statusCode >= 500) {
    logger.warn({ health: body }, "Health check phát hiện hệ thống không khỏe");
  }
  return res.status(statusCode).json(body);
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// Pure liveness probe — dành cho orchestrator chỉ cần kiểm tra tiến trình sống
app.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// Readiness probe — kiểm tra DB (tương thích deploy.sh Blue/Green deployment)
app.get("/ready", async (_req, res) => {
  const dbCheck = await checkDatabase(pool);
  if (dbCheck.healthy) {
    return res.status(200).json({ status: "ready", db: "ok" });
  }
  logger.error({ error: dbCheck.error }, "Readiness check: lỗi kết nối DB");
  return res.status(503).json({ status: "unavailable", db: "error" });
});

// Body parser
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Session
const sameSite = process.env.COOKIE_SAMESITE || (isProd ? "none" : "lax");
const cookieSecure = process.env.COOKIE_SECURE === "true" || isProd;
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
      pruneSessionInterval: process.env.NODE_ENV === 'test' ? false : 60, // giÃ¢y â€” dá»n session háº¿t háº¡n má»—i phÃºt
    }),
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      sameSite,
      maxAge: 12 * 60 * 60 * 1000, // 12 giá»
    },
  })
);

// ─── ROUTES ──────────────────────────────────────────────────────────

// Swagger docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/forgot-password", passwordResetLimiter);
app.use("/api/auth/reset-password", passwordResetLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/projects", dependencyRoutes);
app.use("/api/projects", taskRoutes);
app.use("/api/projects", teamsRoutes);
const taskLogRoutes = require("./routes/taskLogRoutes");
app.use("/api/projects", taskLogRoutes);
const uploadSessionRoutes = require("./routes/uploadSessionRoutes");
app.use("/api/projects", uploadSessionRoutes);
const adminRoutes = require("./routes/adminRoutes");
const { router: publicRoutes, setNewsletterLimiter, setInvitationLimiter } = require("./routes/publicRoutes");

// Truyền limiter vào router
setNewsletterLimiter(newsletterLimiter);
setInvitationLimiter(invitationLimiter);

app.use("/api/admin", adminRoutes);
app.use("/api/public", publicApiLimiter, publicRoutes);
const milestoneRoutes = require("./routes/milestoneRoutes");
app.use("/api/projects", milestoneRoutes);

const diaryRoutes = require("./routes/diaryRoutes");
app.use("/api/projects", diaryRoutes);
const diaryDaysRoutes = require("./routes/diaryDaysRoutes");
app.use("/api/projects", diaryDaysRoutes);
const baselineRoutes = require("./routes/baselineRoutes");
app.use("/api/projects", baselineRoutes);
const contractQuantityRoutes = require("./routes/contractQuantityRoutes");
app.use("/api/projects", contractQuantityRoutes);
const acceptanceRoutes = require("./routes/acceptanceRoutes");
app.use("/api/projects", acceptanceRoutes);
const photoMetadataRoutes = require("./routes/photoMetadataRoutes");
app.use("/api/projects", photoMetadataRoutes);
const siteGeofenceRoutes = require("./routes/siteGeofenceRoutes");
app.use("/api/projects", siteGeofenceRoutes);
const paymentRequestRoutes = require("./routes/paymentRequestRoutes");
app.use("/api/projects", paymentRequestRoutes);
const actualCostRoutes = require("./routes/actualCostRoutes");
app.use("/api/projects", actualCostRoutes);
const progressRoutes = require("./routes/progressRoutes");
app.use("/api/projects", progressRoutes);

// â”€â”€â”€ ERROR HANDLERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;

