"use strict";

const request = require("supertest");
const express = require("express");

const mockQuery = jest.fn();
const mockClient = { query: jest.fn(), release: jest.fn() };
const mockLogAudit = jest.fn(() => Promise.resolve());
const mockComputeVoucherItems = jest.fn();

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn(() => Promise.resolve(mockClient)),
}));

jest.mock("../utils/auditLogger", () => ({
  logAudit: (...args) => mockLogAudit(...args),
}));

jest.mock("../utils/acceptanceHelpers", () => ({
  computeVoucherItems: (...args) => mockComputeVoucherItems(...args),
  detectMimeFromBuffer: jest.fn(() => "image/jpeg"),
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

describe("S-38 / T-99 return, edit and resubmit acceptance voucher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockComputeVoucherItems.mockResolvedValue([
      {
        work_item_id: 11,
        cumulative_quantity: "12.000",
        prev_approved_cumulative: "10.000",
        delta_quantity: "2.000",
        unit: "m3",
      },
    ]);
  });

  test("trả lại phiếu bắt buộc lý do", async () => {
    const app = makeApp({ id: 20, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });

    const res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/9/return")
      .send({ reason: "   " });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RETURN_REASON_REQUIRED");
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  test("chu_dau_tu trả lại pending_review, lưu lý do và dấu người thao tác", async () => {
    const app = makeApp({ id: 20, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 9, status: "pending_review", created_by: 10 }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 9,
          status: "returned",
          reviewed_by: 20,
          review_note: "Thiếu ảnh hiện trường",
        }],
      })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/9/return")
      .send({ reason: "Thiếu ảnh hiện trường" });

    expect(res.status).toBe(200);
    expect(res.body.voucher.status).toBe("returned");
    expect(res.body.voucher.review_note).toBe("Thiếu ảnh hiện trường");
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 20,
      action: "RETURN_ACCEPTANCE_VOUCHER",
      entityId: 9,
      projectId: 1,
      details: expect.objectContaining({ reason: "Thiếu ảnh hiện trường" }),
    }));
  });

  test("ky_su_giam_sat không được trả lại phiếu", async () => {
    const app = makeApp({ id: 20, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

    const res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/9/return")
      .send({ reason: "Thiếu ảnh hiện trường" });

    expect(res.status).toBe(403);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  test("người lập sửa được phiếu returned và nội dung được tính lại", async () => {
    const app = makeApp({ id: 10, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 9,
          project_id: 1,
          batch_name: "Đợt cũ",
          status: "returned",
          has_negative_delta: false,
          created_by: 10,
          review_note: "Sửa lại khối lượng",
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 11, unit: "m3", is_leaf: true }] })
      .mockResolvedValueOnce({}) // UPDATE voucher
      .mockResolvedValueOnce({}) // DELETE items
      .mockResolvedValueOnce({}) // INSERT item
      .mockResolvedValueOnce({
        rows: [{ id: 9, batch_name: "Đợt đã sửa", status: "returned", created_by: 10 }],
      })
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .put("/api/projects/1/acceptance-vouchers/9")
      .send({
        batch_name: "Đợt đã sửa",
        items: [{ work_item_id: 11, cumulative_quantity: "12.000" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.voucher.batch_name).toBe("Đợt đã sửa");
    expect(res.body.items[0].delta_quantity).toBe("2.000");
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "UPDATE_ACCEPTANCE_VOUCHER",
      userId: 10,
      entityId: 9,
    }));
  });

  test("không cho người khác sửa phiếu của người lập", async () => {
    const app = makeApp({ id: 11, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 9, status: "returned", created_by: 10 }] })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .put("/api/projects/1/acceptance-vouchers/9")
      .send({
        batch_name: "Không được sửa",
        items: [{ work_item_id: 11, cumulative_quantity: "12.000" }],
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ONLY_CREATOR_CAN_EDIT");
  });

  test("người lập gửi lại phiếu returned -> pending_review", async () => {
    const app = makeApp({ id: 10, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{ id: 9, status: "returned", created_by: 10, has_negative_delta: false }],
      })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 9, status: "pending_review", created_by: 10 }] })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/9/submit")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.voucher.status).toBe("pending_review");
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "RESUBMIT_ACCEPTANCE_VOUCHER",
      userId: 10,
      entityId: 9,
    }));
  });

  test("approved bị khóa không cho sửa", async () => {
    const app = makeApp({ id: 10, is_system_admin: false });
    mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 9, status: "approved", created_by: 10 }] })
      .mockResolvedValueOnce({});

    const res = await request(app)
      .put("/api/projects/1/acceptance-vouchers/9")
      .send({
        batch_name: "Không được sửa",
        items: [{ work_item_id: 11, cumulative_quantity: "12.000" }],
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ACCEPTANCE_VOUCHER_LOCKED");
  });
});
