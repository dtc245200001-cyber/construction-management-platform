require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.test') });
process.env.DATABASE_URL = process.env.LOCAL_DATABASE_URL;
const pool = require('../config/db');

pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
  .then(r => {
    console.log('Tables in test DB:', r.rows.map(x => x.table_name));
    pool.end();
  })
  .catch(e => {
    console.error(e.message);
    pool.end();
  });
