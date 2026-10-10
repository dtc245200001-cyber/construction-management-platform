require('dotenv').config();
const db = require('../config/db');
const argon2 = require('argon2');

const ACCOUNTS = [
    { name: "Test Ban quản lý", email: "banquanly@cong-truong-360.vn", role: "ban_quan_ly" },
    { name: "Test Chỉ huy trưởng", email: "chihuytruong@cong-truong-360.vn", role: "chi_huy_truong" },
    { name: "Test Đội trưởng", email: "doitruong@cong-truong-360.vn", role: "doi_truong" },
    { name: "Test Kỹ sư giám sát", email: "kysugiamsat@cong-truong-360.vn", role: "ky_su_giam_sat" },
    { name: "Test Chủ đầu tư", email: "chudautu@cong-truong-360.vn", role: "chu_dau_tu" },
    { name: "Test Kế toán", email: "ketoan@cong-truong-360.vn", role: "ke_toan" }
];

async function seedPlazaMembers() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    // Tìm dự án Plaza
    const projectRes = await client.query("SELECT id FROM projects WHERE name = 'Plaza' LIMIT 1");
    if (projectRes.rows.length === 0) {
      console.log("Không tìm thấy dự án Plaza");
      return;
    }
    const projectId = projectRes.rows[0].id;
    console.log("Đã tìm thấy dự án Plaza với ID:", projectId);

    const passwordHash = await argon2.hash("password123");

    for (const acc of ACCOUNTS) {
      // 1. Check or insert user
      let userRes = await client.query("SELECT id FROM users WHERE email = $1", [acc.email]);
      let userId;
      if (userRes.rows.length === 0) {
        const insertUser = await client.query(
          "INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, 3) RETURNING id",
          [acc.name, acc.email, passwordHash]
        );
        userId = insertUser.rows[0].id;
        console.log(`Đã tạo tài khoản: ${acc.email}`);
      } else {
        userId = userRes.rows[0].id;
        console.log(`Tài khoản đã tồn tại: ${acc.email}`);
      }

      // 2. Add to project_members
      const memberRes = await client.query(
        "SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2",
        [projectId, userId]
      );
      if (memberRes.rows.length === 0) {
        await client.query(
          "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)",
          [projectId, userId, acc.role]
        );
        console.log(`Đã thêm ${acc.email} vào dự án Plaza với vai trò ${acc.role}`);
      } else {
        await client.query(
          "UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3",
          [acc.role, projectId, userId]
        );
        console.log(`Đã cập nhật vai trò ${acc.role} cho ${acc.email} trong dự án Plaza`);
      }
    }

    await client.query("COMMIT");
    console.log("Hoàn tất thêm thành viên vào dự án Plaza!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Lỗi:", error.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedPlazaMembers();
