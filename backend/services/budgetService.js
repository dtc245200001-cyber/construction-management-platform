"use strict";

const db = require("../config/db");

/**
 * T-119 / S-46: Service quản lý phiên bản dự toán và tính tổng theo cây WBS
 */

/**
 * Đảm bảo cột status tồn tại trên bảng budget_versions (APPROVED / EFFECTIVE / DRAFT)
 */
async function ensureBudgetVersionStatusColumn() {
  await db
    .query(`
      ALTER TABLE budget_versions
      ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'APPROVED';
    `)
    .catch(() => {});
}

/**
 * Kiểm tra xem dự án đã có chi phí thực tế (actual_costs) chính thức hay chưa
 */
async function checkHasActualCosts(projectId) {
  const { rows } = await db.query(
    "SELECT EXISTS(SELECT 1 FROM actual_costs WHERE project_id = $1 AND amount > 0) AS has",
    [projectId]
  );
  return Boolean(rows[0]?.has);
}

/**
 * Lấy danh sách các phiên bản dự toán của dự án
 */
async function getBudgetVersions(projectId) {
  await ensureBudgetVersionStatusColumn();

  const query = `
    SELECT
      bv.id,
      bv.project_id,
      bv.version_number,
      bv.description,
      COALESCE(bv.status, 'APPROVED') AS status,
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
 * cho một phiên bản cụ thể (hoặc ưu tiên phiên bản ĐÃ DUYỆT / ĐANG HIỆU LỰC thay vì bản nháp DRAFT)
 */
async function getBudgetTree(projectId, versionNumber = null) {
  await ensureBudgetVersionStatusColumn();
  const hasActualCosts = await checkHasActualCosts(projectId);

  // 1. Xác định phiên bản cần lấy:
  // Nếu không chỉ định versionNumber, ưu tiên lấy phiên bản đã được duyệt/đang hiệu lực (status IN ('APPROVED', 'EFFECTIVE')),
  // không mặc định lấy phiên bản nháp (DRAFT) mới nhất để tránh lệch cơ sở kiểm soát ngân sách.
  let versionRow = null;
  if (versionNumber) {
    const vRes = await db.query(
      `
      SELECT bv.*, COALESCE(bv.status, 'APPROVED') AS status, u.name AS created_by_name
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
      SELECT bv.*, COALESCE(bv.status, 'APPROVED') AS status, u.name AS created_by_name
      FROM budget_versions bv
      LEFT JOIN users u ON u.id = bv.created_by
      WHERE bv.project_id = $1
      ORDER BY
        CASE WHEN COALESCE(bv.status, 'APPROVED') IN ('APPROVED', 'EFFECTIVE') THEN 0 ELSE 1 END ASC,
        bv.version_number DESC
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
        '0.00' AS total_budget,
        COALESCE(ac_sum.actual_cost, '0.00') AS actual_cost,
        COALESCE(ROUND(COALESCE(wi.quantity, 0) * COALESCE(wi.unit_price, 0), 2)::text, '0.00') AS contract_value,
        COALESCE(pay_sum.approved_payment, '0.00') AS approved_payment,
        COALESCE(pay_sum.pending_payment, '0.00') AS pending_payment,
        CASE
          WHEN COALESCE(wi.quantity, 0) > 0 AND acc_sum.max_accepted_qty IS NOT NULL
          THEN ROUND((acc_sum.max_accepted_qty / wi.quantity) * 100, 1)::float8
          ELSE NULL
        END AS acceptance_pct
      FROM work_items wi
      LEFT JOIN (
        SELECT
          ac.work_item_id,
          ROUND(SUM(ac.amount), 2)::text AS actual_cost
        FROM actual_costs ac
        WHERE ac.project_id = $1
          AND ac.amount > 0
          AND ac.expense_date IS NOT NULL
        GROUP BY ac.work_item_id
      ) ac_sum ON ac_sum.work_item_id = wi.id
      LEFT JOIN (
        SELECT
          prl.work_item_id,
          ROUND(SUM(CASE WHEN pr.status = 'APPROVED' THEN prl.amount ELSE 0 END), 2)::text AS approved_payment,
          ROUND(SUM(CASE WHEN pr.status = 'DRAFT' THEN prl.amount ELSE 0 END), 2)::text AS pending_payment
        FROM payment_request_lines prl
        JOIN payment_requests pr ON pr.id = prl.payment_request_id
        WHERE pr.project_id = $1
        GROUP BY prl.work_item_id
      ) pay_sum ON pay_sum.work_item_id = wi.id
      LEFT JOIN (
        SELECT
          avi.work_item_id,
          MAX(avi.cumulative_quantity) AS max_accepted_qty
        FROM acceptance_voucher_items avi
        JOIN acceptance_vouchers av ON av.id = avi.voucher_id
        WHERE av.project_id = $1 AND av.status = 'approved'
        GROUP BY avi.work_item_id
      ) acc_sum ON acc_sum.work_item_id = wi.id
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
  // Kèm tổng hợp đủ 4 nguồn kiểm soát ngân sách thực tế từ DB:
  // - Giá trị hợp đồng (work_items.quantity * work_items.unit_price — S-35)
  // - Dự toán được duyệt (budget_items.amount — S-46)
  // - Chi phí thực tế chính thức (actual_costs.amount — S-47)
  // - Đề nghị thanh toán đã duyệt & đang trình (payment_request_lines — S-43/S-44)
  // - Tiến độ nghiệm thu (acceptance_voucher_items — S-36)
  const query = `
    WITH RECURSIVE
    official_actual_costs AS (
      SELECT
        ac.work_item_id,
        ROUND(SUM(ac.amount), 2) AS actual_amount
      FROM actual_costs ac
      WHERE ac.project_id = $1
        AND ac.amount > 0
        AND ac.expense_date IS NOT NULL
      GROUP BY ac.work_item_id
    ),
    official_payments AS (
      SELECT
        prl.work_item_id,
        ROUND(SUM(CASE WHEN pr.status = 'APPROVED' THEN prl.amount ELSE 0 END), 2) AS approved_pay_amount,
        ROUND(SUM(CASE WHEN pr.status = 'DRAFT' THEN prl.amount ELSE 0 END), 2) AS pending_pay_amount
      FROM payment_request_lines prl
      JOIN payment_requests pr ON pr.id = prl.payment_request_id
      WHERE pr.project_id = $1
      GROUP BY prl.work_item_id
    ),
    official_acceptance AS (
      SELECT
        avi.work_item_id,
        MAX(avi.cumulative_quantity) AS max_accepted_qty
      FROM acceptance_voucher_items avi
      JOIN acceptance_vouchers av ON av.id = avi.voucher_id
      WHERE av.project_id = $1 AND av.status = 'approved'
      GROUP BY avi.work_item_id
    ),
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
        bi.note,
        COALESCE(oac.actual_amount, 0) AS leaf_actual_amount,
        ROUND(COALESCE(wi.quantity, 0) * COALESCE(wi.unit_price, 0), 2) AS leaf_contract_value,
        COALESCE(op.approved_pay_amount, 0) AS leaf_approved_payment,
        COALESCE(op.pending_pay_amount, 0) AS leaf_pending_payment,
        CASE
          WHEN COALESCE(wi.quantity, 0) > 0 AND oa.max_accepted_qty IS NOT NULL
          THEN ROUND((oa.max_accepted_qty / wi.quantity) * 100, 1)::float8
          ELSE NULL
        END AS acceptance_pct
      FROM work_items wi
      LEFT JOIN budget_items bi
        ON bi.work_item_id = wi.id AND bi.budget_version_id = $2
      LEFT JOIN official_actual_costs oac
        ON oac.work_item_id = wi.id
      LEFT JOIN official_payments op
        ON op.work_item_id = wi.id
      LEFT JOIN official_acceptance oa
        ON oa.work_item_id = wi.id
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
        ) AS total_budget,
        COALESCE(
          ROUND(SUM(im.leaf_actual_amount), 2)::text,
          '0.00'
        ) AS total_actual_cost,
        COALESCE(
          ROUND(SUM(im.leaf_contract_value), 2)::text,
          '0.00'
        ) AS total_contract_value,
        COALESCE(
          ROUND(SUM(im.leaf_approved_payment), 2)::text,
          '0.00'
        ) AS total_approved_payment,
        COALESCE(
          ROUND(SUM(im.leaf_pending_payment), 2)::text,
          '0.00'
        ) AS total_pending_payment
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
      COALESCE(t.total_budget, '0.00') AS total_budget,
      COALESCE(t.total_actual_cost, '0.00') AS actual_cost,
      COALESCE(t.total_contract_value, '0.00') AS contract_value,
      COALESCE(t.total_approved_payment, '0.00') AS approved_payment,
      COALESCE(t.total_pending_payment, '0.00') AS pending_payment,
      CASE WHEN im.is_leaf THEN im.acceptance_pct ELSE NULL END AS acceptance_pct
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
      status: versionRow.status || "APPROVED",
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
  await ensureBudgetVersionStatusColumn();

  const items = Array.isArray(data.items) ? data.items : [];
  const description = typeof data.description === "string" ? data.description.trim() : null;
  const forceNewVersion = Boolean(data.createNewVersion);
  const requestedStatus =
    typeof data.status === "string" &&
    ["DRAFT", "APPROVED", "EFFECTIVE", "ARCHIVED"].includes(
      data.status.trim().toUpperCase()
    )
      ? data.status.trim().toUpperCase()
      : "APPROVED";

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
        INSERT INTO budget_versions (project_id, version_number, description, status, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [projectId, targetVersionNumber, description, requestedStatus, userId]
      );
      versionId = vRes.rows[0].id;
    } else {
      versionId = latestVersion.id;
      await client.query(
        `
        UPDATE budget_versions
        SET description = COALESCE($1, description),
            status = COALESCE($2, status),
            created_by = $3
        WHERE id = $4
        `,
        [description, requestedStatus, userId, versionId]
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

/**
 * Đảm bảo bảng budget_overrun_justifications tồn tại trong DB test/local
 */
async function ensureOverrunJustificationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS budget_overrun_justifications (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE RESTRICT,
      budget_version_id INTEGER REFERENCES budget_versions(id) ON DELETE SET NULL,
      reason_type TEXT NOT NULL,
      explanation TEXT NOT NULL,
      legal_document_ref TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
      submitted_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accountant_verified_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      accountant_verified_at TIMESTAMPTZ,
      accountant_note TEXT,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      reviewed_at TIMESTAMPTZ,
      review_note TEXT,
      CONSTRAINT budget_justifications_status_valid
        CHECK (status IN ('PENDING_APPROVAL', 'PENDING_ASSIGNMENT', 'APPROVED', 'REJECTED')),
      CONSTRAINT budget_justifications_no_self_review
        CHECK (reviewed_by IS NULL OR reviewed_by <> submitted_by)
    );
    ALTER TABLE budget_overrun_justifications ADD COLUMN IF NOT EXISTS legal_document_ref TEXT;
    ALTER TABLE budget_overrun_justifications ADD COLUMN IF NOT EXISTS accountant_verified_by INTEGER REFERENCES users(id) ON DELETE RESTRICT;
    ALTER TABLE budget_overrun_justifications ADD COLUMN IF NOT EXISTS accountant_verified_at TIMESTAMPTZ;
    ALTER TABLE budget_overrun_justifications ADD COLUMN IF NOT EXISTS accountant_note TEXT;
  `);
}

