"use strict";

const db = require("../config/db");

/**
 * T-119 / S-46: Service quản lý phiên bản dự toán và tính tổng theo cây WBS
 */

/**
 * Kiểm tra xem dự án đã có chi phí thực tế (actual_costs) hay chưa
 */
async function checkHasActualCosts(projectId) {
  const { rows } = await db.query(
    "SELECT EXISTS(SELECT 1 FROM actual_costs WHERE project_id = $1) AS has",
    [projectId]
  );
  return Boolean(rows[0]?.has);
}

/**
 * Lấy danh sách các phiên bản dự toán của dự án
 */
async function getBudgetVersions(projectId) {
  const query = `
    SELECT
      bv.id,
      bv.project_id,
      bv.version_number,
      bv.description,
      bv.created_at,
      bv.created_by,
      u.name AS created_by_name,
      COALESCE(ROUND(SUM(bi.amount), 2)::text, '0.00') AS total_amount,
      COUNT(bi.id)::int AS items_count
    FROM budget_versions bv
    LEFT JOIN users u ON u.id = bv.created_by
    LEFT JOIN budget_items bi ON bi.budget_version_id = bv.id
    WHERE bv.project_id = $1
    GROUP BY bv.id, u.name
    ORDER BY bv.version_number DESC
  `;

  const { rows } = await db.query(query, [projectId]);
  const hasActualCosts = await checkHasActualCosts(projectId);

  return {
    project_id: projectId,
    has_actual_costs: hasActualCosts,
    versions: rows,
  };
}

/**
 * Lấy cây dự toán kèm tính tổng cộng dồn từ các lá lên hạng mục cha
 * cho một phiên bản cụ thể (hoặc phiên bản mới nhất nếu không truyền versionNumber)
 */
