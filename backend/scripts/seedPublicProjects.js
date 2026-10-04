require('dotenv').config();
const { Client } = require('pg');
const { removeAccents } = require('../routes/publicRoutes');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  await client.connect();

  console.log("Seeding public projects...");

  const projects = [
    {
      name: "Cầu vượt sông Hồng",
      code: "CVSH",
      location: "Hà Nội",
      province: "Hà Nội",
      project_type: "Hạ tầng giao thông",
      stage: "Đang thi công",
      description: "Dự án cầu vượt sông Hồng kết nối các khu vực trọng điểm, góp phần phát triển hạ tầng giao thông đô thị.",
      cover_image_url: "/assets/bridge-project.jpg",
      expected_completion_date: "2026-12-31",
      is_public: true,
    },
    {
      name: "Khu đô thị Vinhomes Green City",
      code: "VHGC",
      location: "TP. Hồ Chí Minh",
      province: "TP. Hồ Chí Minh",
      project_type: "Khu đô thị",
      stage: "Chuẩn bị đầu tư",
      description: "Khu đô thị hiện đại với không gian sống xanh, tiện ích đồng bộ và hệ thống hạ tầng hoàn chỉnh.",
      cover_image_url: "/assets/urban-project.jpg",
      expected_completion_date: "2030-12-31",
      is_public: true,
    },
    {
      name: "Nhà máy sản xuất linh kiện điện tử",
      code: "NMSX",
      location: "Bắc Ninh",
      province: "Bắc Ninh",
      project_type: "Công nghiệp",
      stage: "Đang đấu thầu",
      description: "Tổ hợp nhà máy sản xuất linh kiện điện tử với quy mô lớn tại khu công nghiệp Bắc Ninh.",
      cover_image_url: "/assets/factory-project.jpg",
      expected_completion_date: "2027-12-31",
      is_public: true,
    }
  ];

  try {
    for (const p of projects) {
      const normalized = removeAccents(`${p.name} ${p.province} ${p.project_type}`).toLowerCase();
      
      const exist = await client.query("SELECT id FROM projects WHERE code = $1", [p.code]);
      if (exist.rows.length === 0) {
        await client.query(
          `INSERT INTO projects (
            name, code, location, province, project_type, stage, description, cover_image_url, expected_completion_date, is_public, normalized_search_text
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            p.name, p.code, p.location, p.province, p.project_type, p.stage, p.description, p.cover_image_url, p.expected_completion_date, p.is_public, normalized
          ]
        );
        console.log(`Inserted ${p.name}`);
      } else {
        await client.query(
          `UPDATE projects SET 
            province = $1, project_type = $2, stage = $3, description = $4, cover_image_url = $5, expected_completion_date = $6, is_public = $7, normalized_search_text = $8
           WHERE code = $9`,
          [
            p.province, p.project_type, p.stage, p.description, p.cover_image_url, p.expected_completion_date, p.is_public, normalized, p.code
          ]
        );
        console.log(`Updated ${p.name}`);
      }
    }
    console.log("Seeding done.");
  } catch (error) {
    console.error("Error seeding projects:", error);
  } finally {
    await client.end();
  }
}

seed();
