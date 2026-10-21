"use strict";

// S-39: Kiểm thử vòng đời phiếu nghiệm thu và Audit Portal
// (submit → approve / return → re-submit), audit trail append-only,
// và endpoint /audit-logs của Audit Portal (CĐT/BQL only).

const request = require("supertest");
const express = require("express");

const mockQuery = jest.fn();
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: jest.fn().mockImplementation(() => Promise.resolve(mockClient)),
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockLogAudit = jest.fn().mockResolvedValue();
jest.mock("../utils/auditLogger", () => ({
  logAudit: (...args) => mockLogAudit(...args),
  createAuditMiddleware: jest.fn(() => (req, res, next) => next()),
}));

jest.mock("../middleware/auth", () => (req, _res, next) => {
  req.user = req.session?.user || req.user || { id: 10, is_system_admin: false };
  next();
});

const acceptanceRoutes = require("../routes/acceptanceRoutes");
const { errorHandler } = require("../middleware/errorHandler");

describe("S-39: Acceptance Voucher Lifecycle & Audit Portal", () => {
  let app;
  let currentUser = { id: 10, is_system_admin: false };

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = { id: 10, is_system_admin: false };

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.session = { user: currentUser };
      req.user = currentUser;
      next();
    });
    app.use("/api/projects", acceptanceRoutes);
    app.use(errorHandler);
  });

  // ── Helpers ────────────────────────────────────────────────────────────
  const voucherRow = (overrides = {}) => ({
    id: 100,
    project_id: 1,
    batch_name: "Đợt 1",
    status: "draft",
    has_negative_delta: false,
    created_by: 10,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  // ═════════════════════════════════════════════════════════════════════
  // SUBMIT
  // ═════════════════════════════════════════════════════════════════════
  describe("POST /:voucherId/submit", () => {
    test("cannot submit another creator's voucher", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
      mockClient.query.mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [voucherRow({ created_by: 99 })] })
        .mockResolvedValueOnce({});
      const res = await request(app).post("/api/projects/1/acceptance-vouchers/100/submit").send({});
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ONLY_CREATOR_CAN_SUBMIT");
      expect(mockLogAudit).not.toHaveBeenCalled();
    });

    test("cannot submit a voucher without items", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
      mockClient.query.mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [voucherRow()] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({});
      const res = await request(app).post("/api/projects/1/acceptance-vouchers/100/submit").send({});
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("EMPTY_ACCEPTANCE_VOUCHER");
      expect(mockLogAudit).not.toHaveBeenCalled();
    });
    test("KSGS gửi phiếu draft → pending_review, ghi audit với project_id + old/new", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      const voucher = voucherRow({ status: "draft" });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [voucher] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [] }) // No photos require re-inspection.
        .mockResolvedValueOnce({
          rows: [{ ...voucher, status: "pending_review" }],
        }) // UPDATE RETURNING
        .mockResolvedValueOnce({}); // COMMIT

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/submit")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.voucher.status).toBe("pending_review");

      // Kiểm tra audit
      expect(mockLogAudit).toHaveBeenCalledTimes(1);
      const auditCall = mockLogAudit.mock.calls[0][0];
      expect(auditCall.action).toBe("SUBMIT_ACCEPTANCE_VOUCHER");
      expect(auditCall.entity).toBe("acceptance_vouchers");
      expect(auditCall.entityId).toBe(100);
      expect(auditCall.projectId).toBe(1);
      expect(auditCall.details.old_value).toEqual({ status: "draft" });
      expect(auditCall.details.new_value).toEqual({ status: "pending_review" });
    });

    test("Trả về 409 nếu phiếu đã pending_review", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
      const voucher = voucherRow({ status: "pending_review" });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [voucher] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({}); // ROLLBACK

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/submit")
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE");
      expect(mockLogAudit).not.toHaveBeenCalled();
    });

    test("Trả về 422 nếu phiếu có has_negative_delta", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
      const voucher = voucherRow({ has_negative_delta: true });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [voucher] })
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/submit")
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("HAS_NEGATIVE_DELTA");
    });

    test("Cho phép submit lại phiếu đã returned", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
      const voucher = voucherRow({ status: "returned" });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [voucher] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ ...voucher, status: "pending_review" }],
        })
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/submit")
        .send({});

      expect(res.status).toBe(200);
    });

    test("403 với đội trưởng (không có acceptance.create_dossier)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "doi_truong" }] });
      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/submit")
        .send({});

      expect(res.status).toBe(403);
      expect(mockLogAudit).not.toHaveBeenCalled();
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // APPROVE
  // ═════════════════════════════════════════════════════════════════════
  describe("POST /:voucherId/approve", () => {
    test("ban_quan_ly approves pending_review and updates reviewed fields", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ban_quan_ly" }] });
      const voucher = voucherRow({ status: "pending_review" });
      const approved = {
        ...voucher,
        status: "approved",
        reviewed_by: 10,
        reviewed_at: new Date(),
        review_note: null,
      };

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [voucher] })
        .mockResolvedValueOnce({ rows: [approved] })
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/approve")
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.voucher.status).toBe("approved");
      expect(res.body.voucher.reviewed_by).toBe(10);

      expect(mockLogAudit).toHaveBeenCalledTimes(1);
      const call = mockLogAudit.mock.calls[0][0];
      expect(call.action).toBe("APPROVE_ACCEPTANCE_VOUCHER");
      expect(call.details.old_value).toEqual({ status: "pending_review" });
      expect(call.details.new_value.status).toBe("approved");
    });

    test("chu_dau_tu gets 403 on approve", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/approve")
        .send({});
      expect(res.status).toBe(403);
    });

    test("approve returns 409 when voucher is not pending_review", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ban_quan_ly" }] });
      const voucher = voucherRow({ status: "draft" });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [voucher] })
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/approve")
        .send({});
      expect(res.status).toBe(409);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // RETURN
  // ═════════════════════════════════════════════════════════════════════
  describe("POST /:voucherId/return", () => {
    test("BQL trả lại phiếu với lý do → returned", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ban_quan_ly" }] });
      const voucher = voucherRow({ status: "pending_review" });
      const returned = {
        ...voucher,
        status: "returned",
        reviewed_by: 10,
        review_note: "Thiếu ảnh bằng chứng",
      };
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [voucher] })
        .mockResolvedValueOnce({ rows: [returned] })
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/return")
        .send({ reason: "Thiếu ảnh bằng chứng" });

      expect(res.status).toBe(200);
      expect(res.body.voucher.status).toBe("returned");
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "RETURN_ACCEPTANCE_VOUCHER",
          details: expect.objectContaining({
            reason: "Thiếu ảnh bằng chứng",
          }),
        })
      );
    });

    test("CĐT không có quyền trả lại phiếu", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/return")
        .send({ reason: "Sai khối lượng" });
      expect(res.status).toBe(403);
    });

    test("400 khi thiếu lý do", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ban_quan_ly" }] });
      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/return")
        .send({ reason: "   " });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/lý do/i);
    });

    test("403 với KSGS (không có quyền trả lại)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/100/return")
        .send({ reason: "Test" });
      expect(res.status).toBe(403);
    });

    test("404 khi phiếu không tồn tại trong dự án", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ban_quan_ly" }] });
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] }) // voucher không tìm thấy
        .mockResolvedValueOnce({});

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers/999/return")
        .send({ reason: "Test" });
      expect(res.status).toBe(404);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // HISTORY
  // ═════════════════════════════════════════════════════════════════════
  describe("GET /:voucherId/history", () => {
    test("Trả danh sách audit của phiếu, sắp xếp DESC", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] }); // membership
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 100 }] }); // voucher check
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 5,
            action: "APPROVE_ACCEPTANCE_VOUCHER",
            user_name: "Chủ đầu tư A",
            created_at: new Date("2026-10-14T10:00:00Z"),
          },
          {
            id: 4,
            action: "SUBMIT_ACCEPTANCE_VOUCHER",
            user_name: "KSGS B",
            created_at: new Date("2026-10-13T09:00:00Z"),
          },
        ],
      });

      const res = await request(app).get(
        "/api/projects/1/acceptance-vouchers/100/history"
      );

      expect(res.status).toBe(200);
      expect(res.body.logs).toHaveLength(2);
      expect(res.body.logs[0].action).toBe("APPROVE_ACCEPTANCE_VOUCHER");
    });

    test("404 khi phiếu không thuộc dự án", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(
        "/api/projects/1/acceptance-vouchers/999/history"
      );
      expect(res.status).toBe(404);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // AUDIT PORTAL — /:projectId/audit-logs
  // ═════════════════════════════════════════════════════════════════════
  describe("GET /:projectId/audit-logs — Audit Portal", () => {
    test("rejects reversed dates before querying audit data", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
      const res = await request(app).get("/api/projects/1/audit-logs?from=2026-10-14&to=2026-10-01");
      expect(res.status).toBe(400);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test("filters conflict events within the selected project", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ban_quan_ly" }] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get("/api/projects/12/audit-logs?entity=diary_entry_conflicts");
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenLastCalledWith(expect.stringContaining('a.project_id = $1'), [12, 'diary_entry_conflicts', 50, 0]);
    });
    test("CĐT xem được danh sách audit của dự án", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 2 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            action: "LOCK_DIARY",
            entity: "daily_log_locks",
            entity_id: 10,
            user_name: "CHT",
            created_at: new Date(),
          },
          {
            id: 2,
            action: "CREATE_ACCEPTANCE_VOUCHER",
            entity: "acceptance_vouchers",
            entity_id: 100,
            user_name: "KSGS",
            created_at: new Date(),
          },
        ],
      });

      const res = await request(app).get("/api/projects/1/audit-logs");

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.logs).toHaveLength(2);
    });

    test("BQL cũng được xem portal", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ban_quan_ly" }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get("/api/projects/1/audit-logs");
      expect(res.status).toBe(200);
    });

    test("403 với đội trưởng", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "doi_truong" }] });
      // Không cần stub thêm vì middleware sẽ 403 trước khi vào handler
      const res = await request(app).get("/api/projects/1/audit-logs");
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/không có quyền/i);
    });

    test("200 với KSGS theo OV-3 / S-39 (KSGS được xem nhật ký thao tác)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await request(app).get("/api/projects/1/audit-logs");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("logs");
    });

    test("400 khi entity không nằm trong whitelist", async () => {
      // Phải mock đủ cho checkProjectAccess pass trước
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
      const res = await request(app).get(
        "/api/projects/1/audit-logs?entity=random_table"
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/entity.*không hợp lệ/i);
    });

    test("400 khi action sai định dạng", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "chu_dau_tu" }] });
      const res = await request(app).get(
        "/api/projects/1/audit-logs?action=invalid action!"
      );
      expect(res.status).toBe(400);
    });

    test("System admin bypass (không cần membership)", async () => {
      const adminUser = { id: 99, is_system_admin: true };
      const adminApp = express();
      adminApp.use(express.json());
      adminApp.use((req, _res, next) => {
        req.session = { user: adminUser };
        req.user = adminUser;
        next();
      });
      adminApp.use("/api/projects", acceptanceRoutes);
      adminApp.use(errorHandler);

      // admin không gọi mockQuery cho project_members → mockQuery
      // sẽ trực tiếp phục vụ COUNT + data query của audit-logs handler
      // Ngược với mockClient.query trước đó, handler audit-logs dùng db.query (mockQuery)
      // Lưu ý: sysadmin vẫn gọi SELECT role (nhưng middleware bypass ngay sau đó)
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT role (consumed nhưng bypass)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(adminApp).get("/api/projects/1/audit-logs");
      expect(res.status).toBe(200);
    });
  });

  // ═════════════════════════════════════════════════════════════════════
  // CREATE audit (đã gắn ở POST /)
  // ═════════════════════════════════════════════════════════════════════
  describe("CREATE_ACCEPTANCE_VOUCHER được audit", () => {
    test("POST /acceptance-vouchers ghi audit với old_value=null, new_value chứa status", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ role: "ky_su_giam_sat" }] });

      // BEGIN
      mockClient.query.mockResolvedValueOnce({});
      // check work items
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 1, unit: "m3", is_leaf: true }],
      });
      // prev approved (empty)
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // INSERT voucher
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 200,
            project_id: 1,
            batch_name: "Đợt 1",
            status: "draft",
            has_negative_delta: false,
            created_by: 10,
          },
        ],
      });
      // INSERT item
      mockClient.query.mockResolvedValueOnce({});
      // COMMIT
      mockClient.query.mockResolvedValueOnce({});

      const res = await request(app)
        .post("/api/projects/1/acceptance-vouchers")
        .send({
          batch_name: "Đợt 1",
          items: [{ work_item_id: 1, cumulative_quantity: "100.000" }],
        });

      expect(res.status).toBe(201);
      // Cho microtask audit chạy xong trước khi assert
      await new Promise(setImmediate);

      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "CREATE_ACCEPTANCE_VOUCHER",
          entity: "acceptance_vouchers",
          entityId: 200,
          projectId: 1,
          details: expect.objectContaining({
            old_value: null,
            new_value: expect.objectContaining({ status: "draft" }),
          }),
        })
      );
    });
  });
});
