require("dotenv").config();
const db = require("./config/db");

async function rename() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    // Rename project 13
    const newName = "Dự án Khu phức hợp Thương mại Hương Plaza";
    await client.query(
      "UPDATE projects SET name = $1, description = 'Dự án xây dựng khu phức hợp thương mại và dịch vụ cao cấp, toạ lạc tại vị trí đắc địa.' WHERE id = 13",
      [newName]
    );

    await client.query("COMMIT");
    console.log("Renamed project successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
  } finally {
    client.release();
    process.exit();
  }
}

rename();
