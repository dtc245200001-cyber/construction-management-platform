exports.up = (pgm) => {
  pgm.addColumns("projects", {
    planned_finish_date: { type: "date", notNull: false, default: null },
  });
  pgm.addColumns("tasks", {
    was_critical_baseline: { type: "boolean", notNull: false, default: null },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("projects", ["planned_finish_date"], { ifExists: true });
  pgm.dropColumns("tasks", ["was_critical_baseline"], { ifExists: true });
};
