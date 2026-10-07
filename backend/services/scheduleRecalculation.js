const pool = require("../config/db");

/**
 * Mark all schedule results of a project as requiring recalculation.
 *
 * @param {number} projectId
 * @param {object} client Optional existing pg client/transaction client.
 * @returns {Promise<number>} number of affected schedule results
 */
async function markProjectScheduleDirty(projectId, client = pool) {
  // Tăng version của dự án ngay cả khi chưa có schedule_results
  await client.query(
    `
      UPDATE projects
      SET schedule_version = schedule_version + 1
      WHERE id = $1
    `,
    [projectId]
  );

  const result = await client.query(
    `
      UPDATE schedule_results sr
      SET needs_recalculation = true
      FROM tasks t
      JOIN work_items wi
        ON wi.id = t.work_item_id
      WHERE t.id = sr.task_id
        AND wi.project_id = $1
    `,
    [projectId]
  );

  return result.rowCount;
}

module.exports = {
  markProjectScheduleDirty,
};