/**
 * Truy vấn thông tin chi tiết 1 phiếu giải trình vượt dự toán kèm tên người lập, kế toán xác nhận, người duyệt và hạng mục
 */
async function getOverrunJustificationById(justificationId) {
  const { rows } = await db.query(
    `
    SELECT
      j.id,
      j.project_id,
      j.work_item_id,
      wi.code AS work_item_code,
      wi.name AS work_item_name,
      j.budget_version_id,
      bv.version_number AS budget_version_number,
      j.reason_type,
      j.explanation,
      j.legal_document_ref,
      j.status,
      j.submitted_by,
      sub_u.name AS submitted_by_name,
      sub_pm.role AS submitted_by_role,
      j.submitted_at,
      j.accountant_verified_by,
      acc_u.name AS accountant_verified_by_name,
      acc_pm.role AS accountant_verified_by_role,
      j.accountant_verified_at,
      j.accountant_note,
      j.reviewed_by,
      rev_u.name AS reviewed_by_name,
      rev_pm.role AS reviewed_by_role,
      j.reviewed_at,
      j.review_note
    FROM budget_overrun_justifications j
    JOIN work_items wi ON wi.id = j.work_item_id
    LEFT JOIN budget_versions bv ON bv.id = j.budget_version_id
    LEFT JOIN users sub_u ON sub_u.id = j.submitted_by
    LEFT JOIN project_members sub_pm
      ON sub_pm.project_id = j.project_id AND sub_pm.user_id = j.submitted_by
    LEFT JOIN users acc_u ON acc_u.id = j.accountant_verified_by
    LEFT JOIN project_members acc_pm
      ON acc_pm.project_id = j.project_id AND acc_pm.user_id = j.accountant_verified_by
    LEFT JOIN users rev_u ON rev_u.id = j.reviewed_by
    LEFT JOIN project_members rev_pm
      ON rev_pm.project_id = j.project_id AND rev_pm.user_id = j.reviewed_by
    WHERE j.id = $1
    `,
    [justificationId]
  );
  return rows[0] || null;
}