async function getBudgetTree(projectId, versionNumber = null) {
  const hasActualCosts = await checkHasActualCosts(projectId);

  // 1. Xác định phiên bản cần lấy
  let versionRow = null;
  if (versionNumber) {
    const vRes = await db.query(
      `
      SELECT bv.*, u.name AS created_by_name
      FROM budget_versions bv
      LEFT JOIN users u ON u.id = bv.created_by
      WHERE bv.project_id = $1 AND bv.version_number = $2
      `,
      [projectId, versionNumber]
    );
    versionRow = vRes.rows[0] || null;
  } else {
    const vRes = await db.query(
      `
      SELECT bv.*, u.name AS created_by_name
      FROM budget_versions bv
      LEFT JOIN users u ON u.id = bv.created_by
      WHERE bv.project_id = $1
      ORDER BY bv.version_number DESC
      LIMIT 1
      `,
      [projectId]
    );
    versionRow = vRes.rows[0] || null;
  }

  // Nếu dự án chưa có phiên bản dự toán nào
  if (!versionRow) {
    const { rows: workItems } = await db.query(
      `
      SELECT
        wi.id,
        wi.parent_id,
        wi.code,
        wi.name,
        (NOT EXISTS (
          SELECT 1 FROM work_items child WHERE child.parent_id = wi.id
        )) AS is_leaf,
        NULL AS amount,
        NULL AS note,
        '0.00' AS total_budget
      FROM work_items wi
      WHERE wi.project_id = $1
      ORDER BY wi.id ASC
      `,
      [projectId]
    );

    return {
      project_id: projectId,
      has_actual_costs: hasActualCosts,
      version: null,
      project_total: "0.00",
      items: workItems,
    };
  }

  // 2. Dự án đã có phiên bản: Tính tổng bằng CTE đệ quy từ hạng mục lá lên các cha
  const query = `
    WITH RECURSIVE
    item_meta AS (
      SELECT
        wi.id,
        wi.parent_id,
        wi.code,
        wi.name,
        (NOT EXISTS (
          SELECT 1 FROM work_items child WHERE child.parent_id = wi.id
        )) AS is_leaf,
        bi.amount,
        bi.note
      FROM work_items wi
      LEFT JOIN budget_items bi
        ON bi.work_item_id = wi.id AND bi.budget_version_id = $2
      WHERE wi.project_id = $1
    ),
    tree_descendants(ancestor_id, desc_id, depth, path) AS (
      SELECT
        id AS ancestor_id,
        id AS desc_id,
        1 AS depth,
        ARRAY[id] AS path
      FROM item_meta
      UNION ALL
      SELECT
        td.ancestor_id,
        im.id AS desc_id,
        td.depth + 1,
        td.path || im.id
      FROM tree_descendants td
      JOIN item_meta im ON im.parent_id = td.desc_id
      WHERE NOT (im.id = ANY(td.path)) AND td.depth < 100
    ),
    totals AS (
      SELECT
        td.ancestor_id AS id,
        COALESCE(
          ROUND(SUM(im.amount), 2)::text,
          '0.00'
        ) AS total_budget
      FROM tree_descendants td
      JOIN item_meta im ON im.id = td.desc_id AND im.is_leaf = true
      GROUP BY td.ancestor_id
    )
    SELECT
      im.id,
      im.parent_id,
      im.code,
      im.name,
      im.is_leaf,
      CASE WHEN im.is_leaf THEN im.amount::text ELSE NULL END AS amount,
      im.note,
      COALESCE(t.total_budget, '0.00') AS total_budget
    FROM item_meta im
    LEFT JOIN totals t ON t.id = im.id
    ORDER BY im.id ASC;
  `;

  const { rows } = await db.query(query, [projectId, versionRow.id]);

  // Tính project_total: Tổng toàn bộ hạng mục lá
  const totalRes = await db.query(
    `
    SELECT COALESCE(ROUND(SUM(bi.amount), 2)::text, '0.00') AS project_total
    FROM budget_items bi
    WHERE bi.budget_version_id = $1
    `,
    [versionRow.id]
  );
  const projectTotal = totalRes.rows[0]?.project_total || "0.00";

  return {
    project_id: projectId,
    has_actual_costs: hasActualCosts,
    version: {
      id: versionRow.id,
      project_id: versionRow.project_id,
      version_number: versionRow.version_number,
      description: versionRow.description,
      created_by: versionRow.created_by,
      created_by_name: versionRow.created_by_name,
      created_at: versionRow.created_at,
    },
    project_total: projectTotal,
    items: rows,
  };
}

/**
 * Lưu phiên bản dự toán (Tạo mới hoặc cập nhật nếu chưa có thực chi)
 * - Nếu dự án ĐÃ CÓ thực chi: Bắt buộc tạo phiên bản mới (version_number + 1) để bảo tồn lịch sử.
 * - Không cho phép nhập trực tiếp ở hạng mục cha.
 * - Kiểm tra tính toàn vẹn và số tiền không âm.
 */
