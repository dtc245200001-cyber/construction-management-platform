require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query(
  "UPDATE users SET failed_login_attempts = 3 WHERE email = 'vanhai@cong-truong-360.vn' RETURNING email, failed_login_attempts"
).then(r => {
  console.log('Done:', r.rows);
  pool.end();
}).catch(e => { console.error(e.message); process.exit(1); });
