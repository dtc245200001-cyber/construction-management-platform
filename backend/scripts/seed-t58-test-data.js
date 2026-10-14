require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
try { require('./_production-guard')(require('path').basename(__filename)); } catch(e) { console.error(e.message); process.exit(1); }

// 🛡️ GUARD: Script này dùng hardcoded localhost:port — guard kiểm tra env nếu có, không chặn khi hardcoded localhost

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: "postgres://postgres:your_password@127.0.0.1:5433/construction_db"
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Seeding test data for T-58 / S-25 in Project 1...");

    // 1. Tạo work item category
    let wiRes = await client.query("SELECT id FROM work_items WHERE project_id = 1 AND name = 'Hạng mục Thi công Móng'");
    let workItemId;
    if (wiRes.rows.length === 0) {
      const ins = await client.query(
        "INSERT INTO work_items (project_id, name, type) VALUES (1, 'Hạng mục Thi công Móng', 'category') RETURNING id"
      );
      workItemId = ins.rows[0].id;
    } else {
      workItemId = wiRes.rows[0].id;
    }

    // 2. Tạo 4 tasks
    const tasksDef = [
      { name: "Đào đất hố móng", duration: 11, start: "2026-10-15", finish: "2026-10-25" },
      { name: "Gia công cốt thép móng", duration: 9, start: "2026-10-16", finish: "2026-10-24" },
      { name: "Lắp dựng cốp pha móng", duration: 11, start: "2026-10-18", finish: "2026-10-28" },
      { name: "Đổ bê tông lót và đài móng", duration: 4, start: "2026-10-20", finish: "2026-10-23" },
    ];

    for (const t of tasksDef) {
      let tRes = await client.query("SELECT id FROM tasks WHERE work_item_id = $1 AND name = $2", [workItemId, t.name]);
      let taskId;
      if (tRes.rows.length === 0) {
        const ins = await client.query(
          "INSERT INTO tasks (work_item_id, name, duration_days, manual_start_date) VALUES ($1, $2, $3, $4) RETURNING id",
          [workItemId, t.name, t.duration, t.start]
        );
        taskId = ins.rows[0].id;
      } else {
        taskId = tRes.rows[0].id;
        await client.query("UPDATE tasks SET duration_days = $1, manual_start_date = $2 WHERE id = $3", [t.duration, t.start, taskId]);
      }

      // Lưu schedule_results để CPM nhận diện ngày
      await client.query(
        `INSERT INTO schedule_results (task_id, early_start, early_finish, is_critical)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (task_id) DO UPDATE SET early_start = $2, early_finish = $3`,
        [taskId, t.start, t.finish]
      );
    }

    // 3. Tạo 2 tổ đội
    const teamsDef = ["Đội Thi Công Số 1", "Đội Thi Công Số 2"];
    for (const tName of teamsDef) {
      let teamRes = await client.query("SELECT id FROM teams WHERE project_id = 1 AND name = $1", [tName]);
      if (teamRes.rows.length === 0) {
        await client.query("INSERT INTO teams (project_id, name) VALUES (1, $1)", [tName]);
      }
    }

    // Reset các assignment cũ để người dùng test từ đầu
    await client.query("DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tasks WHERE work_item_id = $1)", [workItemId]);

    await client.query("COMMIT");
    console.log("✅ Seed thành công 4 công việc trùng lịch và 2 đội thi công cho Dự án 1!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Lỗi:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
