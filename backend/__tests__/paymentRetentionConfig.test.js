"use strict";

const mockQuery = jest.fn();
const mockConnect = jest.fn();

jest.mock("../config/db", () => ({
  query: (...args) => mockQuery(...args),
  connect: (...args) => mockConnect(...args),
}));

const service = require("../services/paymentRequestService");

describe("S-45 / T-116 payment retention config", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("từ chối tỷ lệ lớn hơn 100", async () => {
    await expect(
      service.updateRetentionConfig({
        projectId: 1,
        retention_rate: "100.01",
        retention_cap_amount: null,
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("từ chối tỷ lệ có hơn 2 chữ số thập phân", async () => {
    await expect(
      service.updateRetentionConfig({
        projectId: 1,
        retention_rate: "5.123",
        retention_cap_amount: null,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  test("cập nhật tỷ lệ và trần, trả về before/after", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          project_id: 1,
          retention_rate: "5.00",
          retention_cap_amount: "1000000.00",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          project_id: 1,
          retention_rate: "7.50",
          retention_cap_amount: "2000000.00",
        }],
      });

    const result = await service.updateRetentionConfig({
      projectId: 1,
      retention_rate: "7.5",
      retention_cap_amount: "2000000",
    });

    expect(result.before.retention_rate).toBe("5.00");
    expect(result.after.retention_rate).toBe("7.50");
    expect(result.after.retention_cap_amount).toBe("2000000.00");
  });
});
