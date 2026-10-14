"use strict";

require("dotenv").config({ path: ".env.test" });

const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const assert = require("node:assert/strict");

async function cleanupTestData(projectId) {
    if (projectId) {
      const cleanup = await pool.connect();
      try {
        await cleanup.query("BEGIN");

        const db = await cleanup.query(
          "SELECT current_database() AS name"
        );
        if (db.rows[0].name !== "construction_db_test") {
          throw new Error("Unsafe cleanup database");
        }

        await cleanup.query(`
          ALTER TABLE acceptance_voucher_items
          DISABLE TRIGGER trg_prevent_approved_acceptance_item_changes
        `);

        await cleanup.query(
          `DELETE FROM acceptance_voucher_items
           WHERE voucher_id IN (
             SELECT id FROM acceptance_vouchers WHERE project_id = $1
           )`,
          [projectId]
        );

        await cleanup.query(
          "DELETE FROM acceptance_vouchers WHERE project_id = $1",
          [projectId]
        );

        await cleanup.query(
          "DELETE FROM work_items WHERE project_id = $1",
          [projectId]
        );

        await cleanup.query(
          "DELETE FROM projects WHERE id = $1",
          [projectId]
        );

        await cleanup.query(`
          ALTER TABLE acceptance_voucher_items
          ENABLE TRIGGER trg_prevent_approved_acceptance_item_changes
        `);

        await cleanup.query(
          `DELETE FROM users
           WHERE name = 'S37 Concurrent Test'
             AND email LIKE 's37-%@example.invalid'
             AND NOT EXISTS (
               SELECT 1 FROM acceptance_vouchers
               WHERE created_by = users.id
             )`
        );

        await cleanup.query("COMMIT");
        console.log("CLEANUP PASS");
      } catch (err) {
        await cleanup.query("ROLLBACK");
        throw err;
      } finally {
        cleanup.release();
      }
    }
}
async function main() {
  const db = await pool.query(
    "SELECT current_database() AS name"
  );

  assert.equal(
    db.rows[0].name,
    "construction_db_test",
    "SAFETY: Wrong database"
  );

  let projectId;
  let itemId;
  let voucherA;
  let voucherB;

  const setup = await pool.connect();

  try {
    await setup.query("BEGIN");

    const role = await setup.query(
      "SELECT id FROM roles ORDER BY id LIMIT 1"
    );

    if (!role.rows.length) {
      throw new Error("No role found");
    }

    const user = await setup.query(
      `INSERT INTO users
       (name, email, password_hash, role_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        "S37 Concurrent Test",
        `s37-${Date.now()}@example.invalid`,
        "test-only-hash",
        role.rows[0].id,
      ]
    );

    const userId = user.rows[0].id;

    const project = await setup.query(
      `INSERT INTO projects (name)
       VALUES ($1) RETURNING id`,
      ["S37_CONCURRENT_APPROVAL_TEST"]
    );

    projectId = project.rows[0].id;

    const item = await setup.query(
      `INSERT INTO work_items
       (project_id, name, type, quantity, unit, unit_price)
       VALUES ($1, $2, 'task', 100, 'm3', 1000)
       RETURNING id`,
      [projectId, "Concurrent acceptance item"]
    );

    itemId = item.rows[0].id;

    for (const [label, quantity] of [
      ["A", 80],
      ["B", 60],
    ]) {
      const voucher = await setup.query(
        `INSERT INTO acceptance_vouchers
         (project_id, batch_name, status, created_by)
         VALUES ($1, $2, 'pending_review', $3)
         RETURNING id`,
        [projectId, `S37 voucher ${label}`, userId]
      );

      const id = voucher.rows[0].id;

      await setup.query(
        `INSERT INTO acceptance_voucher_items
         (voucher_id, work_item_id, cumulative_quantity,
          prev_approved_cumulative, delta_quantity, unit)
         VALUES ($1, $2, $3, 0, $3, 'm3')`,
        [id, itemId, quantity]
      );

      if (label === "A") voucherA = id;
      else voucherB = id;
    }

    await setup.query("COMMIT");
    console.log("SETUP PASS");
  } catch (err) {
    await setup.query("ROLLBACK");
    throw err;
  } finally {
    setup.release();
  }

  async function approve(voucherId) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");

      await client.query(
        `UPDATE acceptance_vouchers
         SET status = 'approved', reviewed_at = NOW()
         WHERE id = $1`,
        [voucherId]
      );

      await client.query("COMMIT");

      return { voucherId, success: true };
    } catch (err) {
      await client.query("ROLLBACK");

      return {
        voucherId,
        success: false,
        code: err.code,
        message: err.message,
      };
    } finally {
      client.release();
    }
  }

  try {
    const results = await Promise.all([
      approve(voucherA),
      approve(voucherB),
    ]);

    console.log("CONCURRENT RESULTS:", results);

    const deadlocks = results.filter(
      r => r.code === "40P01"
    );

    assert.equal(
      deadlocks.length,
      0,
      "FAIL: Deadlock detected"
    );

    const unexpected = results.filter(
      r => !r.success && r.code !== "23514"
    );

    assert.equal(
      unexpected.length,
      0,
      "FAIL: Unexpected transaction error"
    );

    const approved = await pool.query(
      `SELECT av.id, avi.cumulative_quantity
       FROM acceptance_vouchers av
       JOIN acceptance_voucher_items avi
         ON avi.voucher_id = av.id
       WHERE av.id = ANY($1::int[])
         AND av.status = 'approved'`,
      [[voucherA, voucherB]]
    );

    assert.equal(
      approved.rowCount,
      1,
      "FAIL: Expected exactly one approved voucher"
    );

    console.log("PASS: Exactly one voucher approved");
    console.log("PASS: No deadlock");
    console.log("PASS: Contract limit protected");
    console.log("S37 CONCURRENT TEST: PASS");
  } finally {
    await cleanupTestData(projectId);
  }
}

main()
  .catch(err => {
    console.error("S37 TEST FAILED:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
