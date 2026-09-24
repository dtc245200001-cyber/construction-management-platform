require('dotenv').config();
const pool = require('./config/db');

async function run() {
  try {
    // Check if table is empty, if so, insert 5000 items
    const { rows } = await pool.query('SELECT COUNT(*) FROM work_items');
    if (parseInt(rows[0].count) < 5000) {
      console.log('Inserting 5000 sample work items...');
      await pool.query("INSERT INTO projects (name) VALUES ('Test Project') ON CONFLICT DO NOTHING RETURNING id");
      const projRes = await pool.query("SELECT id FROM projects LIMIT 1");
      const projId = projRes.rows[0].id;

      // Create root
      const rootRes = await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, NULL, 'Root') RETURNING id", [projId]);
      const rootId = rootRes.rows[0].id;

      let parentId = rootId;
      for (let i = 0; i < 50; i++) {
        const pRes = await pool.query("INSERT INTO work_items (project_id, parent_id, name) VALUES ($1, $2, 'Parent ' || $3) RETURNING id", [projId, rootId, i]);
        let pid = pRes.rows[0].id;
        let values = [];
        for (let j = 0; j < 100; j++) {
          values.push(`(${projId}, ${pid}, 'Child ${i}-${j}')`);
        }
        await pool.query(`INSERT INTO work_items (project_id, parent_id, name) VALUES ${values.join(',')}`);
      }
    }

    const query = `
      EXPLAIN (ANALYZE)
      SELECT id, name, parent_id, code 
      FROM work_items 
      WHERE project_id = 1 AND parent_id = 2 
      ORDER BY id ASC
    `;
    console.log('\n--- Running EXPLAIN (ANALYZE) ---');
    const res = await pool.query(query);
    console.log(res.rows.map(r => r['QUERY PLAN']).join('\n'));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
