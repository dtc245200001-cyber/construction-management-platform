const argon2 = require('argon2');
const pool = require('../config/db');
require('dotenv').config();

async function createAdmin() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Vui lòng cung cấp email và password thông qua tham số (node create-admin.js <email> <password>) hoặc biến môi trường ADMIN_EMAIL, ADMIN_PASSWORD.');
    process.exit(1);
  }

  try {
    const roleResult = await pool.query("SELECT id FROM roles WHERE name = 'ban_quan_ly'");
    if (roleResult.rows.length === 0) {
      console.error('Lỗi: Không tìm thấy vai trò ban_quan_ly trong database.');
      process.exit(1);
    }
    const roleId = roleResult.rows[0].id;

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      console.error('Lỗi: Email đã tồn tại.');
      process.exit(1);
    }

    const hash = await argon2.hash(password);
    
    await pool.query(
      'INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4)',
      ['Admin', email, hash, roleId]
    );

    console.log('Tạo tài khoản ban_quan_ly thành công.');
    process.exit(0);
  } catch (err) {
    console.error('Lỗi khi tạo admin:', err);
    process.exit(1);
  }
}

createAdmin();
