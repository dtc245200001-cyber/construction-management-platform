/**
 * Lấy cả cây con của một hạng mục (work_item), bao gồm chính hạng mục đó.
 *
 * Dùng WITH RECURSIVE đi từ hạng mục gốc (workItemId) xuống mọi hạng mục con,
 * cháu, ... qua cột parent_id. Có chỉ mục trên parent_id (migration T-08) nên
 * bước JOIN lặp ở mỗi tầng đều dùng được index thay vì quét toàn bảng.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} pool
 * @param {number} workItemId - id của hạng mục muốn lấy cây con
 * @returns {Promise<Array<{id: number, project_id: number, parent_id: number|null, name: string, depth: number}>>}
 *   Danh sách phẳng gồm hạng mục gốc (depth 0) và mọi hạng mục con, sắp theo tầng rồi theo id.
 *   Mảng rỗng nếu workItemId không tồn tại.
 */
async function getSubtree(pool, workItemId) {
    const { rows } = await pool.query(
        `
        WITH RECURSIVE subtree AS (
            SELECT id, project_id, parent_id, name, 0 AS depth
            FROM work_items
            WHERE id = $1

            UNION ALL

            SELECT wi.id, wi.project_id, wi.parent_id, wi.name, subtree.depth + 1
            FROM work_items wi
            INNER JOIN subtree ON wi.parent_id = subtree.id
        )
        SELECT id, project_id, parent_id, name, depth
        FROM subtree
        ORDER BY depth, id;
        `,
        [workItemId]
    );

    return rows;
}

module.exports = { getSubtree };
