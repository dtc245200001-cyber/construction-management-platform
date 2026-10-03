exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns("schedule_results", {
    needs_recalculation: {
      type: "boolean",
      notNull: true,
      default: true,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns("schedule_results", ["needs_recalculation"]);
};