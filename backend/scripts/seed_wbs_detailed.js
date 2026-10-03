require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const wbsData = [
  {
    name: "1. Chuẩn bị thi công", type: "category", start_date: "2026-10-01", end_date: "2026-10-15", progress: 70, status: "Đang thực hiện",
    children: [
      { name: "1.1 Khảo sát địa hình và địa chất", type: "task", start_date: "2026-10-01", end_date: "2026-10-05", progress: 60, status: "Đang thực hiện" },
      { name: "1.2 San lấp mặt bằng", type: "task", start_date: "2026-10-06", end_date: "2026-10-10", progress: 0, status: "Chưa bắt đầu" },
      { name: "1.3 Lắp đặt lán trại, hàng rào tạm và hệ thống điện nước thi công", type: "task", start_date: "2026-10-11", end_date: "2026-10-15", progress: 0, status: "Đang chờ" }
    ]
  },
  {
    name: "2. Thi công phần Ngầm", type: "category", start_date: "2026-10-16", end_date: "2026-12-20", progress: 45, status: "Đang thực hiện",
    children: [
      { name: "2.1 Ép cọc đại trà", type: "task", start_date: "2026-10-16", end_date: "2026-11-05", progress: 0, status: "Chưa bắt đầu" },
      { name: "2.2 Đào đất hố móng", type: "task", start_date: "2026-11-06", end_date: "2026-11-20", progress: 0, status: "Chưa bắt đầu" },
      { name: "2.3 Bê tông lót và Đài móng", type: "task", start_date: "2026-11-21", end_date: "2026-12-05", progress: 0, status: "Đang chờ" },
      { name: "2.4 Cột, vách và dầm sàn tầng hầm B1", type: "task", start_date: "2026-12-06", end_date: "2026-12-20", progress: 0, status: "Chưa bắt đầu" },
      { name: "2.5 Chống thấm tầng hầm", type: "task", start_date: "2026-12-10", end_date: "2026-12-20", progress: 0, status: "Chưa bắt đầu" }
    ]
  },
  {
    name: "3. Thi công phần Thân (Khối đế thương mại)", type: "category", start_date: "2026-12-21", end_date: "2027-03-28", progress: 20, status: "Đang thực hiện",
    children: [
      { name: "3.1 Tầng 1", type: "task", start_date: "2026-12-21", end_date: "2027-01-10", progress: 0, status: "Chưa bắt đầu" }
    ]
  },
  {
    name: "4. Hoàn thiện", type: "category", start_date: null, end_date: null, progress: 0, status: "Chưa bắt đầu"
  }
];

async function seedWBS() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    const projectId = 5;
    
    // Xóa WBS cũ của project 5
    await client.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);
    
    // Hàm insert đệ quy
    const insertNode = async (node, parentId = null) => {
      const res = await client.query(
        "INSERT INTO work_items (project_id, parent_id, name, type, start_date, end_date, progress, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [projectId, parentId, node.name, node.type || 'category', node.start_date, node.end_date, node.progress || 0, node.status || 'Chưa bắt đầu']
      );
      const newId = res.rows[0].id;
      
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          await insertNode(child, newId);
        }
      }
    };
    
    console.log("Đang chèn dữ liệu WBS có chi tiết cho dự án 5...");
    for (const root of wbsData) {
      await insertNode(root);
    }

    await client.query("COMMIT");
    console.log("Tạo WBS thành công!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Lỗi:", err);
  } finally {
    client.release();
    pool.end();
  }
}

seedWBS();
