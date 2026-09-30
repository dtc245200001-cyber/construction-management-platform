require('dotenv').config();
const { Pool } = require('pg');
const { ROLES } = require('../utils/constants');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seedRoles() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Bảng roles có 6 dòng đúng (T-04) và Seed idempotent
    const roleValues = Object.values(ROLES);
    
    logger.info(`Đang cập nhật ${roleValues.length} role...`);
    
    for (const role of roleValues) {
      await client.query(
        `INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [role]
      );
    }
    
    await client.query('COMMIT');
    logger.info('Seed roles hoàn tất thành công!');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Lỗi khi seed roles:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seedRoles();
