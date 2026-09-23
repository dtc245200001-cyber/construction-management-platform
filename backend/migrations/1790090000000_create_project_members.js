exports.up = (pgm) => {
  // Tạo bảng nối người dùng với dự án
  pgm.createTable('project_members', {
    id: 'id',
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    project_id: { type: 'integer', notNull: true, references: 'projects', onDelete: 'CASCADE' },
    role: { type: 'varchar(50)', notNull: true }, // Vai trò: Chỉ huy trưởng, Kỹ sư, v.v.
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.addConstraint('project_members', 'unique_user_project', {
    unique: ['user_id', 'project_id'],
  });

  pgm.createIndex('project_members', 'project_id');
};

exports.down = (pgm) => {
  pgm.dropTable('project_members');
};