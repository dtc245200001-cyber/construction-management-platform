"use strict";

const mockConnect = jest.fn();
const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();

jest.mock("../config/db", () => ({
  connect: (...args) => mockConnect(...args),
  query: (...args) => mockQuery(...args),
}));

const service = require("../services/paymentRequestService");

describe("S-44 / T-114 payment request review service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({
      query: (...args) => mockClientQuery(...args),
      release: mockRelease,
    });
  });

  test("return thiếu lý do bị từ chối 400 trước khi mở transaction", async () => {
    await expect(
      service.returnPaymentRequest({
        projectId: 1,
        paymentRequestId: 10,
        userId: 20,
        reason: "   ",
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "RETURN_REASON_REQUIRED",
    });

    expect(mockConnect).not.toHaveBeenCalled();
  });

  test("duyệt DRAFT -> APPROVED và ghi người/thời điểm qua UPDATE", async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT") return {};
      if (sql.includes("SELECT id FROM projects")) {
        return { rows: [{ id: 1 }] };
      }
      if (sql.includes("FROM payment_requests") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: 10,
            project_id: 1,
            status: "DRAFT",
            total_amount: "1000.00",
            retention_rate: "5.00",
            retention_cap_amount: null,
          }],
        };
      }
      if (sql.includes("SUM(retention_amount)")) {
        return { rows: [{ approved_retention: "100.00" }] };
      }
      if (sql.includes("UPDATE payment_requests")) {
        return {
          rows: [{
            id: 10,
            project_id: 1,
            status: "APPROVED",
            reviewed_by: 20,
            reviewed_at: "2026-10-17T10:00:00Z",
            retention_amount: "50.00",
            payable_amount: "950.00",
            cumulative_retention_amount: "150.00",
          }],
        };
      }
      if (sql.includes("INSERT INTO payment_request_status_history")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await service.approvePaymentRequest({
      projectId: 1,
      paymentRequestId: 10,
      userId: 20,
    });

    expect(result.status).toBe("APPROVED");
    expect(result.reviewed_by).toBe(20);
    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("INSERT INTO payment_request_status_history")
      )
    ).toBe(true);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  test("đề nghị APPROVED bị khóa, không thể duyệt lại", async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return {};
      if (sql.includes("SELECT id FROM projects")) {
        return { rows: [{ id: 1 }] };
      }
      if (sql.includes("FROM payment_requests") && sql.includes("FOR UPDATE")) {
        return {
          rows: [{
            id: 10,
            project_id: 1,
            status: "APPROVED",
            total_amount: "1000.00",
            retention_rate: "5.00",
            retention_cap_amount: null,
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(
      service.approvePaymentRequest({
        projectId: 1,
        paymentRequestId: 10,
        userId: 20,
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "PAYMENT_REQUEST_LOCKED",
    });
  });

  test("trả lại DRAFT -> RETURNED và release phiếu nghiệm thu", async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT") return {};
      if (sql.includes("FROM payment_requests") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: 11, project_id: 1, status: "DRAFT" }] };
      }
      if (sql.includes("UPDATE payment_requests")) {
        return {
          rows: [{
            id: 11,
            project_id: 1,
            status: "RETURNED",
            reviewed_by: 20,
            return_reason: "Thiếu hồ sơ",
          }],
        };
      }
      if (sql.includes("UPDATE payment_request_acceptances")) {
        return { rowCount: 2, rows: [] };
      }
      if (sql.includes("INSERT INTO payment_request_status_history")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const result = await service.returnPaymentRequest({
      projectId: 1,
      paymentRequestId: 11,
      userId: 20,
      reason: "Thiếu hồ sơ",
    });

    expect(result.status).toBe("RETURNED");
    expect(result.return_reason).toBe("Thiếu hồ sơ");
    expect(
      mockClientQuery.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE payment_request_acceptances")
      )
    ).toBe(true);
  });
});
