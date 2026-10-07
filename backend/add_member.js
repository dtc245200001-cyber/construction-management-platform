require("dotenv").config();
const db = require("./config/db");

async function addAdminToProject() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    const projectId = 13;

    // Lấy tất cả user hiện có
    const resUsers = await client.query("SELECT id FROM users");
    
    // Thêm tất cả vào project 13
    for (const u of resUsers.rows) {
      await client.query(`
        INSERT INTO project_members (project_id, user_id, role)
        VALUES ($1, $2, 'ban_quan_ly')
        ON CONFLICT DO NOTHING
      `, [projectId, u.id]);
    }

    await client.query("COMMIT");
    console.log("Added all users to project 13 successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
  } finally {
    client.release();
    process.exit();
  }
}

addAdminToProject();
