jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

const db = require("../config/db");
const { getScheduleResults } = require("../services/scheduleQuery");

describe("scheduleQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("queries schedule results by project", async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          id: 1,
          project_id: 10,
          name: "Task 1",
          code: "T1",
          early_start: "2026-01-01T00:00:00.000Z",
          early_finish: "2026-01-03T00:00:00.000Z",
          late_start: "2026-01-01T00:00:00.000Z",
          late_finish: "2026-01-03T00:00:00.000Z",
          total_float: 0,
          is_critical: true,
          calculated_at: "2026-01-01T00:00:00.000Z",
          max_planned: "2026-01-03T00:00:00.000Z", // for planned finish mock
          max_current: "2026-01-03T00:00:00.000Z", // for current finish mock
        },
      ],
    });

    const result = await getScheduleResults(10);

    expect(result).toHaveLength(1);
    expect(result[0].project_id).toBe(10);

    expect(db.query).toHaveBeenCalledTimes(5);
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining("LEFT JOIN schedule_results"),
      [10, null]
    );
  });

  test("passes critical filter when requested", async () => {
    db.query.mockResolvedValue({
      rows: [],
    });

    await getScheduleResults(10, true);

    expect(db.query).toHaveBeenCalledTimes(5);
    expect(db.query).toHaveBeenNthCalledWith(1,
      expect.stringContaining("sr.is_critical = $2"),
      [10, true]
    );
  });

  test("returns correct summary even when critical filter is true", async () => {
    db.query.mockResolvedValue({
      rows: [{ max_current: "2026-01-05", max_planned: "2026-01-05" }],
    });

    const result = await getScheduleResults(10, true);
    expect(result.summary.currentFinish).toBe("2026-01-05");
  });

  test("orders results by early start", async () => {
    db.query.mockResolvedValue({
      rows: [],
    });

    await getScheduleResults(10);

    const sql = db.query.mock.calls[0][0];

    expect(sql).toContain("ORDER BY sr.early_start NULLS LAST, t.id");
  });
});
