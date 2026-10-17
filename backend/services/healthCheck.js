"use strict";

/**
 * Health Check Service (T-128 / S-51)
 *
 * Kiểm tra sức khoẻ ứng dụng và khả năng truy cập cơ sở dữ liệu PostgreSQL:
 * 1. Phân biệt rõ trạng thái ứng dụng (app) và cơ sở dữ liệu (database).
 * 2. Có giới hạn timeout khi truy vấn DB (mặc định 3000ms), không để treo connection pool.
 * 3. Trả trạng thái không khoẻ (unhealthy) khi DB không kết nối được hoặc timeout.
 * 4. Tuyệt đối không để lộ thông tin nhạy cảm, secrets hay chuỗi kết nối (connection string).
 */

const DEFAULT_DB_TIMEOUT_MS = 3000;

function getDbTimeoutMs(timeoutMs) {
  if (typeof timeoutMs === "number" && !isNaN(timeoutMs) && timeoutMs > 0) {
    return timeoutMs;
  }
  const envVal = Number(process.env.HEALTHCHECK_DB_TIMEOUT_MS);
  if (!isNaN(envVal) && envVal > 0) {
    return envVal;
  }
  return DEFAULT_DB_TIMEOUT_MS;
}

/**
 * Kiểm tra khả năng kết nối và truy vấn PostgreSQL với giới hạn timeout.
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {number} [timeoutMs] - Thời gian timeout tính bằng mili-giây
 * @returns {Promise<{ healthy: boolean, responseTimeMs?: number, error?: string }>}
 */
async function checkDatabase(pool, timeoutMs) {
  const effectiveTimeout = getDbTimeoutMs(timeoutMs);
  const startTime = Date.now();
  let timerId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const err = new Error("Database health check timed out");
      err.code = "HEALTH_CHECK_DB_TIMEOUT";
      reject(err);
    }, effectiveTimeout);
  });

  try {
    if (!pool || typeof pool.query !== "function") {
      throw new Error("Database pool is not available");
    }

    const queryPromise = pool.query("SELECT 1");
    // Bắt lỗi ngầm để tránh UnhandledPromiseRejection nếu timeout xảy ra trước khi DB reject
    queryPromise.catch(() => {});

    await Promise.race([
      queryPromise,
      timeoutPromise,
    ]);

    const responseTimeMs = Date.now() - startTime;
    return {
      healthy: true,
      responseTimeMs,
    };
  } catch (err) {
    const isTimeout = err && err.code === "HEALTH_CHECK_DB_TIMEOUT";
    return {
      healthy: false,
      error: isTimeout
        ? "Kiểm tra cơ sở dữ liệu quá thời gian chờ (timeout)"
        : "Không thể kết nối cơ sở dữ liệu",
    };
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
  }
}

/**
 * Tổng hợp thông tin sức khỏe của hệ thống (App + Database).
 *
 * @param {import('pg').Pool} pool - PostgreSQL connection pool
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ statusCode: number, body: object }>}
 */
async function getHealthReport(pool, options = {}) {
  const dbTimeoutMs = options.timeoutMs || DEFAULT_DB_TIMEOUT_MS;
  const dbCheck = await checkDatabase(pool, dbTimeoutMs);

  const isHealthy = dbCheck.healthy;
  const statusCode = isHealthy ? 200 : 503;

  const body = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    app: {
      status: "healthy",
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
    },
    database: {
      status: dbCheck.healthy ? "healthy" : "unhealthy",
      ...(dbCheck.healthy
        ? { responseTimeMs: dbCheck.responseTimeMs }
        : { error: dbCheck.error }),
    },
  };

  return {
    statusCode,
    body,
  };
}

module.exports = {
  checkDatabase,
  getHealthReport,
  DEFAULT_DB_TIMEOUT_MS,
};
