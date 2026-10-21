/**
 * seed-roles.js — T-04 Seed đầy đủ bộ tài khoản demo 6 vai trò
 * ─────────────────────────────────────────────────────────────────────────────
 * Tạo (hoặc cập nhật idempotent) 6 tài khoản demo chuẩn, mỗi tài khoản ứng
 * với 1 trong 6 vai trò dự án: chu_dau_tu, ban_quan_ly, ky_su_giam_sat,
 * chi_huy_truong, doi_truong, ke_toan.
 *
 * Gán tất cả vào mọi dự án hiện có theo đúng vai trò tương ứng.
 * Tài khoản admin@congtrinh.vn (is_system_admin) không bị thay đổi.
 *
 * 🛡️ Script bị CHẶN tự động nếu DATABASE_URL trỏ vào production.
 *
 * Chạy:
 *   cd backend
 *   node scripts/seed-roles.js
 */

"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env"), override: true });

// 🛡️ GUARD: Chặn chạy trên production
const guardProduction = require("./_production-guard");
guardProduction("seed-roles.js");

const { Pool } = require("pg");
const argon2 = require("argon2");

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 5433,
      database: process.env.DB_NAME || "construction_db",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres123",
    };

const pool = new Pool(poolConfig);

// ── Danh sách tài khoản demo ──────────────────────────────────────────────────
// Mỗi tài khoản: 1 vai trò chuẩn + email chuẩn hoá theo domain cong-truong-360.vn
const DEMO_ACCOUNTS = [
  {
    name: "Nguyễn Thị Mai",
    email: "chudautu@cong-truong-360.vn",
    role: "chu_dau_tu",
    label: "Chủ đầu tư",
  },
  {
    name: "Trần Hương Lan",
    email: "banquanly@cong-truong-360.vn",
    role: "ban_quan_ly",
    label: "Ban quản lý",
  },
  {
    name: "Lê Văn Minh",
    email: "kysugiamsat@cong-truong-360.vn",
    role: "ky_su_giam_sat",
    label: "Kỹ sư giám sát",
  },
  {
    name: "Trần Quốc Bảo",
    email: "chihuytruong@cong-truong-360.vn",
    role: "chi_huy_truong",
    label: "Chỉ huy trưởng",
  },
  {
    name: "Nguyễn Văn Hải",
    email: "doitruong@cong-truong-360.vn",
    role: "doi_truong",
    label: "Đội trưởng",
  },
  {
    name: "Phạm Thị Loan",
    email: "ketoan@cong-truong-360.vn",
    role: "ke_toan",
    label: "Kế toán",
  },
];

const DEMO_PASSWORD = "password123";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("🌱 seed-roles.js — T-04: Bắt đầu seed tài khoản demo 6 vai trò...\n");

    // ── 1. Lấy role map ─────────────────────────────────────────────────
    const { rows: roles } = await client.query("SELECT id, name FROM roles");
    const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

    const requiredRoles = DEMO_ACCOUNTS.map((a) => a.role);
    for (const r of requiredRoles) {
      if (!roleMap[r]) {
        throw new Error(
          `Vai trò '${r}' chưa có trong bảng roles. Chạy migration trước: npm run migrate`
        );
      }
    }
    console.log("✅ Roles đã tồn tại:", Object.keys(roleMap).join(", "));
    console.log();

    // ── 2. Hash password 1 lần dùng cho tất cả ────────────────────────
    const hash = await argon2.hash(DEMO_PASSWORD);

    // ── 3. Tạo / cập nhật users ───────────────────────────────────────
    const userIds = {};
    for (const acc of DEMO_ACCOUNTS) {
      const existing = await client.query(
        "SELECT id FROM users WHERE lower(email) = lower($1)",
        [acc.email]
      );

      if (existing.rows.length > 0) {
        const uid = existing.rows[0].id;
        // Cập nhật name, password_hash, role_id — KHÔNG đụng is_system_admin
        await client.query(
          `UPDATE users SET name = $1, password_hash = $2, role_id = $3
           WHERE id = $4 AND (is_system_admin IS NULL OR is_system_admin = false)`,
          [acc.name, hash, roleMap[acc.role], uid]
        );
        userIds[acc.email] = uid;
        console.log(`♻️  Cập nhật: ${acc.name} (${acc.email}) → ${acc.label}`);
      } else {
        const { rows } = await client.query(
          `INSERT INTO users (name, email, password_hash, role_id)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [acc.name, acc.email, hash, roleMap[acc.role]]
        );
        userIds[acc.email] = rows[0].id;
        console.log(`✅ Tạo mới: ${acc.name} (${acc.email}) → ${acc.label}`);
      }
    }
    console.log();

    // ── 4. Lấy tất cả dự án ───────────────────────────────────────────
    const { rows: projects } = await client.query("SELECT id, name FROM projects ORDER BY id");
    if (projects.length === 0) {
      console.log("⚠️  Chưa có dự án nào trong DB — bỏ qua gán thành viên.");
    } else {
      console.log(`📋 Gán thành viên vào ${projects.length} dự án:`);

      for (const project of projects) {
        console.log(`\n   📂 ${project.name} (id=${project.id})`);

        for (const acc of DEMO_ACCOUNTS) {
          const uid = userIds[acc.email];

          const existing = await client.query(
            "SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2",
            [project.id, uid]
          );

          if (existing.rows.length === 0) {
            await client.query(
              `INSERT INTO project_members (project_id, user_id, role, joined_at)
               VALUES ($1, $2, $3, current_timestamp)`,
              [project.id, uid, acc.role]
            );
            console.log(`      ✅ Gán: ${acc.name} → [${acc.role}]`);
          } else {
            // Cập nhật role nếu đã là thành viên (idempotent)
            await client.query(
              "UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3",
              [acc.role, project.id, uid]
            );
            console.log(`      ♻️  Cập nhật: ${acc.name} → [${acc.role}]`);
          }
        }
      }
    }

    await client.query("COMMIT");

    console.log("\n");
    console.log("═".repeat(65));
    console.log("🎉 Seed T-04 hoàn tất!");
    console.log("═".repeat(65));
    console.log("\nTài khoản demo (mật khẩu chung: password123)\n");
    console.log(
      "  Email                                   Vai trò"
    );
    console.log("  " + "─".repeat(60));
    for (const acc of DEMO_ACCOUNTS) {
      console.log(`  ${acc.email.padEnd(40)} ${acc.label}`);
    }
    console.log();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Lỗi — đã rollback:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
