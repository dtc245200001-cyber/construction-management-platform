
"use strict";

const db = require("../config/db");

const ALERT_THRESHOLD = "0.80";

async function getBudgetSummary(projectId) {
    const { rows } = await db.query(
        `
    WITH RECURSIVE
    latest_version AS (
      SELECT id, version_number
      FROM budget_versions
      WHERE project_id = $1
      ORDER BY version_number DESC
      LIMIT 1
    ),
    item_base AS (
      SELECT
        wi.id,
        wi.parent_id,
        wi.code,
        wi.name,
        wi.quantity::numeric AS contract_quantity,
        NOT EXISTS (
          SELECT 1
          FROM work_items child
          WHERE child.parent_id = wi.id
        ) AS is_leaf,
        lv.id IS NOT NULL AS has_budget_version,
        CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM work_items child
            WHERE child.parent_id = wi.id
          )
          THEN bi.amount
          ELSE NULL
        END AS budget_amount,
        COALESCE(ac.actual_cost, 0)::numeric AS direct_actual_cost,
        ap.cumulative_quantity::numeric AS approved_quantity
      FROM work_items wi
      LEFT JOIN latest_version lv ON true
      LEFT JOIN budget_items bi
        ON bi.work_item_id = wi.id
       AND bi.budget_version_id = lv.id
      LEFT JOIN LATERAL (
        SELECT SUM(cost.amount) AS actual_cost
        FROM actual_costs cost
        WHERE cost.project_id = $1
          AND cost.work_item_id = wi.id
      ) ac ON true
      LEFT JOIN LATERAL (
        SELECT avi.cumulative_quantity
        FROM acceptance_voucher_items avi
        JOIN acceptance_vouchers av
          ON av.id = avi.voucher_id
        WHERE avi.work_item_id = wi.id
          AND av.project_id = $1
          AND av.status = 'approved'
        ORDER BY av.reviewed_at DESC NULLS LAST, av.id DESC
        LIMIT 1
      ) ap ON true
      WHERE wi.project_id = $1
    ),
    tree_paths(ancestor_id, descendant_id, path, depth) AS (
      SELECT id, id, ARRAY[id], 1
      FROM item_base

      UNION ALL

      SELECT
        tp.ancestor_id,
        child.id,
        tp.path || child.id,
        tp.depth + 1
      FROM tree_paths tp
      JOIN item_base child
        ON child.parent_id = tp.descendant_id
      WHERE NOT (child.id = ANY(tp.path))
        AND tp.depth < 100
    ),
    rollups AS (
      SELECT
        tp.ancestor_id AS id,
        COALESCE(
          SUM(ib.budget_amount)
            FILTER (WHERE ib.is_leaf),
          0
        )::numeric AS total_budget,
        COALESCE(SUM(ib.direct_actual_cost), 0)::numeric
          AS total_actual_cost,
        COALESCE(
          BOOL_OR(
            ib.has_budget_version
            AND ib.budget_amount IS NOT NULL
          ) FILTER (WHERE ib.is_leaf),
          false
        ) AS has_budget
      FROM tree_paths tp
      JOIN item_base ib
        ON ib.id = tp.descendant_id
      GROUP BY tp.ancestor_id
    ),


    leaf_alerts AS (
      SELECT
        ib.id,
        (
          ib.has_budget_version
          AND ib.budget_amount IS NOT NULL
          AND ib.budget_amount > 0
          AND ib.direct_actual_cost >
              ib.budget_amount * ${ALERT_THRESHOLD}
          AND ib.contract_quantity IS NOT NULL
          AND ib.contract_quantity > 0
          AND COALESCE(ib.approved_quantity, 0) <
              ib.contract_quantity * ${ALERT_THRESHOLD}
        ) AS has_alert
      FROM item_base ib
      WHERE ib.is_leaf
    ),
    alert_rollups AS (
      SELECT
        tp.ancestor_id AS id,
        BOOL_OR(COALESCE(la.has_alert, false)) AS has_alert
      FROM tree_paths tp
      JOIN item_base ib
        ON ib.id = tp.descendant_id
      LEFT JOIN leaf_alerts la
        ON la.id = ib.id
      GROUP BY tp.ancestor_id
    )
    SELECT
      ib.id,
      ib.parent_id,
      ib.code,
      ib.name,
      ib.is_leaf,
      ib.contract_quantity,
      ib.approved_quantity::text AS approved_quantity,
        r.has_budget,
      r.total_budget::text AS total_budget,
      r.total_actual_cost::text AS total_actual_cost,
      CASE
        WHEN r.total_budget > 0
        THEN ROUND(
          r.total_actual_cost / r.total_budget * 100,
          2
        )::text
        ELSE NULL
      END AS utilization_percent,
      COALESCE(ar.has_alert, false) AS has_alert,
      CASE
        WHEN COALESCE(ar.has_alert, false)
        THEN 'ACTUAL_COST_OVER_80_AND_ACCEPTANCE_BELOW_80'
        ELSE NULL
      END AS alert_code
    FROM item_base ib
    JOIN rollups r ON r.id = ib.id
    LEFT JOIN alert_rollups ar ON ar.id = ib.id
    ORDER BY ib.id
    `,
        [projectId]
    );
    const versionResult = await db.query(
        `
    SELECT version_number
    FROM budget_versions
    WHERE project_id = $1
    ORDER BY version_number DESC
    LIMIT 1
    `,
        [projectId]
    );


    // Khi dự án chưa có phiên bản dự toán, CTE latest_version rỗng.
    // Trả về dữ liệu WBS nhưng không tạo cảnh báo giả.
    if (versionResult.rows.length === 0) {
        const result = await db.query(
            `
      SELECT
        wi.id,
        wi.parent_id,
        wi.code,
        wi.name,
        NOT EXISTS (
          SELECT 1 FROM work_items child
          WHERE child.parent_id = wi.id
        ) AS is_leaf,
        wi.quantity::numeric AS contract_quantity,
        NULL::text AS approved_quantity,
        false AS has_budget,
        '0.00' AS total_budget,
        COALESCE((
          SELECT SUM(ac.amount)
          FROM actual_costs ac
          WHERE ac.project_id = $1
            AND ac.work_item_id = wi.id
        ), 0)::text AS direct_actual_cost
      FROM work_items wi
      WHERE wi.project_id = $1
      ORDER BY wi.id
      `,
            [projectId]
        );

        return {
            project_id: projectId,
            budget_version: null,
            alert_threshold_percent: 80,
            items: result.rows.map((item) => ({
                ...item,
                total_actual_cost: item.direct_actual_cost,
                utilization_percent: null,
                has_alert: false,
                alert_code: null,
            })),
        };
    }



    return {
        project_id: projectId,
        budget_version: versionResult.rows[0]?.version_number ?? null,
        alert_threshold_percent: 80,
        items: rows,
    };
}

module.exports = {
    getBudgetSummary,
};
