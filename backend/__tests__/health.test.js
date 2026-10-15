"use strict";

const request = require("supertest");
const app = require("../app");
const pool = require("../config/db");
const { checkDatabase, getHealthReport } = require("../services/healthCheck");

describe("Health Check Service & Endpoints (T-128 / S-51)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Unit: checkDatabase()", () => {
    it("Trả về healthy = true và đo lường responseTimeMs khi query thành công", async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      };

      const result = await checkDatabase(mockPool, 1000);
      expect(result.healthy).toBe(true);
      expect(typeof result.responseTimeMs).toBe("number");
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(mockPool.query).toHaveBeenCalledWith("SELECT 1");
    });

    it("Trả về healthy = false khi DB ngắt kết nối hoặc ném lỗi", async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error("Connection refused: 5432")),
      };

      const result = await checkDatabase(mockPool, 1000);
      expect(result.healthy).toBe(false);
      expect(result.error).toBe("Không thể kết nối cơ sở dữ liệu");
      // Đảm bảo không để lộ chi tiết raw error
      expect(result.error).not.toContain("5432");
    });

    it("Trả về healthy = false khi query DB bị treo vượt quá giới hạn timeout", async () => {
      const mockPool = {
        query: jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200))),
      };

      // Giới hạn timeout 50ms để kích hoạt timeout
      const result = await checkDatabase(mockPool, 50);
      expect(result.healthy).toBe(false);
      expect(result.error).toContain("quá thời gian chờ (timeout)");
    });
  });

  describe("Unit: getHealthReport()", () => {
    it("Tổng hợp báo cáo trạng thái hệ thống: phân biệt rõ app và DB khi DB khoẻ", async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      };

      const report = await getHealthReport(mockPool);
      expect(report.statusCode).toBe(200);
      expect(report.body.status).toBe("healthy");
      expect(report.body.app).toBeDefined();
      expect(report.body.app.status).toBe("healthy");
      expect(typeof report.body.app.uptime).toBe("number");
      expect(report.body.database).toBeDefined();
      expect(report.body.database.status).toBe("healthy");
      expect(typeof report.body.database.responseTimeMs).toBe("number");
    });

    it("Trả trạng thái không khoẻ (503) khi DB không kết nối được", async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error("DB host unreachable")),
      };

      const report = await getHealthReport(mockPool);
      expect(report.statusCode).toBe(503);
      expect(report.body.status).toBe("unhealthy");
      expect(report.body.app.status).toBe("healthy");
      expect(report.body.database.status).toBe("unhealthy");
      expect(report.body.database.error).toBe("Không thể kết nối cơ sở dữ liệu");
    });

    it("NFR: Tuyệt đối không để lộ mật khẩu, connection string hay secrets", async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error("postgres://user:super_secret_pw@db.internal:5432/cmp")),
      };

      const report = await getHealthReport(mockPool);
      const jsonString = JSON.stringify(report.body);

      expect(jsonString).not.toContain("super_secret_pw");
      expect(jsonString).not.toContain("db.internal");
      expect(jsonString).not.toContain("postgres://");
      expect(jsonString).not.toContain("password");
    });
  });

  describe("Integration: Endpoints /health, /api/health, /ready, /health/live", () => {
    it("GET /health trả về 200 và cấu trúc phân biệt app + db khi DB ok", async () => {
      jest.spyOn(pool, "query").mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.app.status).toBe("healthy");
      expect(res.body.database.status).toBe("healthy");
      expect(res.body.database.responseTimeMs).toBeDefined();
    });

    it("GET /api/health hoạt động đồng nhất với /health", async () => {
      jest.spyOn(pool, "query").mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.database.status).toBe("healthy");
    });

    it("GET /health trả về 503 khi DB bị ngắt kết nối", async () => {
      jest.spyOn(pool, "query").mockRejectedValueOnce(new Error("Simulated DB connection failure"));

      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
      expect(res.body.app.status).toBe("healthy");
      expect(res.body.database.status).toBe("unhealthy");
      expect(res.body.database.error).toBe("Không thể kết nối cơ sở dữ liệu");
    });

    it("GET /health/live chỉ kiểm tra tiến trình app (luôn 200 ngay cả khi DB lỗi)", async () => {
      jest.spyOn(pool, "query").mockRejectedValueOnce(new Error("DB down"));

      const res = await request(app).get("/health/live");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.uptime).toBeDefined();
    });

    it("GET /ready kiểm tra DB và giữ đúng format sẵn sàng cho deploy.sh", async () => {
      jest.spyOn(pool, "query").mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
      const resOk = await request(app).get("/ready");
      expect(resOk.status).toBe(200);
      expect(resOk.body).toEqual({ status: "ready", db: "ok" });

      jest.spyOn(pool, "query").mockRejectedValueOnce(new Error("DB down"));
      const resFail = await request(app).get("/ready");
      expect(resFail.status).toBe(503);
      expect(resFail.body).toEqual({ status: "unavailable", db: "error" });
    });
  });
});
