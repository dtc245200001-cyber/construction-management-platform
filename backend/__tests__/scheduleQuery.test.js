jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

const db = require("../config/db");
const { getScheduleResults, getPlannedFinish } = require("../services/scheduleQuery");

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
        },
      ],
    });

    const result = await getScheduleResults(10);

    expect(result).toHaveLength(1);
    expect(result[0].project_id).toBe(10);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("LEFT JOIN schedule_results"),
      [10, null]
    );
  });

  test("passes critical filter when requested", async () => {
    db.query.mockResolvedValue({
      rows: [],
    });

    await getScheduleResults(10, true);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("sr.is_critical = $2"),
      [10, true]
    );
  });

  test("orders results by early start", async () => {
    db.query.mockResolvedValue({
      rows: [],
    });

    await getScheduleResults(10);

    const sql = db.query.mock.calls[0][0];

    expect(sql).toContain("ORDER BY sr.early_start NULLS LAST, t.id");
  });

  describe("T-37: newly_critical logic", () => {
    it("newly_critical is true if currently critical but planned was not critical", async () => {
      db.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            is_critical: true,
            planned_is_critical: false
          }
        ]
      });

      const result = await getScheduleResults(10);
      expect(result[0].newly_critical).toBe(true);
    });

    it("newly_critical is false if it was critical from the start (both true)", async () => {
      db.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            is_critical: true,
            planned_is_critical: true
          }
        ]
      });

      const result = await getScheduleResults(10);
      expect(result[0].newly_critical).toBe(false);
    });

    it("newly_critical is false if not critical currently", async () => {
      db.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            is_critical: false,
            planned_is_critical: true
          },
          {
            id: 2,
            is_critical: false,
            planned_is_critical: false
          }
        ]
      });

      const result = await getScheduleResults(10);
      expect(result[0].newly_critical).toBe(false);
      expect(result[1].newly_critical).toBe(false);
    });
  });
});
