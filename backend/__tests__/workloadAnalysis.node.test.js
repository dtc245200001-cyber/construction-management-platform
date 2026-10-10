"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectTeamOverload,
  normalizeTaskSchedule,
  parseDateUTC,
  formatDateUTC,
} = require("../algorithms/workloadAnalysis");

test("Helper Functions - parseDateUTC and formatDateUTC", () => {
  const d = parseDateUTC("2026-10-15");
  assert.ok(d !== null);
  assert.equal(formatDateUTC(d), "2026-10-15");
});

test("Helper Functions - normalizeTaskSchedule with duration_days fallback", () => {
  const norm = normalizeTaskSchedule({
    id: 1,
    name: "Test Task",
    start_date: "2026-10-10",
    duration_days: 5,
  });

  assert.ok(norm !== null);
  assert.equal(norm.start_date, "2026-10-10");
  assert.equal(norm.end_date, "2026-10-14");
  assert.equal(norm.duration_days, 5);
});

test("detectTeamOverload - empty tasks", () => {
  const result = detectTeamOverload([]);
  assert.equal(result.is_overloaded, false);
  assert.equal(result.overloaded_intervals.length, 0);
});

test("detectTeamOverload - 3 overlapping tasks (not overloaded)", () => {
  const tasks = [
    { id: 1, name: "Task 1", start_date: "2026-10-10", end_date: "2026-10-20" },
    { id: 2, name: "Task 2", start_date: "2026-10-12", end_date: "2026-10-22" },
    { id: 3, name: "Task 3", start_date: "2026-10-14", end_date: "2026-10-25" },
  ];

  const result = detectTeamOverload(tasks, 3);
  assert.equal(result.is_overloaded, false);
  assert.equal(result.max_concurrent, 3);
  assert.equal(result.overloaded_intervals.length, 0);
});

test("detectTeamOverload - 4th task triggers overload with exact interval", () => {
  const tasks = [
    { id: 1, name: "Đào móng", start_date: "2026-10-10", end_date: "2026-10-20", is_critical: true },
    { id: 2, name: "Gia công cốt thép", start_date: "2026-10-12", end_date: "2026-10-22", is_critical: false },
    { id: 3, name: "Lắp dựng cốp pha", start_date: "2026-10-14", end_date: "2026-10-25", is_critical: false },
    { id: 4, name: "Đổ bê tông lót", start_date: "2026-10-15", end_date: "2026-10-18", is_critical: true },
  ];

  const result = detectTeamOverload(tasks, 3);
  assert.equal(result.is_overloaded, true);
  assert.equal(result.max_concurrent, 4);
  assert.equal(result.overloaded_intervals.length, 1);

  const interval = result.overloaded_intervals[0];
  assert.equal(interval.start_date, "2026-10-15");
  assert.equal(interval.end_date, "2026-10-18");
  assert.equal(interval.duration_days, 4);
  assert.equal(interval.concurrent_count, 4);
  assert.equal(interval.tasks.length, 4);

  const ids = interval.tasks.map((t) => t.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 2, 3, 4]);
  assert.ok(result.message.includes("2026-10-15"));
  assert.ok(result.message.includes("2026-10-18"));
});

test("detectTeamOverload - sequential tasks without exceeding threshold", () => {
  const tasks = [
    { id: 1, name: "Task 1", start_date: "2026-10-01", end_date: "2026-10-05" },
    { id: 2, name: "Task 2", start_date: "2026-10-02", end_date: "2026-10-06" },
    { id: 3, name: "Task 3", start_date: "2026-10-03", end_date: "2026-10-07" },
    { id: 4, name: "Task 4", start_date: "2026-10-06", end_date: "2026-10-10" },
  ];

  const result = detectTeamOverload(tasks, 3);
  assert.equal(result.is_overloaded, false);
  assert.equal(result.max_concurrent, 3);
  assert.equal(result.overloaded_intervals.length, 0);
});

test("detectTeamOverload - multiple separated overloaded intervals", () => {
  const tasks = [
    { id: 1, name: "A1", start_date: "2026-10-01", end_date: "2026-10-10" },
    { id: 2, name: "A2", start_date: "2026-10-02", end_date: "2026-10-10" },
    { id: 3, name: "A3", start_date: "2026-10-03", end_date: "2026-10-10" },
    { id: 4, name: "A4", start_date: "2026-10-05", end_date: "2026-10-08" },

    { id: 5, name: "B1", start_date: "2026-11-01", end_date: "2026-11-10" },
    { id: 6, name: "B2", start_date: "2026-11-02", end_date: "2026-11-10" },
    { id: 7, name: "B3", start_date: "2026-11-03", end_date: "2026-11-10" },
    { id: 8, name: "B4", start_date: "2026-11-05", end_date: "2026-11-08" },
  ];

  const result = detectTeamOverload(tasks, 3);
  assert.equal(result.is_overloaded, true);
  assert.equal(result.overloaded_intervals.length, 2);
  assert.equal(result.overloaded_intervals[0].start_date, "2026-10-05");
  assert.equal(result.overloaded_intervals[0].end_date, "2026-10-08");
  assert.equal(result.overloaded_intervals[1].start_date, "2026-11-05");
  assert.equal(result.overloaded_intervals[1].end_date, "2026-11-08");
});
