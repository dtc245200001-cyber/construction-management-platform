exports.up = (pgm) => {
  pgm.addColumns('work_items', {
    type: { type: 'varchar(20)', default: 'category' },
    status: { type: 'varchar(50)', default: 'Chưa bắt đầu' },
    start_date: { type: 'date' },
    end_date: { type: 'date' },
    progress: { type: 'integer', default: 0 },
    assigned_to: { type: 'integer', references: 'users(id)', onDelete: 'SET NULL' }
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('work_items', ['type', 'status', 'start_date', 'end_date', 'progress', 'assigned_to']);
};
