require("dotenv").config();
const db = require("../config/db");

async function seed() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Lấy user Admin
    const userRes = await client.query("SELECT id FROM users WHERE email = 'admin@congtrinh.vn'");
    if (userRes.rows.length === 0) {
      throw new Error("Không tìm thấy user Admin");
    }
    const huongLanId = userRes.rows[0].id;

    // 1. Thêm dự án
    const projectRes = await client.query(
      `INSERT INTO projects (name, code, location, start_date, sprint_length_weeks)
       VALUES ($1, $2, $3, CURRENT_DATE, 1) RETURNING id`,
      ['Mái Trường Của Em', 'MTCE-01', 'Hà Nội']
    );
    const projectId = projectRes.rows[0].id;

    // Phân quyền cho Hương Lan
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'ban_quan_ly')`,
      [projectId, huongLanId]
    );

    console.log(`Đã tạo dự án Mái Trường Của Em với ID: ${projectId}`);

    // 2. Thêm hạng mục
    const categories = [
      'Hạng mục Chuẩn bị mặt bằng',
      'Hạng mục Thi công phần thô',
      'Hạng mục Thi công hoàn thiện',
      'Hạng mục Lắp đặt thiết bị'
    ];
    
    const catIds = [];
    for (const cat of categories) {
      const res = await client.query(
        `INSERT INTO work_items (project_id, name, parent_id, type)
         VALUES ($1, $2, NULL, 'category') RETURNING id`,
        [projectId, cat]
      );
      catIds.push(res.rows[0].id);
    }
    
    const [catMatBang, catPhanTho, catHoanThien, catThietBi] = catIds;

    // 3. Thêm task
    const tasks = [
      // Mặt bằng
      { cat: catMatBang, name: 'Làm sạch mặt bằng', dur: 2 },
      { cat: catMatBang, name: 'Ép cọc', dur: 5 },
      // Phần thô
      { cat: catPhanTho, name: 'Làm móng', dur: 6 },
      { cat: catPhanTho, name: 'Đổ cột tầng 1', dur: 3 },
      { cat: catPhanTho, name: 'Đổ dầm sàn tầng 1', dur: 4 },
      { cat: catPhanTho, name: 'Đổ cột tầng 2', dur: 3 },
      { cat: catPhanTho, name: 'Đổ dầm sàn mái', dur: 5 },
      // Hoàn thiện
      { cat: catHoanThien, name: 'Xây tường bao', dur: 7 },
      { cat: catHoanThien, name: 'Trát tường', dur: 6 },
      { cat: catHoanThien, name: 'Lát nền', dur: 4 },
      { cat: catHoanThien, name: 'Sơn bả', dur: 5 },
      // Thiết bị
      { cat: catThietBi, name: 'Thi công điện nước', dur: 8 },
      { cat: catThietBi, name: 'Bàn ghế và bảng', dur: 2 }
    ];

    const taskIds = {};
    for (const t of tasks) {
      const res = await client.query(
        `INSERT INTO tasks (work_item_id, name, duration_days)
         VALUES ($1, $2, $3) RETURNING id`,
        [t.cat, t.name, t.dur]
      );
      taskIds[t.name] = res.rows[0].id;
    }

    // 4. Dependencies
    const deps = [
      { p: 'Làm sạch mặt bằng', s: 'Ép cọc', type: 'FS', lag: 0 },
      { p: 'Ép cọc', s: 'Làm móng', type: 'FS', lag: 0 },
      { p: 'Làm móng', s: 'Đổ cột tầng 1', type: 'FS', lag: 0 },
      { p: 'Đổ cột tầng 1', s: 'Đổ dầm sàn tầng 1', type: 'FS', lag: 0 },
      { p: 'Đổ dầm sàn tầng 1', s: 'Đổ cột tầng 2', type: 'FS', lag: 0 },
      { p: 'Đổ cột tầng 2', s: 'Đổ dầm sàn mái', type: 'FS', lag: 0 },
      
      // Xây tường sau khi xong sàn tầng 1 nhưng delay 2 ngày
      { p: 'Đổ dầm sàn tầng 1', s: 'Xây tường bao', type: 'FS', lag: 2 },
      { p: 'Xây tường bao', s: 'Trát tường', type: 'FS', lag: 0 },
      { p: 'Trát tường', s: 'Lát nền', type: 'FS', lag: 0 },
      { p: 'Trát tường', s: 'Sơn bả', type: 'FS', lag: 0 },
      
      // Điện nước làm song song với xây tường
      { p: 'Xây tường bao', s: 'Thi công điện nước', type: 'SS', lag: 2 },
      { p: 'Thi công điện nước', s: 'Lát nền', type: 'FS', lag: 0 },
      
      // Bàn ghế làm cuối cùng
      { p: 'Sơn bả', s: 'Bàn ghế và bảng', type: 'FS', lag: 0 },
      { p: 'Lát nền', s: 'Bàn ghế và bảng', type: 'FS', lag: 0 }
    ];

    for (const d of deps) {
      await client.query(
        `INSERT INTO dependencies (predecessor_id, successor_id, dependency_type, lead_lag_days)
         VALUES ($1, $2, $3, $4)`,
        [taskIds[d.p], taskIds[d.s], d.type, d.lag]
      );
    }

    await client.query("COMMIT");
    console.log("Đã thêm toàn bộ cây công việc thành công!");

    // Tính toán CPM
    const { calculateAndSaveSchedule } = require("../services/scheduleCalculation");
    await calculateAndSaveSchedule(projectId);
    console.log("Tính toán CPM hoàn tất.");

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error:", error);
  } finally {
    client.release();
    process.exit(0);
  }
}

seed();
