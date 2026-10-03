require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Kiểm tra toàn bộ users bị khóa
  const check = await pool.query(
    "SELECT email, failed_login_attempts, locked_until FROM users ORDER BY email"
  );
  console.log('Tất cả users trên Supabase:');
  check.rows.forEach(r => console.log(r));

  // Mở khóa tất cả
  const update = await pool.query(
    "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE locked_until IS NOT NULL OR failed_login_attempts > 0 RETURNING email, failed_login_attempts, locked_until"
  );
  console.log('\nĐã mở khóa:', update.rows.length > 0 ? update.rows : 'Không có ai bị khóa');

  await pool.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
