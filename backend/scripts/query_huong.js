require('dotenv').config();
const db = require('../config/db');

async function run() {
  try {
    const p = await db.query("SELECT * FROM projects WHERE name ILIKE '%huong%'");
    const pid = p.rows[0].id;
    console.log('PID:', pid);
    
    const w = await db.query('SELECT * FROM work_items WHERE project_id = $1', [pid]);
    console.log('Work Items:', w.rows);
    
    const t = await db.query('SELECT * FROM tasks WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1)', [pid]);
    console.log('Tasks:', t.rows);
    
    const d = await db.query('SELECT * FROM dependencies WHERE predecessor_task_id IN (SELECT id FROM tasks WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = $1))', [pid]);
    console.log('Dependencies:', d.rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
