exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('task_attachments', {
    file_data: {
      type: 'bytea',
      notNull: false,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('task_attachments', 'file_data');
};
