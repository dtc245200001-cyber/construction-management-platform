// Truy vấn đệ quy trên cây `work_items` (hạng mục).
//
// Dùng WITH RECURSIVE để đi từ một hạng mục xuống hết các hạng mục con,
// cháu, chắt... của nó (đi theo chiều parent_id -> id). Vì work_items có
// index trên parent_id (T-08), mỗi bước nối trong truy vấn đệ quy đều
// dùng được index đó thay vì quét toàn bảng.
//
// Được T-10 dùng lại để kiểm tra "đổi cha thành hậu duệ của chính mình".

const SUBTREE_SQL = `
  WITH RECURSIVE subtree AS (
    SELECT
      id, project_id, parent_id, name, code, created_at, updated_at,
      0 AS depth
    FROM work_items
    WHERE id = $1

    UNION ALL

    SELECT
      wi.id, wi.project_id, wi.parent_id, wi.name, wi.code,
      wi.created_at, wi.updated_at,
      s.depth + 1 AS depth
    FROM work_items wi
    INNER JOIN subtree s
      ON wi.parent_id = s.id
     AND wi.project_id = s.project_id
  )
  SELECT id, project_id, parent_id, name, code, created_at, updated_at, depth FROM subtree
  ORDER BY depth, id;
`;

/**
 * Lấy cây con (subtree) của một hạng mục, bao gồm cả chính nó (depth = 0).
 *
 * @param {import('pg').Pool | import('pg').PoolClient} db - pool hoặc client pg
 * @param {number} workItemId - id của hạng mục gốc cần lấy cây con
 * @param {{ includeRoot?: boolean }} [options] - includeRoot=false thì bỏ chính hạng mục gốc, chỉ trả về hậu duệ
 * @returns {Promise<Array<object>>} danh sách hạng mục trong cây con, sắp theo độ sâu tăng dần
 */
async function getWorkItemSubtree(db, workItemId, options = {}) {
  const { includeRoot = true } = options;

  const { rows } = await db.query(SUBTREE_SQL, [workItemId]);

  return includeRoot ? rows : rows.filter((row) => row.depth > 0);
}

/**
 * Tiện ích rút gọn: chỉ lấy danh sách id của các hậu duệ (không gồm chính nó).
 * T-10 dùng hàm này để kiểm tra "cha mới có phải là hậu duệ của hạng mục không".
 *
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {number} workItemId
 * @returns {Promise<number[]>}
 */
async function getDescendantIds(db, workItemId) {
  const rows = await getWorkItemSubtree(db, workItemId, { includeRoot: false });
  return rows.map((row) => row.id);
}

module.exports = {
  SUBTREE_SQL,
  getWorkItemSubtree,
  getDescendantIds,
};