async function saveBudgetVersion({ projectId, userId, data }) {
  const items = Array.isArray(data.items) ? data.items : [];
  const description = typeof data.description === "string" ? data.description.trim() : null;
  const forceNewVersion = Boolean(data.createNewVersion);

  // 1. Kiểm tra tồn tại dự án
  const projCheck = await db.query("SELECT id FROM projects WHERE id = $1", [projectId]);
  if (projCheck.rows.length === 0) {
    return { status: 404, error: "Dự án không tồn tại" };
  }

  // 2. Validate đầu vào của từng item
  if (items.length > 0) {
    const itemIds = items.map((i) => i.work_item_id).filter(Boolean);

    // Truy vấn tất cả work_items để kiểm tra:
    // a. Thuộc đúng dự án
    // b. Phải là hạng mục lá (NOT EXISTS child)
    const { rows: dbItems } = await db.query(
      `
      SELECT
        wi.id,
        wi.name,
        wi.project_id,
        (NOT EXISTS (
          SELECT 1 FROM work_items child WHERE child.parent_id = wi.id
        )) AS is_leaf
      FROM work_items wi
      WHERE wi.id = ANY($1)
      `,
      [itemIds]
    );

    const dbItemMap = new Map(dbItems.map((item) => [item.id, item]));

    for (const item of items) {
      const dbItem = dbItemMap.get(item.work_item_id);
      if (!dbItem || dbItem.project_id !== projectId) {
        return {
          status: 400,
          error: `Hạng mục ID ${item.work_item_id} không thuộc dự án này`,
        };
      }

      // Nghiệp vụ: "Không nhập trực tiếp dự toán ở hạng mục cha"
      if (!dbItem.is_leaf) {
        return {
          status: 422,
          error: `Không thể nhập dự toán cho "${dbItem.name}". Chỉ được nhập dự toán cho hạng mục lá, hạng mục cha sẽ tự động tính tổng từ các lá.`,
        };
      }

      // Kiểm tra số tiền
      if (item.amount !== null && item.amount !== undefined && item.amount !== "") {
        const numAmount = Number(item.amount);
        if (Number.isNaN(numAmount) || numAmount < 0) {
          return {
            status: 400,
            error: `Số tiền dự toán của hạng mục "${dbItem.name}" không hợp lệ hoặc âm`,
          };
        }
      }
    }
  }

  // 3. Kiểm tra thực chi và phiên bản hiện tại
  const hasActualCosts = await checkHasActualCosts(projectId);

  const { rows: latestVersionRows } = await db.query(
    `
    SELECT * FROM budget_versions
    WHERE project_id = $1
    ORDER BY version_number DESC
    LIMIT 1
    `,
    [projectId]
  );
  const latestVersion = latestVersionRows[0] || null;

  // Quyết định tạo phiên bản mới hay cập nhật:
  // - Nếu chưa có phiên bản nào: Tạo v1.
  // - Nếu ĐÃ CÓ thực chi: BẮT BUỘC tạo phiên bản mới (version_number + 1).
  // - Nếu CHƯA CÓ thực chi và người dùng yêu cầu tạo mới: Tạo phiên bản mới.
  // - Nếu CHƯA CÓ thực chi và không yêu cầu tạo mới: Cập nhật phiên bản hiện tại.
  const shouldCreateNew =
    !latestVersion || hasActualCosts || forceNewVersion;

  const targetVersionNumber = shouldCreateNew
    ? (latestVersion ? latestVersion.version_number + 1 : 1)
    : latestVersion.version_number;

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    let versionId;

    if (shouldCreateNew) {
      const vRes = await client.query(
        `
        INSERT INTO budget_versions (project_id, version_number, description, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [projectId, targetVersionNumber, description, userId]
      );
      versionId = vRes.rows[0].id;
    } else {
      versionId = latestVersion.id;
      await client.query(
        `
        UPDATE budget_versions
        SET description = COALESCE($1, description), created_by = $2
        WHERE id = $3
        `,
        [description, userId, versionId]
      );

      // Xoá các items cũ để ghi đè phiên bản chưa có thực chi này
      await client.query(
        "DELETE FROM budget_items WHERE budget_version_id = $1",
        [versionId]
      );
    }

    // Chèn danh sách budget_items
    for (const item of items) {
      if (item.amount !== null && item.amount !== undefined && item.amount !== "") {
        const itemNote = typeof item.note === "string" ? item.note.trim() : null;
        await client.query(
          `
          INSERT INTO budget_items (budget_version_id, work_item_id, amount, note)
          VALUES ($1, $2, $3, $4)
          `,
          [versionId, item.work_item_id, item.amount, itemNote]
        );
      }
    }

    await client.query("COMMIT");

    // Lấy lại cây sau khi lưu
    const updatedTree = await getBudgetTree(projectId, targetVersionNumber);

    return {
      status: shouldCreateNew ? 201 : 200,
      message: shouldCreateNew
        ? `Đã lưu phiên bản dự toán mới (v${targetVersionNumber}) thành công`
        : `Đã cập nhật phiên bản dự toán (v${targetVersionNumber}) thành công`,
      is_new_version: shouldCreateNew,
      ...updatedTree,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  checkHasActualCosts,
  getBudgetVersions,
  getBudgetTree,
  saveBudgetVersion,
};
