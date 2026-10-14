"use strict";

require("dotenv").config({ path: ".env.test" });
const { Pool } = require("pg");
const { lockAcceptanceWorkItems } = require("../services/acceptanceApprovalService");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3
});

async function main() {
  const db = await pool.query("SELECT current_database() AS name");

  if (db.rows[0].name !== "construction_db_test") {
    throw new Error("SAFETY: Not connected to test database");
  }

  const setup = await pool.connect();
  let id;

  try {
    await setup.query("BEGIN");

    const project = await setup.query(
      "INSERT INTO projects (name) VALUES ($1) RETURNING id",
      ["S37_CONCURRENCY_TEST"]
    );

    const item = await setup.query(
      `INSERT INTO work_items
       (project_id, name, type, quantity, unit, unit_price)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [project.rows[0].id, "S37 lock test", "task", 100, "m3", 1000]
    );

    id = item.rows[0].id;
    await setup.query("COMMIT");
  } catch (err) {
    await setup.query("ROLLBACK");
    throw err;
  } finally {
    setup.release();
  }
  const a = await pool.connect();
  const b = await pool.connect();

  let aStarted = false;
  let bStarted = false;

  try {
    await a.query("BEGIN");
    aStarted = true;

    await a.query("SET LOCAL lock_timeout = '5s'");
    await lockAcceptanceWorkItems(a, [id]);

    console.log("PASS 1: Transaction A acquired lock");

    await b.query("BEGIN");
    bStarted = true;

    await b.query("SET LOCAL lock_timeout = '300ms'");

    let blocked = false;

    try {
      await lockAcceptanceWorkItems(b, [id]);
    } catch (err) {
      if (err.code === "55P03") {
        blocked = true;
      } else {
        throw err;
      }
    }

    if (!blocked) {
      throw new Error("FAIL: Transaction B acquired locked row");
    }

    console.log("PASS 2: Transaction B blocked correctly");

    await b.query("ROLLBACK");
    bStarted = false;

    await a.query("ROLLBACK");
    aStarted = false;

    await b.query("BEGIN");
    bStarted = true;

    await b.query("SET LOCAL lock_timeout = '5s'");
    await lockAcceptanceWorkItems(b, [id]);

    console.log("PASS 3: Transaction B acquired lock after release");

    await b.query("ROLLBACK");
    bStarted = false;

    console.log("S37 LOCK TEST: 3/3 PASS");
  } finally {
    if (bStarted) await b.query("ROLLBACK");
    if (aStarted) await a.query("ROLLBACK");

    a.release();
    b.release();

    // Dọn dữ liệu thử nghiệm sau khi giải phóng khóa.
    await pool.query(
      `DELETE FROM work_items
       WHERE id = $1`,
      [id]
    );

    await pool.query(
      `DELETE FROM projects
       WHERE name = $1
         AND NOT EXISTS (
           SELECT 1 FROM work_items
           WHERE work_items.project_id = projects.id
         )`,
      ["S37_CONCURRENCY_TEST"]
    );

    console.log("CLEANUP: Test data removed");
  }
}

main()
  .catch(err => {
    console.error("TEST FAILED:", err.message, err.code || "");
    process.exitCode = 1;
  })
  .finally(() => pool.end());


