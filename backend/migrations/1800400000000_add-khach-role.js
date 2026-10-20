"use strict";

// Thêm vai trò hệ thống "khach" cho tài khoản mới chưa được gán vai trò thật.
// Khách không nằm trong bất kỳ mảng quyền nào -> default-deny tự nhiên.

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(
    "INSERT INTO roles (name) VALUES ('khach') ON CONFLICT (name) DO NOTHING"
  );
};

exports.down = (pgm) => {
  // Không xóa role để tránh vỡ FK users.role_id; chỉ giữ no-op có chú thích.
  pgm.sql("SELECT 1");
};
