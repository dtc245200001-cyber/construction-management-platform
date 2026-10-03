module.exports = {
  shorthands: undefined,

  up: (pgm) => {
    // Add new columns to projects
    pgm.addColumns('projects', {
      code: { type: 'varchar(255)', notNull: false },
      status: { type: 'varchar(50)', notNull: true, default: 'Chuẩn bị' },
      sprint_length_weeks: { type: 'integer', notNull: true, default: 1 },
      actual_progress: { type: 'integer', notNull: true, default: 0 },
      planned_progress: { type: 'integer', notNull: true, default: 0 }
    });

    // Make code unique
    pgm.addConstraint('projects', 'unique_project_code', {
      unique: 'code'
    });

    // Add last_opened_at to project_members
    pgm.addColumns('project_members', {
      last_opened_at: { type: 'timestamp', notNull: false }
    });
  },

  down: (pgm) => {
    pgm.dropColumns('project_members', ['last_opened_at']);
    pgm.dropConstraint('projects', 'unique_project_code');
    pgm.dropColumns('projects', [
      'code',
      'status',
      'sprint_length_weeks',
      'actual_progress',
      'planned_progress'
    ]);
  }
};
