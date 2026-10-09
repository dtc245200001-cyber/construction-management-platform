const { Client } = require('pg');
const client = new Client('postgresql://postgres:khanhhoa123!@localhost:5432/construction_db');
client.connect().then(async () => {
  const p = await client.query("SELECT id, name FROM projects");
  console.log('Projects:', p.rows);

  const u = await client.query("SELECT id, email, is_system_admin, role_id FROM users");
  console.log('Users:', u.rows);

  const roles = await client.query("SELECT * FROM roles");
  console.log('Roles:', roles.rows);
  
  const pm = await client.query("SELECT * FROM project_members");
  console.log('Project Members:', pm.rows);

  client.end();
}).catch(console.error);
