require('dotenv').config();
const db = require('./config/db');
const argon2 = require('argon2');

async function run() {
  const hash = await argon2.hash('admin123');
  await db.query(
    'INSERT INTO users (name, email, password_hash, is_system_admin, is_verified, role_id) VALUES ($1, $2, $3, $4, $5, (SELECT id FROM roles WHERE name = \'ban_quan_ly\' LIMIT 1))', 
    ['Quản trị viên', 'admin@congtrinh.vn', hash, true, true]
  );
  console.log('Admin user created');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
