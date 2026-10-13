// Kết nối PostgreSQL dùng chung toàn ứng dụng.
//
// Thứ tự ưu tiên cấu hình:
//   1. DATABASE_URL (connectionString) — Render và môi trường PaaS thường chỉ cấp biến này.
//   2. DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD — môi trường dev/staging tự quản.
//
// Biến tuỳ chọn:
//   DB_SSL=true     — bật TLS khi kết nối (Render yêu cầu).
//   DB_POOL_MAX     — số kết nối tối đa (mặc định 10).
// Bảo vệ: nếu biến trỏ production Supabase/Render mà NODE_ENV không phải production
// thì từ chối khởi động để tránh ghi nhầm. Bypass có chủ ý: ALLOW_SUPABASE_LOCAL=true.

const { Pool, types } = require("pg");

// Parse PostgreSQL DATE (OID 1082) as YYYY-MM-DD string instead of Date object to prevent timezone shifts
types.setTypeParser(1082, (val) => val);

const ssl = process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false;

// ── Guard chặn kết nối production từ môi trường non-production ──
(function guardProductionConnection() {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test" || process.env.ALLOW_SUPABASE_LOCAL === "true") return;
  const target = process.env.DATABASE_URL || process.env.DB_HOST || "";
  const prodPatterns = [/supabase\.co/i, /pooler\.supabase/i, /render\.com/i, /railway\.app/i, /neon\.tech/i];
  const isProd = prodPatterns.some((p) => p.test(target));
  if (isProd) {
    const masked = target.replace(/:[^:@]*@/, ":***@");
    throw new Error(
      "[GUARD] Từ chối kết nối production từ môi trường non-production. " +
      "DATABASE_URL/DB_HOST trỏ supabase/render: " + masked.substring(0, 80) + ". " +
      "Dùng DB local (localhost) hoặc đặt ALLOW_SUPABASE_LOCAL=true nếu cố ý. " +
      "Xem AGENTS.md mục 2."
    );
  }
})();

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl,
    }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl,
    };

const pool = new Pool({
  ...poolConfig,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Bắt lỗi idle client để tránh crash tiến trình khi kết nối bị ngắt đột ngột.
pool.on("error", (err) => {
  // Logger chưa khởi tạo ở thời điểm này nên dùng console để tránh circular dependency.
  console.error("Lỗi pg pool (idle client):", err.message);
});

module.exports = pool;