/**
 * Lấy danh sách các phiếu giải trình vượt dự toán của dự án
 * và danh sách người duyệt độc lập (Chủ đầu tư) trong dự án
 */
async function getOverrunJustifications(projectId) {
  await ensureOverrunJustificationsTable();

  const { rows } = await db.query(
    `
    SELECT
      j.id,
      j.project_id,
      j.work_item_id,
      wi.code AS work_item_code,
      wi.name AS work_item_name,
      j.budget_version_id,
      bv.version_number AS budget_version_number,
      j.reason_type,
      j.explanation,
      j.legal_document_ref,
      j.status,
      j.submitted_by,
      sub_u.name AS submitted_by_name,
      sub_pm.role AS submitted_by_role,
      j.submitted_at,
      j.accountant_verified_by,
      acc_u.name AS accountant_verified_by_name,
      acc_pm.role AS accountant_verified_by_role,
      j.accountant_verified_at,
      j.accountant_note,
      j.reviewed_by,
      rev_u.name AS reviewed_by_name,
      rev_pm.role AS reviewed_by_role,
      j.reviewed_at,
      j.review_note
    FROM budget_overrun_justifications j
    JOIN work_items wi ON wi.id = j.work_item_id
    LEFT JOIN budget_versions bv ON bv.id = j.budget_version_id
    LEFT JOIN users sub_u ON sub_u.id = j.submitted_by
    LEFT JOIN project_members sub_pm
      ON sub_pm.project_id = j.project_id AND sub_pm.user_id = j.submitted_by
    LEFT JOIN users acc_u ON acc_u.id = j.accountant_verified_by
    LEFT JOIN project_members acc_pm
      ON acc_pm.project_id = j.project_id AND acc_pm.user_id = j.accountant_verified_by
    LEFT JOIN users rev_u ON rev_u.id = j.reviewed_by
    LEFT JOIN project_members rev_pm
      ON rev_pm.project_id = j.project_id AND rev_pm.user_id = j.reviewed_by
    WHERE j.project_id = $1
    ORDER BY j.submitted_at DESC, j.id DESC
    `,
    [projectId]
  );

  const { rows: reviewers } = await db.query(
    `
    SELECT pm.user_id, u.name, pm.role
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = $1 AND pm.role = 'chu_dau_tu'
    ORDER BY u.id ASC
    `,
    [projectId]
  );

  return {
    project_id: projectId,
    eligible_reviewers: reviewers,
    justifications: rows,
  };
}

