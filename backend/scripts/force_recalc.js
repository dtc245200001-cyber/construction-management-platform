require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const { calculateAndSaveSchedule } = require('../services/scheduleCalculation');

async function forceRecalculate() {
  try {
    const projectId = 23;
    console.log("Forcing recalculation for Project 23...");
    
    // Đánh dấu dirty cho toàn bộ kết quả của dự án này
    await pool.query(
      `UPDATE schedule_results sr 
       SET needs_recalculation = true 
       FROM tasks t, work_items wi 
       WHERE sr.task_id = t.id AND t.work_item_id = wi.id AND wi.project_id = $1`,
      [projectId]
    );
    
    // Tính toán lại
    const result = await calculateAndSaveSchedule(projectId);
    console.log("Recalculate Result:", result.recalculated);
    
    console.log("Đã tính toán xong. Bạn có thể F5 lại trang Gantt.");
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

forceRecalculate();
