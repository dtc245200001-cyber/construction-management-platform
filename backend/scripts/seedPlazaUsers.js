"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env"), override: true });

const db = require("../config/db");
const argon2 = require("argon2");

async function seed() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    console.log("1. Khởi tạo / Tìm Dự án Plaza...");
    let projRes = await client.query("SELECT id, name FROM projects WHERE name ILIKE '%Plaza%' LIMIT 1");
    let plazaId;
    if (projRes.rows.length === 0) {
      const newProj = await client.query(
        `INSERT INTO projects (name, status, start_date)
         VALUES ('Plaza', 'Đang thi công', CURRENT_DATE)
         RETURNING id, name`
      );
      plazaId = newProj.rows[0].id;
      console.log(`Đã tạo dự án mới: ID ${plazaId} - Plaza`);
    } else {
      plazaId = projRes.rows[0].id;
      console.log(`Đã tìm thấy dự án Plaza: ID ${plazaId}`);
    }

    console.log("2. Khởi tạo danh sách tài khoản...");
    const accounts = [
      {
        name: "Ban quản lý Plaza",
        email: "banquanly@cong-truong-360.vn",
        role: "ban_quan_ly",
        password: "password123",
      },
      {
        name: "Chỉ huy trưởng Plaza",
        email: "chihuytruong@cong-truong-360.vn",
        role: "chi_huy_truong",
        password: "password123",
      },
      {
        name: "Chủ đầu tư Plaza",
        email: "chudautu@cong-truong-360.vn",
        role: "chu_dau_tu",
        password: "password123",
      },
      {
        name: "Đội trưởng – Đội A",
        email: "doitruong@cong-truong-360.vn",
        role: "doi_truong",
        password: "password123",
      },
      {
        name: "Đội trưởng – Đội B",
        email: "huong@gmail.com",
        role: "doi_truong",
        password: "password123", // Mật khẩu mặc định
      },
      {
        name: "Kế toán Plaza",
        email: "ketoan@cong-truong-360.vn",
        role: "ke_toan",
        password: "password123",
      },
      {
        name: "Kỹ sư giám sát Plaza",
        email: "kysugiamsat@cong-truong-360.vn",
        role: "ky_su_giam_sat",
        password: "password123",
      },
    ];

    for (const acc of accounts) {
      const hash = await argon2.hash(acc.password);
      const userRes = await client.query(
        `INSERT INTO users (name, email, password_hash, is_system_admin, is_verified, role_id)
         VALUES ($1, $2, $3, false, true, (SELECT id FROM roles WHERE name = $4 LIMIT 1))
         ON CONFLICT (email)
         DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           is_verified = true,
           role_id = EXCLUDED.role_id
         RETURNING id, name, email`,
        [acc.name, acc.email.toLowerCase(), hash, acc.role]
      );
      const userId = userRes.rows[0].id;

      // Gán vào project_members của dự án Plaza
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, user_id)
         DO UPDATE SET role = EXCLUDED.role`,
        [plazaId, userId, acc.role]
      );

      console.log(`- Tài khoản ${acc.email} (${acc.role}): OK`);
    }

    // Đảm bảo admin@congtrinh.vn cũng là thành viên của Plaza
    const adminUser = await client.query("SELECT id FROM users WHERE email = 'admin@congtrinh.vn'");
    if (adminUser.rows.length > 0) {
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role)
         VALUES ($1, $2, 'ban_quan_ly')
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [plazaId, adminUser.rows[0].id]
      );
    }

    console.log("3. Khởi tạo các hạng mục công việc mẫu cho dự án Plaza...");
    const wiCheck = await client.query("SELECT count(*)::int as count FROM work_items WHERE project_id = $1", [plazaId]);
    if (wiCheck.rows[0].count === 0) {
      await client.query(
        `INSERT INTO work_items (project_id, code, name, unit, quantity, unit_price)
         VALUES 
           ($1, 'HM-01', 'Hạng mục Móng công trình', 'm3', 100.000, 1500000),
           ($1, 'HM-02', 'Hạng mục Phần thân', 'm3', 250.000, 2000000),
           ($1, 'HM-03', 'Hạng mục Hoàn thiện', 'm2', 500.000, 350000),
           ($1, 'HM-04', 'DEMO HANG MUC 1', 'm3', 50.000, 1200000)`,
        [plazaId]
      );
      console.log("Đã tạo 4 hạng mục mẫu cho dự án Plaza");
    }

    await client.query("COMMIT");
    console.log("=== HOÀN TẤT SEED TÀI KHOẢN VÀ DỰ ÁN PLAZA ===");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Lỗi khi seed:", err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

seed();