/**
 * Tạo và gửi giải trình vượt dự toán (Quy tắc 1 & Quy tắc 6):
 * - Người dùng có quyền lập giải trình (ban_quan_ly, chu_dau_tu) tạo và gửi giải trình để duyệt.
 * - Kiểm tra xem dự án có người duyệt độc lập phù hợp (chu_dau_tu có user_id <> submitted_by) hay không:
 *   + Nếu có: trạng thái là PENDING_APPROVAL ("Chờ Chủ đầu tư duyệt").
 *   + Nếu KHÔNG có người duyệt độc lập phù hợp: giữ trạng thái PENDING_ASSIGNMENT ("Chờ phân công người duyệt độc lập"),
 *     TUYỆT ĐỐI KHÔNG tự động thông qua (APPROVED).
 */
async function createOverrunJustification({ projectId, userId, data }) {
  await ensureOverrunJustificationsTable();

  const workItemId = Number(data.work_item_id);
  const reasonType = typeof data.reason_type === "string" ? data.reason_type.trim() : "";
  const explanation = typeof data.explanation === "string" ? data.explanation.trim() : "";
  const legalDocumentRef =
    typeof data.legal_document_ref === "string"
      ? data.legal_document_ref.trim() || null
      : null;

  if (!Number.isInteger(workItemId) || workItemId <= 0) {
    return { status: 400, error: "work_item_id không hợp lệ" };
  }
  if (!reasonType) {
    return { status: 400, error: "Vui lòng chọn nhóm nguyên nhân vượt dự toán" };
  }
  if (!explanation) {
    return { status: 400, error: "Vui lòng nhập nội dung giải trình chi tiết" };
  }

  // Kiểm tra hạng mục có thuộc dự án và là hạng mục lá hay không
  const { rows: wiRows } = await db.query(
    `
    SELECT
      wi.id,
      wi.name,
      wi.project_id,
      (NOT EXISTS (
        SELECT 1 FROM work_items child WHERE child.parent_id = wi.id
      )) AS is_leaf
    FROM work_items wi
    WHERE wi.id = $1
    `,
    [workItemId]
  );

  const wi = wiRows[0];
  if (!wi || wi.project_id !== projectId) {
    return { status: 400, error: "Hạng mục không thuộc dự án này" };
  }
  if (!wi.is_leaf) {
    return {
      status: 422,
      error: "Chỉ được lập giải trình vượt dự toán cho hạng mục lá",
    };
  }

  // Lấy phiên bản dự toán áp dụng hiện tại (nếu có)
  const { rows: latestVerRows } = await db.query(
    `
    SELECT id FROM budget_versions
    WHERE project_id = $1
    ORDER BY version_number DESC
    LIMIT 1
    `,
    [projectId]
  );
  const budgetVersionId = data.budget_version_id || latestVerRows[0]?.id || null;

  // Quy tắc 6: Kiểm tra có người duyệt độc lập phù hợp (role = 'chu_dau_tu' VÀ user_id <> userId) hay không
  const { rows: independentReviewers } = await db.query(
    `
    SELECT pm.user_id, u.name
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = $1
      AND pm.role = 'chu_dau_tu'
      AND pm.user_id <> $2
    `,
    [projectId, userId]
  );

  const hasIndependentReviewer = independentReviewers.length > 0;
  const initialStatus = hasIndependentReviewer
    ? "PENDING_APPROVAL"
    : "PENDING_ASSIGNMENT";

  const { rows: insRows } = await db.query(
    `
    INSERT INTO budget_overrun_justifications (
      project_id,
      work_item_id,
      budget_version_id,
      reason_type,
      explanation,
      legal_document_ref,
      status,
      submitted_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
    `,
    [
      projectId,
      workItemId,
      budgetVersionId,
      reasonType,
      explanation,
      legalDocumentRef,
      initialStatus,
      userId,
    ]
  );

  const created = await getOverrunJustificationById(insRows[0].id);

  return {
    status: 201,
    message: hasIndependentReviewer
      ? "Đã gửi giải trình vượt dự toán để Kế toán đối chiếu và Chủ đầu tư xét duyệt"
      : "Đã lưu giải trình ở trạng thái Chờ phân công người duyệt độc lập (không tự động thông qua do chưa có người duyệt độc lập phù hợp)",
    has_independent_reviewer: hasIndependentReviewer,
    justification: created,
  };
}

