require('dotenv').config();
const { calculateAndSaveSchedule } = require('../services/scheduleCalculation');
const db = require('../config/db');
async function run() {
  try {
    await calculateAndSaveSchedule(13);
    const scheduleRes = await db.query(`SELECT t.name, sr.is_critical, sr.early_start, sr.early_finish, sr.total_float FROM schedule_results sr JOIN tasks t ON t.id = sr.task_id JOIN work_items w ON w.id = t.work_item_id WHERE w.project_id = 13 ORDER BY sr.early_start ASC, t.id ASC`);
    console.table(scheduleRes.rows);
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  process.exit();
}
run();
