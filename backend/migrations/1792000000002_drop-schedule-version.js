exports.up = (pgm) => {
  pgm.dropColumns("projects", ["schedule_version"], { ifExists: true });
};

exports.down = (pgm) => {
  pgm.addColumns("projects", {
    schedule_version: {
      type: "integer",
      default: 1,
      notNull: true,
    },
  });
};
