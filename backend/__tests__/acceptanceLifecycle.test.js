"use strict";

const request = require("supertest");
const express = require("express");

let currentRole = "ky_su_giam_sat";
let currentUser = { id: 10, is_system_admin: false };
let voucherState;

const mockQuery = jest.fn(async (sql) => {
  if (String(sql).includes("FROM project_members")) {
    return { rows: [{ role: currentRole }] };
  }
  throw new Error(`Unexpected pool.query in lifecycle test: ${String(sql)}`);
});

const mockClient = {
  release: jest.fn(),
  query: jest.fn(async (sql, params = []) => {
    const text = String(sql);
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return {};

    if (text.includes("FROM acceptance_vouchers") && text.includes("FOR UPDATE")) {
      return { rows: [{ ...voucherState }] };
    }

    if (text.includes("COUNT(*)::int AS count FROM acceptance_voucher_items")) {
      return { rows: [{ count: 1 }] };
    }

    if (text.includes("SET status = 'pending_review'")) {
      voucherState = { ...voucherState, status: "pending_review" };
      return { rows: [{ ...voucherState }] };
    }

    if (text.includes("SET status = 'returned'")) {
      voucherState = {
        ...voucherState,
        status: "returned",
        reviewed_by: params[0],
        review_note: params[1],
        reviewed_at: "2026-10-14T08:00:00.000Z",
      };
      return { rows: [{ ...voucherState }] };
    }

    if (text.includes("SET status = 'approved'")) {
      voucherState = {
        ...voucherState,
        status: "approved",
        reviewed_by: params[0],
        reviewed_at: "2026-10-14T09:00:00.000Z",
        review_note: null,
      };
      return { rows: [{ ...voucherState }] };
    }

    throw new Error(`Unexpected client.query in lifecycle test: ${text}`);
  }),
};

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn(() => Promise.resolve(mockClient)),
}));

jest.mock("../utils/auditLogger", () => ({
  logAudit: jest.fn(() => Promise.resolve()),
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock("../middleware/auth", () => (req, _res, next) => {
  req.user = currentUser;
  next();
});

const acceptanceRoutes = require("../routes/acceptanceRoutes");
const { errorHandler } = require("../middleware/errorHandler");
const { computeVoucherItems } = require("../utils/acceptanceHelpers");

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user: currentUser };
    req.user = currentUser;
    next();
  });
  app.use("/api/projects", acceptanceRoutes);
  app.use(errorHandler);
  return app;
}

describe("S-38 / T-101 acceptance voucher lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentRole = "ky_su_giam_sat";
    currentUser = { id: 10, is_system_admin: false };
    voucherState = {
      id: 101,
      project_id: 1,
      batch_name: "Đợt lifecycle",
      status: "draft",
      has_negative_delta: false,
      created_by: 10,
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
    };
  });

  test("draft -> pending_review -> returned -> pending_review -> approved; approved không sửa được", async () => {
    const app = makeApp();

    // Người lập gửi phiếu nháp.
    let res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/101/submit")
      .send({});
    expect(res.status).toBe(200);
    expect(voucherState.status).toBe("pending_review");

    // Ban quản lý trả lại và bắt buộc lưu lý do.
    currentRole = "ban_quan_ly";
    currentUser = { id: 20, is_system_admin: false };
    res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/101/return")
      .send({ reason: "Cần sửa số liệu khối lượng" });
    expect(res.status).toBe(200);
    expect(voucherState.status).toBe("returned");
    expect(voucherState.review_note).toBe("Cần sửa số liệu khối lượng");

    // Người lập gửi lại sau khi chỉnh sửa.
    currentRole = "ky_su_giam_sat";
    currentUser = { id: 10, is_system_admin: false };
    res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/101/submit")
      .send({});
    expect(res.status).toBe(200);
    expect(voucherState.status).toBe("pending_review");

    // Ban quản lý duyệt.
    currentRole = "ban_quan_ly";
    currentUser = { id: 20, is_system_admin: false };
    res = await request(app)
      .post("/api/projects/1/acceptance-vouchers/101/approve")
      .send({});
    expect(res.status).toBe(200);
    expect(voucherState.status).toBe("approved");

    // Sau duyệt: dù là người lập, API sửa phải khóa.
    currentRole = "ky_su_giam_sat";
    currentUser = { id: 10, is_system_admin: false };
    res = await request(app)
      .put("/api/projects/1/acceptance-vouchers/101")
      .send({
        batch_name: "Cố sửa sau duyệt",
        items: [{ work_item_id: 11, cumulative_quantity: "99.000" }],
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ACCEPTANCE_VOUCHER_LOCKED");
    expect(voucherState.status).toBe("approved");
  });

  test("luỹ kế trước chỉ được đọc từ phiếu approved", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ work_item_id: 11, prev_approved_cumulative: "40.000" }],
    });

    const items = await computeVoucherItems(
      { query },
      [{ work_item_id: 11, cumulative_quantity: "55.000", unit: "m3" }]
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("av.status = 'approved'");
    expect(items[0].prev_approved_cumulative).toBe("40.000");
    expect(items[0].delta_quantity).toBe("15.000");
  });
});
