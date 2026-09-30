require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testPerformance() {
  const client = await pool.connect();
  try {
    // Tạo project tạm
    const projRes = await client.query("INSERT INTO projects (name) VALUES ('Perf Test Project') RETURNING id");
    const projectId = projRes.rows[0].id;
    
    console.log(`Bắt đầu tạo 500 hạng mục cho dự án ${projectId}...`);
    let parentId = null;
    let nodeIds = [];
    
    // Tạo root
    const rootRes = await client.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Root') RETURNING id", [projectId, parentId]);
    nodeIds.push(rootRes.rows[0].id);
    
    // Tạo tree
    for (let i = 1; i < 500; i++) {
      const pId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      const res = await client.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, $3) RETURNING id", [projectId, pId, `Node ${i}`]);
      nodeIds.push(res.rows[0].id);
    }
    
    console.log(`Tạo xong 500 hạng mục. Kiểm tra hiệu năng GET /tree/all...`);
    
    const { SUBTREE_SQL } = require('../queries/workItemTree');
    // SUBTREE SQL yêu cầu id của gốc và project_id
    const sql = SUBTREE_SQL;
    
    const start = Date.now();
    await client.query(sql, [nodeIds[0], projectId]);
    const end = Date.now();
    const duration = end - start;
    
    console.log(`\n=> Thời gian lấy cây 500 node: ${duration}ms (Yêu cầu: < 2000ms)`);
    if (duration < 2000) {
      console.log('✅ PASS: Thời gian truy vấn đạt chuẩn.');
    } else {
      console.log('❌ FAIL: Quá chậm.');
    }
    
    console.log('\nPhân tích EXPLAIN (chỉ mục):');
    const explain = await client.query(`EXPLAIN ANALYZE ${sql}`, [nodeIds[0], projectId]);
    console.log(explain.rows.map(r => r['QUERY PLAN']).join('\n'));
    
    // Clean up
    await client.query("DELETE FROM projects WHERE id = $1", [projectId]);
  } catch(e) {
    console.error(e);
  } finally {
    client.release();
    pool.end();
  }
}

testPerformance();
