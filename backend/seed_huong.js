require("dotenv").config();
const db = require("./config/db");

async function seed() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const projectId = 13;

    // 1. Thêm các hạng mục (Categories)
    const resCategories = await client.query(
      `
        INSERT INTO work_items (project_id, name, parent_id, type)
        VALUES 
          ($1, 'Hạng mục Móng công trình', NULL, 'category'),
          ($1, 'Hạng mục Phần thân', NULL, 'category'),
          ($1, 'Hạng mục Hoàn thiện', NULL, 'category')
        RETURNING id, name
      `,
      [projectId]
    );
    
    const catMong = resCategories.rows[0].id;
    const catThan = resCategories.rows[1].id;
    const catHoanThien = resCategories.rows[2].id;

    // 2. Thêm các Tasks
    const resTasks = await client.query(
      `
        INSERT INTO tasks (work_item_id, name, duration_days)
        VALUES 
          -- Dưới Móng công trình
          ($1, 'Đào móng', 3),
          ($1, 'Ép cọc', 5),
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
      [catMong, catThan, catHoanThien]
    );

    const getTaskId = (taskName) => resTasks.rows.find((t) => t.name === taskName).id;

    const tDaoMong = getTaskId('Đào móng');
    const tEpCoc = getTaskId('Ép cọc');
    const tBetongLot = getTaskId('Đổ bê tông lót');
    const tBetongDaiMong = getTaskId('Đổ bê tông đài móng');
    const tCotThepT1 = getTaskId('Dựng cốt thép tầng 1');
    const tBetongCotT1 = getTaskId('Đổ bê tông cột tầng 1');
    const tBetongSanT1 = getTaskId('Đổ bê tông sàn tầng 1');
    const tXayTuongT1 = getTaskId('Xây tường tầng 1');
    const tTratTuong = getTaskId('Trát tường');
    const tSonNuoc = getTaskId('Sơn nước');

    // 3. Thêm Dependencies
    const deps = [
      { pred: tDaoMong, succ: tEpCoc, type: 'FS', lag: 0 },
      { pred: tEpCoc, succ: tBetongLot, type: 'FS', lag: 0 },
      { pred: tBetongLot, succ: tBetongDaiMong, type: 'FS', lag: 0 },
      { pred: tBetongDaiMong, succ: tCotThepT1, type: 'FS', lag: 0 },
      { pred: tCotThepT1, succ: tBetongCotT1, type: 'FS', lag: 0 },
      { pred: tBetongCotT1, succ: tBetongSanT1, type: 'FS', lag: 0 },
      { pred: tXayTuongT1, succ: tTratTuong, type: 'FS', lag: 0 },
      { pred: tTratTuong, succ: tSonNuoc, type: 'FS', lag: 0 },
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
    console.log("Seeding WBS completed successfully!");

    // 4. Tính toán CPM
    const { calculateAndSaveSchedule } = require("./services/scheduleCalculation");
    await calculateAndSaveSchedule(projectId);
    console.log("CPM Calculation completed.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Transaction failed, rolled back.", err);
  } finally {
    client.release();
    process.exit();
  }
}

seed();
