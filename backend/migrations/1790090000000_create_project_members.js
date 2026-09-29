exports.up = (pgm) => {
  // Tạo bảng nối người dùng với dự án
  pgm.createTable('project_members', {
    id: 'id',
feature/t06-s03-project-access
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    project_id: { type: 'integer', notNull: true, references: 'projects', onDelete: 'CASCADE' },
    role: { type: 'varchar(50)', notNull: true }, // Vai trò: Chỉ huy trưởng, Kỹ sư, v.v.
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    project_id: { type: 'integer', notNull: true, references: '"projects"', onDelete: 'CASCADE' },
    user_id: { type: 'integer', notNull: true, references: '"users"', onDelete: 'CASCADE' },
    role: { type: 'varchar(50)', notNull: true, default: 'member' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  });

  pgm.addConstraint('project_members', 'unique_project_user', {
    unique: ['project_id', 'user_id']
  });
};

exports.down = (pgm) => {
  pgm.dropTable('project_members');
};