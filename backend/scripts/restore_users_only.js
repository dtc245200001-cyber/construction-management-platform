"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

// 🛡️ GUARD: Chặn ghi production — chỉ chạy trên localhost/test DB
try { require('./_production-guard')(__filename.split('/').pop() || 'script.js'); } catch(e) { console.error(e.message); process.exit(1); }

const { Pool } = require("pg");
const argon2 = require("argon2");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("1. Đảm bảo các vai trò (roles) tồn tại...");
    const roles = [
      "ban_quan_ly",
      "chi_huy_truong",
      "chu_dau_tu",
      "doi_truong",
      "ke_toan",
      "ky_su_giam_sat"
    ];
    for (const r of roles) {
      await client.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }

    console.log("2. Khởi tạo danh sách tài khoản có sẵn...");
    const accounts = [
      {
        name: "System Admin",
        email: "admin@congtrinh.vn",
        role: "ban_quan_ly",
        is_admin: true,
        password: "admin123"
      },
      {
        name: "Ban quản lý Plaza",
        email: "banquanly@cong-truong-360.vn",
        role: "ban_quan_ly",
        is_admin: false,
        password: "password123"
      },
      {
        name: "Chỉ huy trưởng Plaza",
        email: "chihuytruong@cong-truong-360.vn",
        role: "chi_huy_truong",
        is_admin: false,
        password: "password123"
      },
      {
        name: "Chủ đầu tư Plaza",
        email: "chudautu@cong-truong-360.vn",
        role: "chu_dau_tu",
        is_admin: false,
        password: "password123"
      },
      {
        name: "Đội trưởng – Đội A",
        email: "doitruong@cong-truong-360.vn",
        role: "doi_truong",
        is_admin: false,
        password: "password123"
      },
      {
        name: "Đội trưởng – Đội B",
        email: "huong@gmail.com",
        role: "doi_truong",
        is_admin: false,
        password: "password123"
      },
      {
        name: "Kế toán Plaza",
        email: "ketoan@cong-truong-360.vn",
        role: "ke_toan",
        is_admin: false,
        password: "password123"
      },
      {
        name: "Kỹ sư giám sát Plaza",
        email: "kysugiamsat@cong-truong-360.vn",
        role: "ky_su_giam_sat",
        is_admin: false,
        password: "password123"
      }
    ];

    const userMap = {};
    for (const acc of accounts) {
      const hash = await argon2.hash(acc.password);
      const res = await client.query(
        `INSERT INTO users (name, email, password_hash, is_system_admin, is_verified, role_id)
         VALUES ($1, $2, $3, $4, true, (SELECT id FROM roles WHERE name = $5 LIMIT 1))
         ON CONFLICT (email)
         DO UPDATE SET
           name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           is_system_admin = EXCLUDED.is_system_admin,
           is_verified = true,
           failed_login_attempts = 0,
           locked_until = NULL,
           role_id = EXCLUDED.role_id
         RETURNING id, name, email`,
        [acc.name, acc.email.toLowerCase(), hash, acc.is_admin, acc.role]
      );
      userMap[acc.email.toLowerCase()] = { id: res.rows[0].id, role: acc.role };
      console.log(`- Tài khoản ${acc.email} (Role: ${acc.role}): OK`);
    }

    console.log("3. Gán thành viên vào các dự án hiện có...");
    const projectsRes = await client.query("SELECT id, name FROM projects");
    for (const proj of projectsRes.rows) {
      for (const [email, u] of Object.entries(userMap)) {
        await client.query(
          `INSERT INTO project_members (project_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (project_id, user_id)
           DO UPDATE SET role = EXCLUDED.role`,
          [proj.id, u.id, u.role]
        );
      }
      console.log(`- Đã cập nhật thành viên cho dự án: ${proj.name} (ID: ${proj.id})`);
    }

    await client.query("COMMIT");
    console.log("=== HOÀN TẤT NẠP TÀI KHOẢN VÀ PHÂN QUYỀN ===");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Lỗi:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
