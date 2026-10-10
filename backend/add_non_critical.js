require("dotenv").config();
const db = require("./config/db");

async function addNonCriticalTask() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    const projectId = 13;

    // Lấy work_item_id của "Hạng mục Móng công trình"
    const catRes = await client.query("SELECT id FROM work_items WHERE project_id = $1 AND name = 'Hạng mục Móng công trình' LIMIT 1", [projectId]);
    const catId = catRes.rows[0].id;

    // Lấy ID của Đào móng và Đổ bê tông lót
    const taskRes = await client.query("SELECT id, name FROM tasks WHERE work_item_id = $1", [catId]);
    const tDaoMong = taskRes.rows.find(t => t.name === 'Đào móng').id;
    const tBetongLot = taskRes.rows.find(t => t.name === 'Đổ bê tông lót').id;

    // 1. Thêm công việc "Thi công hàng rào tạm" (không găng)
    const insertRes = await client.query(
      "INSERT INTO tasks (work_item_id, name, duration_days) VALUES ($1, 'Thi công hàng rào tạm', 2) RETURNING id",
      [catId]
    );
    const tHangRao = insertRes.rows[0].id;

    // 2. Thêm dependency: Đào móng -> Hàng rào tạm -> Bê tông lót
    await client.query(
      `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days)
       VALUES ($1, $2, 'FS', 0), ($2, $3, 'FS', 0)`,
      [tDaoMong, tHangRao, tBetongLot]
    );

    await client.query("COMMIT");
    console.log("Added non-critical task successfully.");

    // 3. Tính toán lại CPM
    const { calculateAndSaveSchedule } = require("./services/scheduleCalculation");
    await calculateAndSaveSchedule(projectId);
    console.log("CPM Calculation updated.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
  } finally {
    client.release();
    process.exit();
  }
}

addNonCriticalTask();
