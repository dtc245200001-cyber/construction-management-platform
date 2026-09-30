const { Pool } = require("pg");
const argon2 = require("argon2");
require("dotenv").config({ path: __dirname + "/../.env" });

async function seed() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      process.env.LOCAL_DATABASE_URL ||
      `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  });

  try {
    const hash = await argon2.hash("password123", {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const getRoleId = async (name) => {
      let res = await pool.query(`SELECT id FROM roles WHERE name = $1`, [name]);
      if (res.rows.length === 0) {
        res = await pool.query(`INSERT INTO roles (name, description) VALUES ($1, $1) RETURNING id`, [name]);
      }
      return res.rows[0].id;
    }
    
    // Roles mapping
    const bqlRole = await getRoleId('ban_quan_ly');
    const chtRole = await getRoleId('chi_huy_truong');
    const dtRole = await getRoleId('doi_truong');

    const usersData = [
      { email: 'huonglan@cong-truong-360.vn', name: 'Hương Lan', roleId: bqlRole },
      { email: 'quocbao@cong-truong-360.vn', name: 'Trần Quốc Bảo', roleId: chtRole },
      { email: 'vanhai@cong-truong-360.vn', name: 'Nguyễn Văn Hải', roleId: dtRole }
    ];

    const users = {};
    for (const u of usersData) {
      const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [u.email]);
      let uid;
      if (existing.rows.length > 0) {
        uid = existing.rows[0].id;
        await pool.query(`UPDATE users SET password_hash = $1, role_id = $2 WHERE id = $3`, [hash, u.roleId, uid]);
      } else {
        const res = await pool.query(
          `INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, $3, $4) RETURNING id`,
          [u.name, u.email, hash, u.roleId]
        );
        uid = res.rows[0].id;
      }
      users[u.email] = uid;
    }

    // Projects
    const projectsData = [
      { name: "Tổ hợp thương mại An Phú", code: "APC-2026-01", status: "Đang thực hiện", start_date: "2026-09-25", sprint: 1, actual: 68, planned: 72 },
      { name: "Nhà xưởng Bình Dương", code: "BDX-2026-04", status: "Chuẩn bị", start_date: "2026-10-10", sprint: 1, actual: 22, planned: 50 },
    ];
    
    const projects = {};
    for (const p of projectsData) {
      let res = await pool.query(`SELECT id FROM projects WHERE code = $1`, [p.code]);
      if (res.rows.length === 0) {
        res = await pool.query(
          `INSERT INTO projects (name, code, status, start_date, sprint_length_weeks, actual_progress, planned_progress) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [p.name, p.code, p.status, p.start_date, p.sprint, p.actual, p.planned]
        );
      } else {
        await pool.query(
          `UPDATE projects SET status=$2, start_date=$3, sprint_length_weeks=$4, actual_progress=$5, planned_progress=$6 WHERE code=$1`,
          [p.code, p.status, p.start_date, p.sprint, p.actual, p.planned]
        );
      }
      projects[p.code] = res.rows[0].id;
    }

    // Memberships
    await pool.query('DELETE FROM project_members WHERE user_id = ANY($1)', [Object.values(users)]);

    const members = [
      { p: "APC-2026-01", u: "huonglan@cong-truong-360.vn", r: "ban_quan_ly" },
      { p: "BDX-2026-04", u: "huonglan@cong-truong-360.vn", r: "ban_quan_ly" },
      { p: "APC-2026-01", u: "quocbao@cong-truong-360.vn", r: "chi_huy_truong" },
      { p: "BDX-2026-04", u: "vanhai@cong-truong-360.vn", r: "doi_truong" },
    ];

    for (const m of members) {
      await pool.query(
        `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)`,
        [projects[m.p], users[m.u], m.r]
      );
    }
    console.log("Seed completed successfully!");
  } catch(e) {
    console.error("Seeding failed", e);
  } finally {
    pool.end();
  }
}

seed();
