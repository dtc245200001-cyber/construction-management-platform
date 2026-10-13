require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.test') });
if (!process.env.LOCAL_DATABASE_URL || !/localhost|127\.0\.0\.1/.test(process.env.LOCAL_DATABASE_URL)) {
  console.error('🚫 GUARD: LOCAL_DATABASE_URL không trỏ localhost — từ chối chạy để tránh TRUNCATE production.');
  console.error('   Kiểm tra backend/.env.test: LOCAL_DATABASE_URL phải là postgres://...@localhost:5433/construction_db_test');
  process.exit(1);
}
process.env.DATABASE_URL = process.env.LOCAL_DATABASE_URL;

// 🛡️ GUARD: Chặn chạy trên production (check sau khi gán)
const guardProduction = require('./_production-guard');
guardProduction('debug-test-db.js');

const pool = require('../config/db');

async function main() {
  // Check if TRUNCATE works
  try {
    await pool.query("TRUNCATE TABLE email_logs, project_members, invitations, projects, users RESTART IDENTITY CASCADE");
    console.log('TRUNCATE OK');
  } catch(e) {
    console.error('TRUNCATE ERROR:', e.message);
  }

  // Check if INSERT works
  try {
    await pool.query("INSERT INTO users (id, email, password_hash, name, role_id, is_system_admin) VALUES (1, 'test@test.com', 'h', 'Test', 1, true)");
    console.log('First INSERT OK');
  } catch(e) {
    console.error('First INSERT ERROR:', e.message);
  }

  // Check second INSERT (should fail if truncate wasn't persistent)
  try {
    await pool.query("INSERT INTO users (email, password_hash, name, role_id) VALUES ('exist@test.com', 'h', 'Exist', 1) RETURNING id");
    console.log('Second INSERT OK');
  } catch(e) {
    console.error('Second INSERT ERROR:', e.message);
  }

  // Check count
  const r = await pool.query('SELECT count(*) FROM users');
  console.log('Users count after:', r.rows[0].count);
  
  pool.end();
}

main();
