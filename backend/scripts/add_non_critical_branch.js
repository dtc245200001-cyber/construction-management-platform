require('dotenv').config();
const db = require('../config/db');
const { calculateAndSaveSchedule } = require('../services/scheduleCalculation');

async function run() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    // 1. Lấy ID các công việc liên quan
    const res = await client.query(`SELECT id, name FROM tasks WHERE work_item_id IN (24, 25)`);
    const tasks = res.rows;
    const tBetongSanT1 = tasks.find(t => t.name === 'Đổ bê tông sàn tầng 1').id;
    const _txayTuongT1 = tasks.find(t => t.name === 'Xây tường tầng 1').id;
    const tTratTuong = tasks.find(t => t.name === 'Trát tường').id;
    
    // 2. Thêm task "Lắp đặt điện nước tầng 1" (thời gian 2 ngày) vào "Hạng mục Phần thân" (id 24)
    const insertTaskRes = await client.query(
      `INSERT INTO tasks (work_item_id, name, duration_days) VALUES (24, 'Lắp đặt điện nước tầng 1', 2) RETURNING id`
    );
    const tDienNuoc = insertTaskRes.rows[0].id;
    
    // 3. Thêm Dependencies
    // Bê tông sàn -> FS -> Điện nước
    await client.query(
      `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days) VALUES ($1, $2, 'FS', 0)`,
      [tBetongSanT1, tDienNuoc]
    );
    
    // Điện nước -> FS -> Trát tường
    await client.query(
      `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days) VALUES ($1, $2, 'FS', 0)`,
      [tDienNuoc, tTratTuong]
    );
    
    await client.query("COMMIT");
    console.log("Đã thêm nhánh Lắp đặt điện nước thành công!");
    
    // Xóa kết quả cũ để tính lại toàn bộ (đảm bảo cập nhật)
    await db.query(`DELETE FROM schedule_results WHERE task_id IN (SELECT id FROM tasks WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = 13))`);
    
    // 4. Tính lại CPM
    await calculateAndSaveSchedule(13);
    
    // 5. In kết quả
    const scheduleRes = await db.query(
      `SELECT t.name, sr.is_critical, sr.early_start, sr.early_finish, sr.total_float 
       FROM schedule_results sr 
       JOIN tasks t ON t.id = sr.task_id 
       JOIN work_items w ON w.id = t.work_item_id 
       WHERE w.project_id = 13 
       ORDER BY sr.early_start ASC, t.id ASC`
    );
    console.table(scheduleRes.rows);
    
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Lỗi:", err);
  } finally {
    client.release();
    process.exit();
  }
}
run();
