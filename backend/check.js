const { Pool } = require("pg");
require("dotenv").config({ path: __dirname + "/.env" });

async function check() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await pool.query("SELECT * FROM roles");
  console.log(res.rows);
  await pool.end();
}
check();
