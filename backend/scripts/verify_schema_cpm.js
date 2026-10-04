"use strict";

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function verify() {
  try {
    for (const table of ["tasks", "dependencies", "schedule_results"]) {
      const cols = await pool.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table]
      );
      console.log(`\n=== BẢNG: ${table} ===`);
      console.table(cols.rows);
    }

    const fk = await pool.query(
      `SELECT
         tc.constraint_name,
         kcu.column_name,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_name = 'schedule_results'`
    );
    console.log("\n=== KHÓA NGOẠI schedule_results ===");
    console.table(fk.rows);

    const uq = await pool.query(
      `SELECT
         tc.constraint_name,
         kcu.column_name
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'UNIQUE'
         AND tc.table_name = 'schedule_results'`
    );
    console.log("\n=== RÀNG BUỘC UNIQUE schedule_results ===");
    console.table(uq.rows);

  } catch (err) {
    console.error("Lỗi:", err);
  } finally {
    await pool.end();
  }
}

verify();
