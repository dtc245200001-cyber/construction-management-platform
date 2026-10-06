exports.up = (pgm) => {
  pgm.addColumns('tasks', {
    scheduling_mode: { type: 'varchar(20)', default: 'auto', notNull: true },
    manual_start_date: { type: 'date', default: null }
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('tasks', ['scheduling_mode', 'manual_start_date']);
};
