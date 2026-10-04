const pool = require("../config/db");

/**
 * Mark all schedule results of a project as requiring recalculation.
 *
 * @param {number} projectId
 * @param {object} client Optional existing pg client/transaction client.
 * @returns {Promise<number>} number of affected schedule results
 */
async function markProjectScheduleDirty(projectId, client = pool) {
  const result = await client.query(
    `
      UPDATE schedule_results sr
      SET needs_recalculation = true
      FROM work_items wi
      WHERE wi.id = sr.work_item_id
        AND wi.project_id = $1
    `,
    [projectId]
  );

  return result.rowCount;
}

module.exports = {
  markProjectScheduleDirty,
};