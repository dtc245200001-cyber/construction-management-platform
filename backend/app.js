// app.js â€” khá»Ÿi táº¡o Express app Ä‘áº§y Ä‘á»§ (middleware, session, routes, error handler).
//
// server.js chá»‰ require('./app') rá»“i gá»i listen().
// __tests__/ import trá»±c tiáº¿p module nÃ y Ä‘á»ƒ test mÃ  khÃ´ng cáº§n listen().

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
const dependencyRoutes = require("./routes/dependencyRoutes");
const taskRoutes = require("./routes/taskRoutes");
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
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

// â”€â”€â”€ RATE LIMIT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'test' ? 100 : 5),
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

// â”€â”€â”€ APP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// Body parser
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// HTTP request logging (pino-http)
const pinoHttp = require("pino-http")({ logger });
app.use(pinoHttp);

// Session
const sameSite = process.env.COOKIE_SAMESITE || (isProd ? "none" : "lax");
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
      pruneSessionInterval: 60, // giÃ¢y â€” dá»n session háº¿t háº¡n má»—i phÃºt
    }),
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite,
      maxAge: 12 * 60 * 60 * 1000, // 12 giá»
    },
  })
);

// â”€â”€â”€ ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Liveness probe â€” khÃ´ng Ä‘á»¥ng DB, tráº£ ngay
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
  });
});

// Readiness probe â€” kiá»ƒm tra DB
app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready", db: "ok" });
  } catch (err) {
    logger.error({ err }, "Readiness check: lá»—i káº¿t ná»‘i DB");
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
app.use("/api/projects", dependencyRoutes);
app.use("/api/projects", taskRoutes);

const adminRoutes = require("./routes/adminRoutes");
app.use("/api/admin", adminRoutes);

// â”€â”€â”€ ERROR HANDLERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
