const { Pool } = require("pg");
const { saveScheduleResults } = require("../services/schedulePersistence");

jest.mock("pg", () => {
  const mPool = {
    connect: jest.fn(), on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool), types: { setTypeParser: jest.fn() } };
});

const pool = require("../config/db");

describe("schedulePersistence", () => {
  let client;

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn(),
    };
    client.query.mockImplementation((queryText) => {
      if (typeof queryText === "string" && queryText.includes("SELECT schedule_version")) {
        return Promise.resolve({ rows: [{ schedule_version: 1 }] });
      }
      return Promise.resolve({});
    });
    pool.connect.mockResolvedValue(client);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("saves schedule results in one transaction", async () => {
    const scheduleResults = {
      1: { ES: 0, EF: 5, LS: 2, LF: 7, float: 2, critical: false },
      2: { ES: 6, EF: 11, LS: 6, LF: 11, float: 0, critical: true },
    };

    const count = await saveScheduleResults(1, scheduleResults, "2026-10-01T00:00:00.000Z");

    expect(count).toBe(2);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO schedule_results"), expect.any(Array));
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test("rolls back transaction when persistence fails", async () => {
    const error = new Error("database error");

    client.query.mockImplementationOnce(() => Promise.resolve({})) // BEGIN
      .mockImplementationOnce(() => Promise.resolve({ rows: [{ schedule_version: 1 }] })) // SELECT
      .mockImplementationOnce(() => Promise.reject(error)) // INSERT
      .mockImplementationOnce(() => Promise.resolve({})); // ROLLBACK

    const scheduleResults = {
      1: { ES: 0, EF: 5, LS: 2, LF: 7, float: 2, critical: false },
    };

    await expect(saveScheduleResults(1, scheduleResults, "2026-10-01T00:00:00.000Z")).rejects.toThrow("database error");

    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test("returns 0 without opening a database transaction when there are no results", async () => {
    const count = await saveScheduleResults(1, {}, "2026-10-01T00:00:00.000Z");
    expect(count).toBe(0);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test("requires projectStart when results exist", async () => {
    const scheduleResults = { 1: { ES: 0, EF: 5, LS: 2, LF: 7, float: 2, critical: false } };
    await expect(saveScheduleResults(1, scheduleResults)).rejects.toThrow("projectStart is required");
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test("updates existing schedule result using upsert", async () => {
    const scheduleResults = { 1: { ES: 3, EF: 8, LS: 3, LF: 8, float: 0, critical: true } };
    await saveScheduleResults(1, scheduleResults, "2026-10-01T00:00:00.000Z");
    
    const insertCall = client.query.mock.calls.find(call => typeof call[0] === "string" && call[0].includes("INSERT INTO schedule_results"));
    expect(insertCall).toBeDefined();
    expect(insertCall[0]).toContain("ON CONFLICT (task_id)");
    expect(insertCall[0]).toContain("DO UPDATE SET");
    expect(insertCall[0]).toContain("total_float = EXCLUDED.total_float");
    expect(insertCall[0]).toContain("is_critical = EXCLUDED.is_critical");
  });
});