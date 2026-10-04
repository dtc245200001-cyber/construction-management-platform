"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const { calculateAndSaveSchedule } = require("../services/scheduleCalculation");
const { getScheduleResults } = require("../services/scheduleQuery");

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("=== BẮT ĐẦU SEED & TÍNH TIẾN ĐỘ TRÊN DATABASE THẬT ===");

    // 1. Kiểm tra Project 13
    const projRes = await client.query(
      "SELECT id, name, code, start_date FROM projects WHERE id = $1",
      [13]
    );

    if (projRes.rows.length === 0) {
      throw new Error("Không tìm thấy dự án ID 13");
    }

    const project = projRes.rows[0];
    console.log(`\n1. Đã chọn dự án ID ${project.id}: "${project.name}" (Mã: ${project.code}, Ngày khởi công: ${project.start_date.toISOString()})`);

    // 2. Tạo hoặc lấy 1 hạng mục lá (work_item) duy nhất cho dự án 13
    let workItemId;
    const existingWi = await client.query(
      "SELECT id, name, code FROM work_items WHERE project_id = $1 LIMIT 1",
      [project.id]
    );

    if (existingWi.rows.length > 0) {
      workItemId = existingWi.rows[0].id;
      console.log(`2. Sử dụng hạng mục lá có sẵn: ID ${workItemId} ("${existingWi.rows[0].name}")`);
    } else {
      const newWi = await client.query(
        `INSERT INTO work_items (project_id, code, name)
         VALUES ($1, 'HM-MONG', 'Hạng mục Móng công trình')
         RETURNING id, code, name`,
        [project.id]
      );
      workItemId = newWi.rows[0].id;
      console.log(`2. Đã tạo hạng mục lá: ID ${workItemId} ("${newWi.rows[0].name}", Mã: ${newWi.rows[0].code})`);
    }

    // 3. Seed đúng 2 công việc độc lập chung 1 hạng mục này
    // Kiểm tra xem đã có task chưa, nếu chưa thì tạo
    const existingTasks = await client.query(
      "SELECT id, name, duration_days FROM tasks WHERE work_item_id = $1 ORDER BY id ASC",
      [workItemId]
    );

    let taskId1, taskId2;
    if (existingTasks.rows.length >= 2) {
      taskId1 = existingTasks.rows[0].id;
      taskId2 = existingTasks.rows[1].id;
      console.log(`3. Công việc đã có: Task 1: ID ${taskId1} ("${existingTasks.rows[0].name}", ${existingTasks.rows[0].duration_days} ngày), Task 2: ID ${taskId2} ("${existingTasks.rows[1].name}", ${existingTasks.rows[1].duration_days} ngày)`);
    } else {
      const t1 = await client.query(
        `INSERT INTO tasks (work_item_id, name, duration_days)
         VALUES ($1, 'Đào móng', 3)
         RETURNING id, name, duration_days`,
        [workItemId]
      );
      taskId1 = t1.rows[0].id;

      const t2 = await client.query(
        `INSERT INTO tasks (work_item_id, name, duration_days)
         VALUES ($1, 'Ép cọc', 5)
         RETURNING id, name, duration_days`,
        [workItemId]
      );
      taskId2 = t2.rows[0].id;

      console.log(`3. Đã seed 2 công việc vào cùng 1 hạng mục ID ${workItemId}:`);
      console.log(`   - Task 1: ID ${taskId1} - "Đào móng" (3 ngày)`);
      console.log(`   - Task 2: ID ${taskId2} - "Ép cọc" (5 ngày)`);
    }

    // 4. Seed quan hệ dependencies (loại FS: Task 1 -> Task 2)
    const existingDep = await client.query(
      "SELECT * FROM dependencies WHERE predecessor_id = $1 AND successor_id = $2",
      [taskId1, taskId2]
    );

    if (existingDep.rows.length === 0) {
      await client.query(
        `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days)
         VALUES ($1, $2, 'FS', 0)`,
        [taskId1, taskId2]
      );
      console.log(`4. Đã seed quan hệ: Task ${taskId1} ("Đào móng") → [FS] → Task ${taskId2} ("Ép cọc")`);
    } else {
      console.log(`4. Quan hệ đã tồn tại: Task ${taskId1} → [FS] → Task ${taskId2}`);
    }

    // 5. Gọi hàm tính tiến độ CPM
    console.log("\n5. Kích hoạt tính tiến độ CPM (calculateAndSaveSchedule)...");
    const calcResult = await calculateAndSaveSchedule(project.id);
    console.log(`   -> Kết quả hàm trả về: savedCount = ${calcResult.savedCount}`);

    // 6. SELECT trực tiếp từ bảng schedule_results
    console.log("\n6. SELECT trực tiếp bảng schedule_results trên DB thật:");
    const directResults = await client.query(
      `SELECT
         sr.id,
         sr.task_id,
         t.name AS task_name,
         wi.name AS work_item_name,
         sr.early_start,
         sr.early_finish,
         sr.late_start,
         sr.late_finish,
         sr.total_float,
         sr.is_critical
       FROM schedule_results sr
       JOIN tasks t ON t.id = sr.task_id
       JOIN work_items wi ON wi.id = t.work_item_id
       WHERE wi.project_id = $1
       ORDER BY sr.early_start ASC, t.id ASC`,
      [project.id]
    );

    console.log(`   -> Tổng số dòng lưu trong bảng schedule_results: ${directResults.rows.length} dòng`);
    console.table(directResults.rows);

    // 7. Gọi hàm query getScheduleResults để kiểm tra API endpoint format
    console.log("\n7. Kiểm tra dữ liệu trả về qua getScheduleResults(projectId):");
    const queryResults = await getScheduleResults(project.id);
    console.table(queryResults);

  } catch (err) {
    console.error("Lỗi:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
