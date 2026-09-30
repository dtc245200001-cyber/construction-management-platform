const { Pool } = require("pg");
const argon2 = require("argon2");
require("dotenv").config({ path: __dirname + "/../.env" });

async function createAdmin() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || "Admin";

  if (!email || !password) {
    console.error(
      "Usage: node create-admin.js <email> <password> [name]"
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      process.env.LOCAL_DATABASE_URL ||
      `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  });

  try {
    const roleRes = await pool.query(
      `SELECT id FROM roles WHERE name = 'ban_quan_ly'`
    );
    if (roleRes.rows.length === 0) {
      console.error("Admin role not found in database.");
      process.exit(1);
    }
    const adminRoleId = roleRes.rows[0].id;

    const existingUser = await pool.query(
      `SELECT id FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    if (existingUser.rows.length > 0) {
      console.log("User already exists. Updating password and role...");
      await pool.query(
        `UPDATE users SET password_hash = $1, role_id = $2 WHERE email = $3`,
        [hash, adminRoleId, email.toLowerCase()]
      );
      console.log("Admin updated successfully.");
    } else {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4)`,
        [name, email.toLowerCase(), hash, adminRoleId]
      );
      console.log("Admin created successfully.");
    }
  } catch (err) {
    console.error("Error creating admin:", err);
  } finally {
    await pool.end();
  }
}

createAdmin();
