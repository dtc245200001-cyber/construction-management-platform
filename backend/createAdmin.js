require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('dotenv').config({ path: require('path').resolve(__dirname, '.env'), override: true });

const db = require('./config/db');
const argon2 = require('argon2');

async function run() {
  const hash = await argon2.hash('admin123');
  const res = await db.query(
    `INSERT INTO users (name, email, password_hash, is_system_admin, is_verified, role_id)
     VALUES ($1, $2, $3, $4, $5, (SELECT id FROM roles WHERE name = 'ban_quan_ly' LIMIT 1))
     ON CONFLICT (email)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, is_system_admin = true, is_verified = true
     RETURNING id, name, email, is_system_admin`,
    ['System Admin', 'admin@congtrinh.vn', hash, true, true]
  );
  console.log('Admin user created/updated successfully:', res.rows[0]);

  // Ensure project 1 has admin as member
  await db.query(
    `INSERT INTO project_members (user_id, project_id, role)
     VALUES ($1, 1, 'ban_quan_ly')
     ON CONFLICT DO NOTHING`,
    [res.rows[0].id]
  );

  // Check work items for project 1
  const wiCount = await db.query('SELECT count(*)::int as count FROM work_items WHERE project_id = 1');
  if (wiCount.rows[0].count === 0) {
    await db.query(`
      INSERT INTO work_items (project_id, code, name, unit, quantity, unit_price)
      VALUES 
        (1, 'HM-01', 'Hạng mục Móng công trình', 'm3', 100.000, 1500000),
        (1, 'HM-02', 'Hạng mục Phần thân', 'm3', 250.000, 2000000),
        (1, 'HM-03', 'Hạng mục Hoàn thiện', 'm2', 500.000, 350000)
    `);
    console.log('Seeded demo work items for project 1');
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Error creating admin:', err);
  process.exit(1);
});