/**
 * Kế toán thẩm tra & xác nhận số liệu đối chiếu trên phiếu giải trình trước khi Chủ đầu tư phê duyệt
 */
async function verifyOverrunJustificationByAccountant({
  projectId,
  justificationId,
  userId,
  data,
}) {
  await ensureOverrunJustificationsTable();

  const existing = await getOverrunJustificationById(justificationId);
  if (!existing || existing.project_id !== projectId) {
    return {
      status: 404,
      error: "Không tìm thấy phiếu giải trình vượt dự toán trong dự án này",
    };
  }

  const accountantNote =
    typeof data.accountant_note === "string" ? data.accountant_note.trim() : null;
  const legalDocumentRef =
    typeof data.legal_document_ref === "string" && data.legal_document_ref.trim()
      ? data.legal_document_ref.trim()
      : existing.legal_document_ref || null;

  await db.query(
    `
    UPDATE budget_overrun_justifications
    SET
      accountant_verified_by = $1,
      accountant_verified_at = NOW(),
      accountant_note = $2,
      legal_document_ref = COALESCE($3, legal_document_ref)
    WHERE id = $4 AND project_id = $5
    `,
    [userId, accountantNote, legalDocumentRef, justificationId, projectId]
  );

  const updated = await getOverrunJustificationById(justificationId);

  return {
    status: 200,
    message: "Kế toán đã xác nhận đối chiếu số liệu cho phiếu giải trình vượt dự toán",
    justification: updated,
  };
}

