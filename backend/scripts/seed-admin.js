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
    
    const roleRes = await pool.query("SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1");
    const roleId = roleRes.rows.length > 0 ? roleRes.rows[0].id : 1;

    if (res.rows.length > 0) {
      await pool.query('UPDATE users SET is_system_admin = true, password_hash = $1, role_id = $3 WHERE email = $2', [passwordHash, 'admin@congtrinh.vn', roleId]);
      console.log('Admin updated!');
    } else {
      await pool.query('INSERT INTO users (name, email, password_hash, is_system_admin, role_id) VALUES ($1, $2, $3, true, $4)', ['System Admin', 'admin@congtrinh.vn', passwordHash, roleId]);
      console.log('Admin inserted!');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
