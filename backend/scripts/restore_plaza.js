"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

// 🛡️ GUARD: Chặn ghi production — chỉ chạy trên localhost/test DB
try { require('./_production-guard')(__filename.split('/').pop() || 'script.js'); } catch(e) { console.error(e.message); process.exit(1); }

const { Pool } = require("pg");
const argon2 = require("argon2");
const { calculateAndSaveSchedule } = require("../services/scheduleCalculation");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function restore() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("1. Khôi phục Roles nếu thiếu...");
    const roles = ["ban_quan_ly", "chi_huy_truong", "chu_dau_tu", "doi_truong", "ke_toan", "ky_su_giam_sat"];
    for (const r of roles) {
      await client.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [r]);
    }

    console.log("2. Khôi phục danh sách Users...");
    const accounts = [
      {
        name: "System Admin",
        email: "admin@congtrinh.vn",
        role: "ban_quan_ly",
        is_admin: true,
        password: "password123"
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

    const userIds = {};
    for (const acc of accounts) {
      const hash = await argon2.hash(acc.password);
      const res = await client.query(`
        INSERT INTO users (name, email, password_hash, is_system_admin, is_verified, role_id)
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
        RETURNING id, email
      `, [acc.name, acc.email.toLowerCase(), hash, acc.is_admin, acc.role]);
      userIds[acc.email.toLowerCase()] = res.rows[0].id;
    }

    console.log("3. Khôi phục Dự án Plaza & Huong...");
    // Project Plaza
    let plazaRes = await client.query("SELECT id FROM projects WHERE name ILIKE '%Plaza%' LIMIT 1");
    let plazaId;
    if (plazaRes.rows.length === 0) {
      const p = await client.query("INSERT INTO projects (name, status, start_date) VALUES ('Plaza', 'Đang thi công', '2026-10-13') RETURNING id");
      plazaId = p.rows[0].id;
    } else {
      plazaId = plazaRes.rows[0].id;
      await client.query("UPDATE projects SET start_date = '2026-10-13', status = 'Đang thi công' WHERE id = $1", [plazaId]);
    }
    console.log(`- Project Plaza ID: ${plazaId}`);

    // Project Huong
    let huongRes = await client.query("SELECT id FROM projects WHERE name ILIKE '%Huong%' LIMIT 1");
    let huongId;
    if (huongRes.rows.length === 0) {
      const p = await client.query("INSERT INTO projects (name, status, start_date) VALUES ('Huong', 'Đang thi công', '2026-10-13') RETURNING id");
      huongId = p.rows[0].id;
    } else {
      huongId = huongRes.rows[0].id;
      await client.query("UPDATE projects SET start_date = '2026-10-13', status = 'Đang thi công' WHERE id = $1", [huongId]);
    }
    console.log(`- Project Huong ID: ${huongId}`);

    // Project calendar for Plaza & Huong
    for (const pid of [plazaId, huongId]) {
      await client.query(`
        INSERT INTO calendars (project_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
        VALUES ($1, true, true, true, true, true, true, false)
        ON CONFLICT (project_id) DO UPDATE SET
          monday = true, tuesday = true, wednesday = true, thursday = true, friday = true, saturday = true, sunday = false
      `, [pid]);
    }

    console.log("4. Thêm thành viên vào cả 2 dự án...");
    for (const acc of accounts) {
      const uid = userIds[acc.email.toLowerCase()];
      for (const pid of [plazaId, huongId]) {
        await client.query(`
          INSERT INTO project_members (project_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
        `, [pid, uid, acc.role]);
      }
    }

    console.log("5. Khởi tạo Work Items & Tasks cho Plaza...");
    const wiDefs = [
      { code: "HM-01", name: "Hạng mục Móng công trình" },
      { code: "HM-02", name: "Hạng mục Phần thân" },
      { code: "HM-03", name: "Hạng mục Hoàn thiện" },
      { code: "HM-04", name: "DEMO HANG MUC 1" }
    ];

    const wiIds = {};
    for (const w of wiDefs) {
      let r = await client.query("SELECT id FROM work_items WHERE project_id = $1 AND name = $2 LIMIT 1", [plazaId, w.name]);
      if (r.rows.length === 0) {
        r = await client.query("INSERT INTO work_items (project_id, code, name, type, status) VALUES ($1, $2, $3, 'category', 'Chưa bắt đầu') RETURNING id", [plazaId, w.code, w.name]);
      }
      wiIds[w.name] = r.rows[0].id;
    }

    // Tasks for Plaza
    const taskDefs = [
      { name: "Ép cọc", duration: 3, wi: "Hạng mục Móng công trình" },
      { name: "Đổ bê tông lót", duration: 2, wi: "Hạng mục Móng công trình" },
      { name: "Đổ bê tông đài móng", duration: 4, wi: "Hạng mục Móng công trình" },
      { name: "Thi công hàng rào tạm", duration: 3, wi: "Hạng mục Móng công trình" }, // Non-critical #1
      { name: "Dựng cốt thép tầng 1", duration: 3, wi: "Hạng mục Phần thân" },
      { name: "Đổ bê tông cột tầng 1", duration: 2, wi: "Hạng mục Phần thân" },
      { name: "Đổ bê tông sàn tầng 1", duration: 3, wi: "Hạng mục Phần thân" },
      { name: "Xây tường tầng 1", duration: 4, wi: "Hạng mục Phần thân" },
      { name: "Trát tường", duration: 3, wi: "Hạng mục Hoàn thiện" },
      { name: "Sơn nước", duration: 3, wi: "Hạng mục Hoàn thiện" },
      { name: "HM 1-1", duration: 2, wi: "DEMO HANG MUC 1" } // Non-critical #2
    ];

    const taskMap = {};
    for (const td of taskDefs) {
      const wId = wiIds[td.wi];
      let tRes = await client.query("SELECT id FROM tasks WHERE work_item_id = $1 AND name = $2 LIMIT 1", [wId, td.name]);
      if (tRes.rows.length === 0) {
        tRes = await client.query("INSERT INTO tasks (work_item_id, name, duration_days, scheduling_mode) VALUES ($1, $2, $3, 'auto') RETURNING id", [wId, td.name, td.duration]);
      } else {
        await client.query("UPDATE tasks SET duration_days = $1, scheduling_mode = 'auto', manual_start_date = NULL, actual_start_date = NULL, actual_end_date = NULL WHERE id = $2", [td.duration, tRes.rows[0].id]);
      }
      taskMap[td.name] = tRes.rows[0].id;
    }

    console.log("6. Khởi tạo Dependencies cho Plaza...");
    const allTaskIds = Object.values(taskMap);
    await client.query("DELETE FROM dependencies WHERE predecessor_id = ANY($1) OR successor_id = ANY($1)", [allTaskIds]);

    const deps = [
      // Critical chain
      { from: taskMap["Ép cọc"], to: taskMap["Đổ bê tông lót"], type: "FS", lag: 0 },
      { from: taskMap["Đổ bê tông lót"], to: taskMap["Đổ bê tông đài móng"], type: "FS", lag: 0 },
      { from: taskMap["Đổ bê tông đài móng"], to: taskMap["Dựng cốt thép tầng 1"], type: "FS", lag: 0 },
      { from: taskMap["Dựng cốt thép tầng 1"], to: taskMap["Đổ bê tông cột tầng 1"], type: "FS", lag: 0 },
      { from: taskMap["Đổ bê tông cột tầng 1"], to: taskMap["Đổ bê tông sàn tầng 1"], type: "FS", lag: 0 },
      { from: taskMap["Đổ bê tông sàn tầng 1"], to: taskMap["Xây tường tầng 1"], type: "FS", lag: 0 },
      { from: taskMap["Xây tường tầng 1"], to: taskMap["Trát tường"], type: "FS", lag: 0 },
      { from: taskMap["Trát tường"], to: taskMap["Sơn nước"], type: "FS", lag: 0 },

      // Non-critical #1: Thi công hàng rào tạm (Float = 2)
      { from: taskMap["Ép cọc"], to: taskMap["Thi công hàng rào tạm"], type: "FS", lag: 1 },
      { from: taskMap["Thi công hàng rào tạm"], to: taskMap["Dựng cốt thép tầng 1"], type: "FS", lag: 0 },

      // Non-critical #2: HM 1-1 (Float = 1)
      { from: taskMap["Đổ bê tông sàn tầng 1"], to: taskMap["HM 1-1"], type: "FS", lag: 1 },
      { from: taskMap["HM 1-1"], to: taskMap["Trát tường"], type: "FS", lag: 0 }
    ];

    for (const d of deps) {
      await client.query("INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days) VALUES ($1, $2, $3, $4)", [d.from, d.to, d.type, d.lag]);
    }

    // Work items cho Huong nếu chưa có
    for (const w of wiDefs) {
      let r = await client.query("SELECT id FROM work_items WHERE project_id = $1 AND name = $2 LIMIT 1", [huongId, w.name]);
      if (r.rows.length === 0) {
        await client.query("INSERT INTO work_items (project_id, code, name, type, status) VALUES ($1, $2, $3, 'category', 'Chưa bắt đầu')", [huongId, w.code, w.name]);
      }
    }

    await client.query("COMMIT");
    console.log("Hoàn tất commit cơ sở dữ liệu. Đang tính toán CPM cho Plaza...");

    await calculateAndSaveSchedule(plazaId);
    console.log("=== KHÔI PHỤC HOÀN TẤT DỰ ÁN PLAZA VÀ CPM ===");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Lỗi khi restore:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

restore();
