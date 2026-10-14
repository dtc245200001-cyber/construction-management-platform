"use strict";

const request = require("supertest");
const express = require("express");

const mockQuery = jest.fn();
const mockClient = { query: jest.fn(), release: jest.fn() };

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn(() => Promise.resolve(mockClient)),
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock("../middleware/auth", () => (req, _res, next) => {
  req.user = req.session?.user || req.user || { id: 10, is_system_admin: false };
  next();
});

const acceptanceRoutes = require("../routes/acceptanceRoutes");
const { errorHandler } = require("../middleware/errorHandler");

function makeApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user };
    req.user = user;
    next();
  });
  app.use("/api/projects", acceptanceRoutes);
  app.use(errorHandler);
  return app;
}

describe("S-38 / T-98 acceptance approval RBAC", () => {
  beforeEach(() => jest.clearAllMocks());

  test("chu_dau_tu duyệt được phiếu pending_review và trạng thái thành approved", async () => {
    const app = makeApp({ id: 20, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 9,
          project_id: 1,
          batch_name: "Đợt 1",
          status: "pending_review",
          has_negative_delta: false,
          created_by: 10,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 9, project_id: 1, status: "approved", reviewed_by: 20 }],
      })
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/9/approve")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.voucher.status).toBe("approved");
    expect(res.body.voucher.reviewed_by).toBe(20);
    expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
    expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
  });

  test("vai trò khác bị chặn server-side trước khi duyệt", async () => {
    const app = makeApp({ id: 10, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

    const res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/9/approve")
      .send({});

    expect(res.status).toBe(403);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  test("không duyệt lại phiếu không còn ở pending_review", async () => {
    const app = makeApp({ id: 20, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 9, status: "approved", has_negative_delta: false, created_by: 10 }],
      })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/9/approve")
      .send({});

    expect(res.status).toBe(409);
        expect(res.body.code).toBe("INVALID_STATE");
  });
});
