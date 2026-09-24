// Kết nối PostgreSQL dùng chung toàn ứng dụng.
//
// Thứ tự ưu tiên cấu hình:
//   1. DATABASE_URL (connectionString) — Render và môi trường PaaS thường chỉ cấp biến này.
//   2. DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD — môi trường dev/staging tự quản.
//
// Biến tuỳ chọn:
//   DB_SSL=true     — bật TLS khi kết nối (Render yêu cầu).
//   DB_POOL_MAX     — số kết nối tối đa (mặc định 10).

const { Pool } = require("pg");

const ssl = process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false;

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