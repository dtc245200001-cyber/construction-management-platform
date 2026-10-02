const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const res = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@congtrinh.vn']);
    
    if (res.rows.length > 0) {
      await pool.query('UPDATE users SET is_system_admin = true, password_hash = $1, role_id = 1 WHERE email = $2', [passwordHash, 'admin@congtrinh.vn']);
      console.log('Admin updated!');
    } else {
      await pool.query('INSERT INTO users (name, email, password_hash, is_system_admin, role_id) VALUES ($1, $2, $3, true, 1)', ['System Admin', 'admin@congtrinh.vn', passwordHash]);
      console.log('Admin inserted!');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
