require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query("SELECT id, name FROM projects WHERE name ILIKE '%Nhà xưởng%'")
  .then(r => { console.log(r.rows); pool.end(); })
  .catch(e => { console.error(e.message); process.exit(1); });
