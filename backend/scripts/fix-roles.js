require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("INSERT INTO roles (name) VALUES ('ky_su_giam_sat'), ('chi_huy_truong'), ('ke_toan') ON CONFLICT (name) DO NOTHING;")
  .then(() => { console.log('Fixed roles'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
