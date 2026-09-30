/**
 * seed-demo.js — Tạo dữ liệu demo cho môi trường local
 * Chạy: node scripts/seed-demo.js
 */

require("dotenv").config();
const { Pool } = require("pg");
const argon2 = require("argon2");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5433,
  database: process.env.DB_NAME || "construction_db",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres123",
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("🌱 Bắt đầu seed dữ liệu demo...\n");

    // ── 1. Lấy role IDs ──────────────────────────────────────────────
    const { rows: roles } = await client.query("SELECT id, name FROM roles");
    const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));
    console.log("✅ Roles:", Object.keys(roleMap).join(", "));

    // ── 2. Tạo users (hash password) ────────────────────────────────
    const PASSWORD = "password123";
    const hash = await argon2.hash(PASSWORD);

    const usersToCreate = [
      { name: "Hương Lan", email: "huonglan@cong-truong-360.vn", role: "ban_quan_ly" },
      { name: "Trần Quốc Bảo", email: "quocbao@cong-truong-360.vn", role: "chi_huy_truong" },
      { name: "Nguyễn Văn Hải", email: "vanhai@cong-truong-360.vn", role: "doi_truong" },
    ];

    const userIds = {};
    for (const u of usersToCreate) {
      const existing = await client.query("SELECT id FROM users WHERE email = $1", [u.email]);
      if (existing.rows.length > 0) {
        await client.query(
          "UPDATE users SET role_id = $1, password_hash = $2, name = $3 WHERE email = $4",
          [roleMap[u.role], hash, u.name, u.email]
        );
        userIds[u.email] = existing.rows[0].id;
        console.log("♻️  Cập nhật user: " + u.name + " (" + u.email + ") → " + u.role);
      } else {
        const { rows } = await client.query(
          "INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id",
          [u.name, u.email, hash, roleMap[u.role]]
        );
        userIds[u.email] = rows[0].id;
        console.log("✅ Tạo user: " + u.name + " (" + u.email + ") → " + u.role);
      }
    }

    // ── 3. Tạo dự án ──────────────────────────────────────────────────
    const projectsToCreate = [
      {
        name: "Tổ hợp thương mại An Phú",
        code: "TMAP-2024",
        location: "TP. Hồ Chí Minh",
        status: "Đang thi công",
        actual_progress: 35,
        planned_progress: 40,
      },
      {
        name: "Nhà xưởng Bình Dương",
        code: "NXBD-2024",
        location: "Bình Dương",
        status: "Chuẩn bị",
        actual_progress: 10,
        planned_progress: 15,
      },
    ];

    const projectIds = {};
    for (const p of projectsToCreate) {
      const existing = await client.query("SELECT id FROM projects WHERE code = $1", [p.code]);
      if (existing.rows.length > 0) {
        projectIds[p.code] = existing.rows[0].id;
        console.log("♻️  Dự án đã tồn tại: " + p.name);
      } else {
        const { rows } = await client.query(
          "INSERT INTO projects (name, code, location, status, actual_progress, planned_progress, sprint_length_weeks) VALUES ($1, $2, $3, $4, $5, $6, 2) RETURNING id",
          [p.name, p.code, p.location, p.status, p.actual_progress, p.planned_progress]
        );
        projectIds[p.code] = rows[0].id;
        console.log("✅ Tạo dự án: " + p.name + " (" + p.code + ")");
      }
    }

    // ── 4. Gán thành viên vào dự án ────────────────────────────────
    const memberships = [
      { email: "huonglan@cong-truong-360.vn", code: "TMAP-2024", role: "ban_quan_ly" },
      { email: "huonglan@cong-truong-360.vn", code: "NXBD-2024", role: "ban_quan_ly" },
      { email: "quocbao@cong-truong-360.vn", code: "TMAP-2024", role: "chi_huy_truong" },
      { email: "vanhai@cong-truong-360.vn", code: "NXBD-2024", role: "doi_truong" },
    ];

    for (const m of memberships) {
      const uid = userIds[m.email];
      const pid = projectIds[m.code];
      const existing = await client.query(
        "SELECT id FROM project_members WHERE user_id = $1 AND project_id = $2",
        [uid, pid]
      );
      if (existing.rows.length === 0) {
        await client.query(
          "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)",
          [pid, uid, m.role]
        );
        console.log("✅ Gán: " + m.email + " → " + m.code + " [" + m.role + "]");
      } else {
        await client.query(
          "UPDATE project_members SET role = $1 WHERE user_id = $2 AND project_id = $3",
          [m.role, uid, pid]
        );
        console.log("♻️  Cập nhật: " + m.email + " → " + m.code + " [" + m.role + "]");
      }
    }

    await client.query("COMMIT");
    console.log("\n🎉 Seed hoàn tất!");
    console.log("\nTài khoản demo:");
    console.log("  huonglan@cong-truong-360.vn / password123  (Ban quản lý - 2 dự án)");
    console.log("  quocbao@cong-truong-360.vn  / password123  (Chỉ huy trưởng - An Phú)");
    console.log("  vanhai@cong-truong-360.vn   / password123  (Đội trưởng - Bình Dương)");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Lỗi:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
