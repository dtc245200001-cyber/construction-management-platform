jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

const db = require("../config/db");
const {
  markProjectScheduleDirty,
} = require("../services/scheduleRecalculation");

describe("scheduleRecalculation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("marks project schedule results as requiring recalculation", async () => {
    db.query.mockResolvedValue({
      rowCount: 3,
    });

    const count = await markProjectScheduleDirty(5);

    expect(count).toBe(3);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "SET needs_recalculation = true"
      ),
      [5]
    );
  });

  test("returns 0 when project has no schedule results", async () => {
    db.query.mockResolvedValue({
      rowCount: 0,
    });

    const count = await markProjectScheduleDirty(99);

    expect(count).toBe(0);

    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [99]
    );
  });

  test("propagates database errors", async () => {
    const error = new Error("database error");
    db.query.mockRejectedValue(error);

    await expect(
      markProjectScheduleDirty(5)
    ).rejects.toThrow("database error");
  });
});