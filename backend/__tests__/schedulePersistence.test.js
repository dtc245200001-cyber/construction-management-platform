jest.mock("../config/db", () => ({
  connect: jest.fn(),
}));

const pool = require("../config/db");
const {
  saveScheduleResults,
  addDays,
} = require("../services/schedulePersistence");

describe("schedulePersistence", () => {
  let client;

  beforeEach(() => {
    client = {
      query: jest.fn(),
      release: jest.fn(),
    };

    pool.connect.mockResolvedValue(client);
    jest.clearAllMocks();
  });

  test("converts schedule offsets to timestamps", () => {
    const projectStart = "2026-10-01T00:00:00.000Z";

    expect(addDays(projectStart, 0)).toEqual(
      new Date("2026-10-01T00:00:00.000Z")
    );

    expect(addDays(projectStart, 5)).toEqual(
      new Date("2026-10-06T00:00:00.000Z")
    );
  });

  test("saves schedule results in one transaction", async () => {
    client.query.mockResolvedValue({});

    const scheduleResults = {
      1: {
        ES: 0,
        EF: 5,
        LS: 2,
        LF: 7,
        float: 2,
        critical: false,
      },
      2: {
        ES: 5,
        EF: 10,
        LS: 5,
        LF: 10,
        float: 0,
        critical: true,
      },
    };

    const count = await saveScheduleResults(
      scheduleResults,
      "2026-10-01T00:00:00.000Z"
    );

    expect(count).toBe(2);
    expect(pool.connect).toHaveBeenCalledTimes(1);

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");

    expect(client.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO schedule_results"),
      [
        1,
        new Date("2026-10-01T00:00:00.000Z"),
        new Date("2026-10-06T00:00:00.000Z"),
        new Date("2026-10-03T00:00:00.000Z"),
        new Date("2026-10-08T00:00:00.000Z"),
        2,
        false,
      ]
    );

    expect(client.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO schedule_results"),
      [
        2,
        new Date("2026-10-06T00:00:00.000Z"),
        new Date("2026-10-11T00:00:00.000Z"),
        new Date("2026-10-06T00:00:00.000Z"),
        new Date("2026-10-11T00:00:00.000Z"),
        0,
        true,
      ]
    );

    expect(client.query).toHaveBeenNthCalledWith(4, "COMMIT");

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test("rolls back transaction when persistence fails", async () => {
    const error = new Error("database error");

    client.query
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({});

    const scheduleResults = {
      1: {
        ES: 0,
        EF: 5,
        LS: 2,
        LF: 7,
        float: 2,
        critical: false,
      },
    };

    await expect(
      saveScheduleResults(
        scheduleResults,
        "2026-10-01T00:00:00.000Z"
      )
    ).rejects.toThrow("database error");

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(3, "ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test("returns 0 without opening a database transaction when there are no results", async () => {
    const count = await saveScheduleResults(
      {},
      "2026-10-01T00:00:00.000Z"
    );

    expect(count).toBe(0);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test("requires projectStart when results exist", async () => {
    const scheduleResults = {
      1: {
        ES: 0,
        EF: 5,
        LS: 2,
        LF: 7,
        float: 2,
        critical: false,
      },
    };

    await expect(saveScheduleResults(scheduleResults)).rejects.toThrow(
      "projectStart is required"
    );

    expect(pool.connect).not.toHaveBeenCalled();
  });

  test("updates existing schedule result using upsert", async () => {
    client.query.mockResolvedValue({});

    const scheduleResults = {
      1: {
        ES: 3,
        EF: 8,
        LS: 3,
        LF: 8,
        float: 0,
        critical: true,
      },
    };

    await saveScheduleResults(
      scheduleResults,
      "2026-10-01T00:00:00.000Z"
    );

    const insertQuery = client.query.mock.calls[1][0];

    expect(insertQuery).toContain("ON CONFLICT (task_id)");
    expect(insertQuery).toContain("DO UPDATE SET");
    expect(insertQuery).toContain(
      "total_float = EXCLUDED.total_float"
    );
    expect(insertQuery).toContain(
      "is_critical = EXCLUDED.is_critical"
    );
  });
});