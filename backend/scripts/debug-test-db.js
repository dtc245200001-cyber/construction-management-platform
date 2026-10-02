require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.test') });
process.env.DATABASE_URL = process.env.LOCAL_DATABASE_URL;
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
