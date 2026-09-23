exports.up = (pgm) => {
    // Bảng dự án
    pgm.createTable('projects', {
        id: 'id',
        name: { type: 'varchar(255)', notNull: true },
        location: { type: 'varchar(255)' },
        start_date: { type: 'date' },
        created_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
    });

    // Lưu ý: migration T-06 (create_project_members) khai project_id với
    // `references: 'projects'` nhưng bảng `projects` lúc đó chưa tồn tại.
    // Đây là bug ở file T-06, không sửa được từ đây — CREATE TABLE ở T-06 sẽ
    // báo lỗi "relation projects does not exist" và dừng ngay tại đó, trước
    // khi migration này (T-08) có cơ hội chạy. Cần người viết T-06 tự sửa
    // (bỏ FK ra khỏi lúc tạo bảng, hoặc thêm bằng addConstraint sau khi có
    // bảng projects) thì chuỗi migration mới chạy hết được.

    // Bảng hạng mục, dạng cây qua parent_id tự trỏ về chính bảng work_items
    pgm.createTable('work_items', {
        id: 'id',
        project_id: { type: 'integer', notNull: true, references: 'projects', onDelete: 'CASCADE' },
        parent_id: { type: 'integer', references: 'work_items', onDelete: 'CASCADE' }, // NULL = hạng mục gốc
        name: { type: 'varchar(255)', notNull: true },
        created_at: {
            type: 'timestamp',
            notNull: true,
            default: pgm.func('current_timestamp'),
        },
    });

    // T-08: chỉ mục trên cột cha vì mọi truy vấn cây (lấy cây con, đệ quy) đều lọc/join qua nó
    pgm.createIndex('work_items', 'parent_id');
};

exports.down = (pgm) => {
    // Lùi migration theo thứ tự ngược của phụ thuộc khoá ngoại
    pgm.dropTable('work_items');
    pgm.dropTable('projects');
};
