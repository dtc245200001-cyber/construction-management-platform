require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const db = require("../config/db");
const argon2 = require("argon2");

async function run() {
  try {
    const hash = await argon2.hash("password123");
    const roleRes = await db.query("SELECT id FROM roles WHERE name = 'chi_huy_truong'");
    const roleId = roleRes.rows[0].id;

    const existing = await db.query("SELECT id FROM users WHERE lower(email) = 'chihuytruong@cong-truong-360.vn'");
    let userId;
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      await db.query("UPDATE users SET password_hash = $1, role_id = $2 WHERE id = $3", [hash, roleId, userId]);
      console.log("Updated user chihuytruong@cong-truong-360.vn");
    } else {
      const ins = await db.query(
        "INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id",
        ["Chỉ huy trưởng", "chihuytruong@cong-truong-360.vn", hash, roleId]
      );
      userId = ins.rows[0].id;
      console.log("Created user chihuytruong@cong-truong-360.vn");
    }

    const projects = await db.query("SELECT id FROM projects");
    for (const p of projects.rows) {
      const mem = await db.query("SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2", [p.id, userId]);
      if (mem.rows.length === 0) {
        await db.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'chi_huy_truong')", [p.id, userId]);
      } else {
        await db.query("UPDATE project_members SET role = 'chi_huy_truong' WHERE project_id = $1 AND user_id = $2", [p.id, userId]);
      }
    }
    console.log("Assigned to all projects as chi_huy_truong successfully!");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    process.exit(0);
  }
}

run();
