exports.up = (pgm) => {
  pgm.addColumns("schedule_results", {
    planned_early_start: { type: "date" },
    planned_early_finish: { type: "date" },
    planned_is_critical: { type: "boolean", default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("schedule_results", [
    "planned_early_start",
    "planned_early_finish",
    "planned_is_critical",
  ]);
};