/**
 * Duyệt hoặc từ chối giải trình vượt dự toán (Quy tắc 2, 3, 4, 5 + Điều kiện Pháp lý):
 * - Quy tắc 2 & 3: Người lập giải trình KHÔNG ĐƯỢC duyệt chính giải trình đó, bất kể họ giữ vai trò gì (kể cả Chủ đầu tư hay Admin).
 *   API từ chối thao tác tự duyệt (403) và trả về thông báo rõ ràng.
 * - Quy tắc 4: Người có quyền duyệt (Chủ đầu tư) và không phải người lập có thể duyệt (APPROVED) hoặc từ chối (REJECTED).
 *   Nếu truyền enforce_legal_checklist = true khi APPROVED, bắt buộc phải có Số biên bản/Tờ trình pháp lý và Xác nhận của Kế toán.
 * - Quy tắc 5: Hệ thống ghi nhận chính xác người lập, kế toán đối chiếu, người duyệt, thời gian và kết quả xử lý.
 */
async function reviewOverrunJustification({
  projectId,
  justificationId,
  userId,
  data,
}) {
  await ensureOverrunJustificationsTable();

  const existing = await getOverrunJustificationById(justificationId);
  if (!existing || existing.project_id !== projectId) {
    return {
      status: 404,
      error: "Không tìm thấy phiếu giải trình vượt dự toán trong dự án này",
    };
  }

  // Nguyên tắc bắt buộc (Quy tắc 2 & 3): Người lập không được tự duyệt giải trình của chính mình
  if (Number(existing.submitted_by) === Number(userId)) {
    return {
      status: 403,
      error:
        "Người lập giải trình không được phép duyệt hoặc từ chối chính giải trình đó, bất kể giữ vai trò gì.",
    };
  }

  const decision =
    typeof data.decision === "string" ? data.decision.trim().toUpperCase() : "";
  const reviewNote =
    typeof data.review_note === "string" ? data.review_note.trim() : null;
  const legalDocumentRef =
    typeof data.legal_document_ref === "string" && data.legal_document_ref.trim()
      ? data.legal_document_ref.trim()
      : existing.legal_document_ref || null;

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return {
      status: 400,
      error: "Quyết định xử lý không hợp lệ (chỉ chấp nhận APPROVED hoặc REJECTED)",
    };
  }

  if (decision === "REJECTED" && !reviewNote) {
    return {
      status: 400,
      error: "Vui lòng nhập lý do từ chối giải trình để người lập bổ sung hoặc điều chỉnh",
    };
  }

  if (decision === "APPROVED" && data.enforce_legal_checklist) {
    if (!legalDocumentRef) {
      return {
        status: 422,
        error:
          "Chưa đủ điều kiện pháp lý: Bắt buộc phải có Số biên bản hiện trường / Tờ trình pháp lý trước khi Chủ đầu tư phê duyệt vượt dự toán.",
      };
    }
    if (!existing.accountant_verified_by) {
      return {
        status: 422,
        error:
          "Chưa đủ điều kiện kiểm soát nội bộ: Bắt buộc phải có xác nhận đối chiếu số liệu của Kế toán trên phiếu trước khi Chủ đầu tư phê duyệt.",
      };
    }
  }

  await db.query(
    `
    UPDATE budget_overrun_justifications
    SET
      status = $1,
      reviewed_by = $2,
      reviewed_at = NOW(),
      review_note = $3,
      legal_document_ref = COALESCE($4, legal_document_ref)
    WHERE id = $5 AND project_id = $6
    `,
    [decision, userId, reviewNote, legalDocumentRef, justificationId, projectId]
  );

  const updated = await getOverrunJustificationById(justificationId);

  return {
    status: 200,
    message:
      decision === "APPROVED"
        ? "Đã phê duyệt giải trình vượt dự toán thành công"
        : "Đã từ chối giải trình vượt dự toán và yêu cầu bổ sung",
    justification: updated,
  };
}

module.exports = {
  checkHasActualCosts,
  getBudgetVersions,
  getBudgetTree,
  saveBudgetVersion,
  ensureOverrunJustificationsTable,
  getOverrunJustifications,
  createOverrunJustification,
  verifyOverrunJustificationByAccountant,
  reviewOverrunJustification,
};
