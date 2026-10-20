"use strict";

const request = require("supertest");
const express = require("express");

let mockCurrentProjectRole = "chu_dau_tu";
const mockApprove = jest.fn();
const mockReturn = jest.fn();
const mockLogAudit = jest.fn();

jest.mock("../middleware/auth", () => (req, _res, next) => {
  req.user = { id: 20, is_system_admin: false };
  next();
});

jest.mock("../middleware/projectAccess", () => {
  const express = require("express");
  return {
    checkProjectAccess: (req, _res, next) => {
      req.projectRole = mockCurrentProjectRole;
      next();
    },
    requirePermission: (permission) => (req, res, next) => {
      const { can } = require("../utils/permissions");
      if (!can(req.projectRole, permission)) {
        return res.status(403).json({ message: "Không có quyền truy cập" });
      }
      next();
    },
    createProjectRouter: () => express.Router({ mergeParams: true }),
  };
});

jest.mock("../services/paymentRequestService", () => ({
  createPaymentRequest: jest.fn(),
  getPaymentRequestsByProject: jest.fn(),
  getPaymentRequestDetail: jest.fn(),
  approvePaymentRequest: (...args) => mockApprove(...args),
  returnPaymentRequest: (...args) => mockReturn(...args),
}));

jest.mock("../utils/auditLogger", () => ({
  logAudit: (...args) => mockLogAudit(...args),
}));

const routes = require("../routes/paymentRequestRoutes");
const { errorHandler } = require("../middleware/errorHandler");

describe("S-44 / T-114 payment request review routes", () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentProjectRole = "chu_dau_tu";
    app = express();
    app.use(express.json());
    app.use("/api/projects", routes);
    app.use(errorHandler);
  });

  test("chủ đầu tư duyệt được đề nghị", async () => {
    mockApprove.mockResolvedValue({
      id: 9,
      project_id: 1,
      status: "APPROVED",
    });

    const res = await request(app)
      .post("/api/projects/1/payment-requests/9/approve")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.payment_request.status).toBe("APPROVED");
    expect(mockApprove).toHaveBeenCalledWith({
      projectId: "1",
      paymentRequestId: "9",
      userId: 20,
    });
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
  });

  test("ban quản lý không được duyệt, backend trả 403", async () => {
    mockCurrentProjectRole = "ban_quan_ly";

    const res = await request(app)
      .post("/api/projects/1/payment-requests/9/approve")
      .send({});

    expect(res.status).toBe(403);
    expect(mockApprove).not.toHaveBeenCalled();
  });

  test("trả lại truyền reason xuống service", async () => {
    mockReturn.mockResolvedValue({
      id: 9,
      project_id: 1,
      status: "RETURNED",
      return_reason: "Thiếu biên bản",
    });

    const res = await request(app)
      .post("/api/projects/1/payment-requests/9/return")
      .send({ reason: "Thiếu biên bản" });

    expect(res.status).toBe(200);
    expect(mockReturn).toHaveBeenCalledWith({
      projectId: "1",
      paymentRequestId: "9",
      userId: 20,
      reason: "Thiếu biên bản",
    });
  });
});
