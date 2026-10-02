require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'work_items'")
  .then(r => { console.log(r.rows); pool.end(); })
  .catch(e => { console.error(e.message); process.exit(1); });
