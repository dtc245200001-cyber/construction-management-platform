require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const { calculateAndSaveSchedule } = require('../services/scheduleCalculation');

async function seedTestProject() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // 1. Tạo project
    const projRes = await client.query(
      `INSERT INTO projects (name, code, status, start_date) VALUES ('Dự án Test Orange', 'ORG-02', 'Đang thực hiện', CURRENT_DATE) RETURNING id`
    );
    const projectId = projRes.rows[0].id;
    
    // Tạo lịch
    await client.query(
      `INSERT INTO calendars (project_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
       VALUES ($1, true, true, true, true, true, true, false)`, [projectId]
    );

    // Thêm tất cả user vào dự án
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       SELECT $1, id, 'chi_huy_truong' FROM users`, [projectId]
    );

    // 2. Tạo WBS
    const wbsRes = await client.query(
      `INSERT INTO work_items (project_id, name) VALUES ($1, 'Hạng mục chính') RETURNING id`, [projectId]
    );
    const wbsId = wbsRes.rows[0].id;

    // 3. Tạo Tasks
    // Path 1 (Ngắn): A -> B
    const aRes = await client.query(`INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task A', 5) RETURNING id`, [wbsId]);
    const bRes = await client.query(`INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task B', 5) RETURNING id`, [wbsId]);
    
    // Path 2 (Dài - Critical Gốc): X -> Y
    const xRes = await client.query(`INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task X', 10) RETURNING id`, [wbsId]);
    const yRes = await client.query(`INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Task Y', 10) RETURNING id`, [wbsId]);

    const taskIdA = aRes.rows[0].id;
    const taskIdB = bRes.rows[0].id;
    const taskIdX = xRes.rows[0].id;
    const taskIdY = yRes.rows[0].id;

    // 4. Liên kết
    await client.query(`INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days) VALUES ($1, $2, 'FS', 0)`, [taskIdA, taskIdB]);
    await client.query(`INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days) VALUES ($1, $2, 'FS', 0)`, [taskIdX, taskIdY]);

    await client.query("COMMIT");
    
    console.log(`Dự án ID: ${projectId}. Đang tính toán Baseline...`);
    
    // 5. Tính toán lần đầu -> Chốt baseline
    await calculateAndSaveSchedule(projectId);

    // 6. Cố tình làm trễ Task A để nó thành Critical Path mới
    console.log("Cập nhật Task A kéo dài thành 25 ngày để vượt qua Path X-Y...");
    await client.query(`UPDATE tasks SET duration_days = 25 WHERE id = $1`, [taskIdA]);
    
    // 7. Tính toán lại
    console.log("Tính toán lại lần 2...");
    await calculateAndSaveSchedule(projectId);

    console.log(`Hoàn tất! Hãy vào giao diện, tìm dự án "Dự án Test Orange" (hoặc nhập url /projects/${projectId}/gantt) để xem màu cam ở Task A và Task B.`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
  } finally {
    client.release();
    pool.end();
  }
}

seedTestProject();
