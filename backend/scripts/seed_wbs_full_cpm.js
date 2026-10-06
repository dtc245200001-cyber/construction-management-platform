require("dotenv").config();
const db = require("../config/db");

async function seed() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Project huong: id 13
    const projectId = 13;
    const parentWorkItemId = 15; // Hạng mục Móng công trình

    console.log(`Seeding additional WBS data for Project ID: ${projectId}...`);

    // 1. Thêm các hạng mục (Phần thân, Hoàn thiện)
    const resCategories = await client.query(
      `
        INSERT INTO work_items (project_id, name, parent_id, type)
        VALUES 
          ($1, 'Hạng mục Phần thân', NULL, 'category'),
          ($1, 'Hạng mục Hoàn thiện', NULL, 'category')
        RETURNING id, name
      `,
      [projectId]
    );
    const categoryPhanThan = resCategories.rows[0].id;
    const categoryHoanThien = resCategories.rows[1].id;

    // 2. Thêm các Tasks mới
    // Các tasks cũ đã có: Đào móng (id=1), Ép cọc (id=2) thuộc work_item=15
    const resTasks = await client.query(
      `
        INSERT INTO tasks (work_item_id, name, duration_days)
        VALUES 
          -- Dưới Móng công trình
          ($1, 'Đổ bê tông lót', 2),
          ($1, 'Đổ bê tông đài móng', 4),
          -- Dưới Phần thân
          ($2, 'Dựng cốt thép tầng 1', 3),
          ($2, 'Đổ bê tông cột tầng 1', 2),
          ($2, 'Đổ bê tông sàn tầng 1', 3),
          ($2, 'Xây tường tầng 1', 4),
          -- Dưới Hoàn thiện
          ($3, 'Trát tường', 5),
          ($3, 'Sơn nước', 3)
        RETURNING id, name
      `,
      [parentWorkItemId, categoryPhanThan, categoryHoanThien]
    );

    const getTaskId = (taskName) => resTasks.rows.find((t) => t.name === taskName).id;

    const tBetongLot = getTaskId('Đổ bê tông lót');
    const tBetongDaiMong = getTaskId('Đổ bê tông đài móng');
    const tCotThepT1 = getTaskId('Dựng cốt thép tầng 1');
    const tBetongCotT1 = getTaskId('Đổ bê tông cột tầng 1');
    const tBetongSanT1 = getTaskId('Đổ bê tông sàn tầng 1');
    const tXayTuongT1 = getTaskId('Xây tường tầng 1');
    const tTratTuong = getTaskId('Trát tường');
    const tSonNuoc = getTaskId('Sơn nước');

    // Các tasks cũ
    const tDaoMong = 1;
    const tEpCoc = 2;

    // 3. Thêm Dependencies
    // fs, ss
    const deps = [
      { pred: tDaoMong, succ: tEpCoc, type: 'FS', lag: 0 },
      { pred: tEpCoc, succ: tBetongLot, type: 'FS', lag: 0 },
      { pred: tBetongLot, succ: tBetongDaiMong, type: 'FS', lag: 0 },
      { pred: tBetongDaiMong, succ: tCotThepT1, type: 'FS', lag: 0 },
      { pred: tCotThepT1, succ: tBetongCotT1, type: 'FS', lag: 0 },
      { pred: tBetongCotT1, succ: tBetongSanT1, type: 'FS', lag: 0 },
      { pred: tXayTuongT1, succ: tTratTuong, type: 'FS', lag: 0 },
      { pred: tTratTuong, succ: tSonNuoc, type: 'FS', lag: 0 },
      // Thay thế FS bằng quan hệ SS với lead_lag_days = 2
      { pred: tBetongSanT1, succ: tXayTuongT1, type: 'SS', lag: 2 }
    ];

    for (const d of deps) {
      await client.query(
        `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [d.pred, d.succ, d.type, d.lag]
      );
    }

    await client.query("COMMIT");
    console.log("Seeding WBS (Full CPM) completed successfully!");

    // 4. Tính toán CPM
    const { calculateAndSaveSchedule } = require("../services/scheduleCalculation");
    await calculateAndSaveSchedule(projectId);
    console.log("CPM Calculation completed.");

    // 5. Query and print results
    const scheduleRes = await db.query(
      `SELECT t.name, sr.is_critical, sr.early_start, sr.early_finish, sr.total_float 
       FROM schedule_results sr
       JOIN tasks t ON t.id = sr.task_id
       JOIN work_items w ON w.id = t.work_item_id
       WHERE w.project_id = $1
       ORDER BY sr.early_start ASC, t.id ASC`,
      [projectId]
    );

    console.table(scheduleRes.rows);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Transaction failed, rolled back.", err);
  } finally {
    client.release();
    process.exit();
  }
}

seed();
