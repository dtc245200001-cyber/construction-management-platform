// __tests__/app.test.js — Test tích hợp cho app thật (app.js).
//
// Mock pool để không cần PostgreSQL thật khi chạy test unit.
// Các test kiểm tra:
//   - /health → 200 (liveness)
//   - /ready → 503 khi DB lỗi
//   - Route không tồn tại → 404 JSON
//   - /api/auth/me → 401 khi chưa đăng nhập
//   - Response có security headers (helmet)

// ─── Mocks (phải khai báo TRƯỚC require) ─────────────────────────────────────

const mockQuery = jest.fn();

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  on: jest.fn(),
}));

// Mock connect-pg-simple với EventEmitter interface đầy đủ
jest.mock("connect-pg-simple", () => {
  return () => {
    const { EventEmitter } = require("events");
    return class MockPgSession extends EventEmitter {
      constructor() { super(); }
      get(sid, cb) { cb(null, null); }
      set(sid, session, cb) { cb(null); }
      destroy(sid, cb) { cb(null); }
      touch(sid, session, cb) { cb(null); }
    };
  };
});

// Mock pino-http để tránh log noise khi test
jest.mock("pino-http", () => () => (_req, _res, next) => next());

// ─── Import sau khi mock đã được khai báo ────────────────────────────────────
const request = require("supertest");
const app = require("../app");

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /health", () => {
  test("trả 200 với status ok (không đụng DB)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
    // Liveness probe không được gọi DB
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("GET /ready", () => {
  test("trả 503 khi DB lỗi", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB không kết nối được"));
    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("unavailable");
  });

  test("trả 200 khi DB OK", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const res = await request(app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});

describe("Route không tồn tại", () => {
  test("trả 404 JSON với message tiếng Việt", async () => {
    const res = await request(app).get("/api/khong-ton-tai");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("message");
  });
});

describe("GET /api/auth/me", () => {
  test("trả 401 khi chưa đăng nhập", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("Security headers (helmet)", () => {
  test("response có X-Content-Type-Options: nosniff", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
