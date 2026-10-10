require('dotenv').config();
const db = require('./config/db');

async function restore() {
  try {
    await db.query(`
      INSERT INTO projects (
        id, name, location, start_date, created_at, updated_at, code, status, 
        sprint_length_weeks, actual_progress, planned_progress, province, 
        project_type, stage, description, cover_image_url, expected_completion_date, 
        is_public, normalized_search_text
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 
        $9, $10, $11, $12, 
        $13, $14, $15, $16, $17, 
        $18, $19
      )
    `, [
      13, 'huong', 'Bac Giang', '2026-10-01T17:00:00.000Z', '2026-10-02T09:00:41.556Z', '2026-10-02T09:00:41.556Z', 'h-29-08-2006', 'Chuẩn bị',
      3, 0, 0, null,
      null, null, null, null, null,
      false, 'huong  '
    ]);
    console.log("Khôi phục dự án thành công!");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

restore();
