"use strict";

const {
  detectTeamOverload,
  normalizeTaskSchedule,
  parseDateUTC,
  formatDateUTC,
} = require("../algorithms/workloadAnalysis");

describe("Workload Analysis Algorithm (T-57 / S-25)", () => {
  describe("Helper Functions", () => {
    test("parseDateUTC and formatDateUTC handle date strings correctly", () => {
      const d = parseDateUTC("2026-10-15");
      expect(d).not.toBeNull();
      expect(formatDateUTC(d)).toBe("2026-10-15");
    });

    test("normalizeTaskSchedule falls back to duration_days if end_date missing", () => {
      const norm = normalizeTaskSchedule({
        id: 1,
        name: "Test Task",
        start_date: "2026-10-10",
        duration_days: 5,
      });

      expect(norm).not.toBeNull();
      expect(norm.start_date).toBe("2026-10-10");
      expect(norm.end_date).toBe("2026-10-14"); // 10, 11, 12, 13, 14 = 5 days
      expect(norm.duration_days).toBe(5);
    });

    test("normalizeTaskSchedule returns null when no date info", () => {
      expect(normalizeTaskSchedule({ id: 1, name: "No date" })).toBeNull();
    });
  });

  describe("detectTeamOverload", () => {
    test("returns not overloaded when tasks array is empty", () => {
      const result = detectTeamOverload([]);
      expect(result.is_overloaded).toBe(false);
      expect(result.overloaded_intervals).toHaveLength(0);
    });

    test("returns not overloaded when tasks <= 3 (threshold = 3)", () => {
      const tasks = [
        { id: 1, name: "Task 1", start_date: "2026-10-10", end_date: "2026-10-20" },
        { id: 2, name: "Task 2", start_date: "2026-10-12", end_date: "2026-10-22" },
        { id: 3, name: "Task 3", start_date: "2026-10-14", end_date: "2026-10-25" },
      ];

      const result = detectTeamOverload(tasks, 3);
      expect(result.is_overloaded).toBe(false);
      expect(result.max_concurrent).toBe(3);
      expect(result.overloaded_intervals).toHaveLength(0);
    });

    test("detects overload when 4th task causes > 3 concurrent tasks in an interval", () => {
      const tasks = [
        { id: 1, name: "Đào móng", start_date: "2026-10-10", end_date: "2026-10-20", is_critical: true },
        { id: 2, name: "Gia công cốt thép", start_date: "2026-10-12", end_date: "2026-10-22", is_critical: false },
        { id: 3, name: "Lắp dựng cốp pha", start_date: "2026-10-14", end_date: "2026-10-25", is_critical: false },
        // Task 4 starts on Oct 15 and ends on Oct 18:
        // On Oct 15-18, all 4 tasks are active simultaneously!
        { id: 4, name: "Đổ bê tông lót", start_date: "2026-10-15", end_date: "2026-10-18", is_critical: true },
      ];

      const result = detectTeamOverload(tasks, 3);
      expect(result.is_overloaded).toBe(true);
      expect(result.max_concurrent).toBe(4);
      expect(result.overloaded_intervals).toHaveLength(1);

      const interval = result.overloaded_intervals[0];
      expect(interval.start_date).toBe("2026-10-15");
      expect(interval.end_date).toBe("2026-10-18");
      expect(interval.duration_days).toBe(4);
      expect(interval.concurrent_count).toBe(4);
      expect(interval.tasks).toHaveLength(4);

      const taskIds = interval.tasks.map((t) => t.id);
      expect(taskIds).toEqual(expect.arrayContaining([1, 2, 3, 4]));
      expect(result.message).toContain("2026-10-15");
      expect(result.message).toContain("2026-10-18");
    });

    test("does NOT trigger overload when tasks run sequentially without exceeding threshold", () => {
      const tasks = [
        { id: 1, name: "Task 1", start_date: "2026-10-01", end_date: "2026-10-05" },
        { id: 2, name: "Task 2", start_date: "2026-10-02", end_date: "2026-10-06" },
        { id: 3, name: "Task 3", start_date: "2026-10-03", end_date: "2026-10-07" },
        // Task 4 starts AFTER Task 1 ends (starts on Oct 06)
        // Concurrency on Oct 06 is Task 2, 3, 4 = 3 tasks (<= 3)
        { id: 4, name: "Task 4", start_date: "2026-10-06", end_date: "2026-10-10" },
      ];

      const result = detectTeamOverload(tasks, 3);
      expect(result.is_overloaded).toBe(false);
      expect(result.max_concurrent).toBe(3);
      expect(result.overloaded_intervals).toHaveLength(0);
    });

    test("detects multiple separated overloaded intervals correctly", () => {
      const tasks = [
        // Block 1 overlap (4 tasks from Oct 05 to Oct 08)
        { id: 1, name: "A1", start_date: "2026-10-01", end_date: "2026-10-10" },
        { id: 2, name: "A2", start_date: "2026-10-02", end_date: "2026-10-10" },
        { id: 3, name: "A3", start_date: "2026-10-03", end_date: "2026-10-10" },
        { id: 4, name: "A4", start_date: "2026-10-05", end_date: "2026-10-08" },

        // Block 2 overlap (4 tasks from Nov 05 to Nov 08)
        { id: 5, name: "B1", start_date: "2026-11-01", end_date: "2026-11-10" },
        { id: 6, name: "B2", start_date: "2026-11-02", end_date: "2026-11-10" },
        { id: 7, name: "B3", start_date: "2026-11-03", end_date: "2026-11-10" },
        { id: 8, name: "B4", start_date: "2026-11-05", end_date: "2026-11-08" },
      ];

      const result = detectTeamOverload(tasks, 3);
      expect(result.is_overloaded).toBe(true);
      expect(result.overloaded_intervals).toHaveLength(2);

      expect(result.overloaded_intervals[0].start_date).toBe("2026-10-05");
      expect(result.overloaded_intervals[0].end_date).toBe("2026-10-08");

      expect(result.overloaded_intervals[1].start_date).toBe("2026-11-05");
      expect(result.overloaded_intervals[1].end_date).toBe("2026-11-08");
    });
  });
});
