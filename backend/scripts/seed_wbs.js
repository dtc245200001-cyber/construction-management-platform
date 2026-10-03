require('dotenv').config();
const db = require('../config/db');

const wbsData = [
  {
    name: "1. Chuẩn bị thi công",
    children: [
      { name: "1.1. Khảo sát địa hình và địa chất" },
      { name: "1.2. San lấp mặt bằng" },
      { name: "1.3. Lắp đặt lán trại, hàng rào tạm và hệ thống điện nước thi công" }
    ]
  },
  {
    name: "2. Thi công phần Ngầm",
    children: [
      { name: "2.1. Ép cọc đại trà" },
      { name: "2.2. Đào đất hố móng" },
      { name: "2.3. Bê tông lót và Đài móng" },
      { name: "2.4. Cột, vách và dầm sàn tầng hầm B1" },
      { name: "2.5. Chống thấm tường hầm" }
    ]
  },
  {
    name: "3. Thi công phần Thân (Khối đế thương mại)",
    children: [
      {
        name: "3.1. Tầng 1",
        children: [
          { name: "3.1.1. Cốt thép, Cốp pha, Bê tông Cột tầng 1" },
          { name: "3.1.2. Cốt thép, Cốp pha, Bê tông Dầm Sàn tầng 1" }
        ]
      },
      {
        name: "3.2. Tầng 2",
        children: [
          { name: "3.2.1. Cốt thép, Cốp pha, Bê tông Cột tầng 2" },
          { name: "3.2.2. Cốt thép, Cốp pha, Bê tông Dầm Sàn tầng 2" }
        ]
      },
      {
        name: "3.3. Tầng mái",
        children: [
          { name: "3.3.1. Xây lan can mái" },
          { name: "3.3.2. Chống thấm sàn mái" }
        ]
      }
    ]
  },
  {
    name: "4. Thi công Hoàn thiện",
    children: [
      { name: "4.1. Xây tường bao và tường ngăn" },
      { name: "4.2. Trát tường trong và ngoài" },
      { name: "4.3. Ốp lát nền và khu vệ sinh" },
      { name: "4.4. Đóng trần thạch cao" },
      { name: "4.5. Bả matit và Sơn nước" },
      { name: "4.6. Lắp đặt cửa đi, cửa sổ nhôm kính" }
    ]
  },
  {
    name: "5. Thi công hệ thống Cơ điện (MEP)",
    children: [
      { name: "5.1. Hệ thống Điện nặng (Cấp nguồn, chiếu sáng)" },
      { name: "5.2. Hệ thống Điện nhẹ (LAN, Camera, Loa)" },
      { name: "5.3. Hệ thống Cấp thoát nước" },
      { name: "5.4. Hệ thống Điều hòa không khí và Thông gió (HVAC)" },
      { name: "5.5. Hệ thống Phòng cháy chữa cháy (PCCC)" }
    ]
  },
  {
    name: "6. Nghiệm thu và Bàn giao",
    children: [
      { name: "6.1. Vệ sinh công nghiệp" },
      { name: "6.2. Nghiệm thu liên động các hệ thống" },
      { name: "6.3. Bàn giao đưa vào sử dụng" }
    ]
  }
];

async function seedWBS() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    const projRes = await client.query("SELECT id FROM projects ORDER BY id ASC LIMIT 1");
    if (projRes.rows.length === 0) {
      throw new Error("Không tìm thấy dự án nào trong DB.");
    }
    const projectId = projRes.rows[0].id;
    
    // Clear existing WBS for project 1
    await client.query("DELETE FROM work_items WHERE project_id = $1", [projectId]);
    
    // Insert function
    const insertNode = async (node, parentId = null) => {
      const res = await client.query(
        "INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id",
        [projectId, parentId, node.name]
      );
      const newId = res.rows[0].id;
      
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          await insertNode(child, newId);
        }
      }
    };
    
    console.log("Đang chèn dữ liệu WBS mẫu...");
    for (const root of wbsData) {
      await insertNode(root);
    }

    await client.query("COMMIT");
    console.log("Thêm dữ liệu WBS thành công!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Lỗi:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}

seedWBS();
