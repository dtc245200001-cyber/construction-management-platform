
"use strict";

const db = require("../config/db");

const DEFAULT_ALERT_THRESHOLD = 0.8;

/**
 * T-122 & T-123 (S-48): Tổng hợp dự toán hiện hành và chi phí thực tế theo cây WBS.
 * - Cộng dồn dự toán và thực chi từ lá lên cha.
 * - Tính tỷ lệ sử dụng dự toán (utilization_percent = total_actual_cost / total_budget * 100).
 * - Cảnh báo vượt ngưỡng: khi chi phí > 80% (hoặc ngưỡng cấu hình) và nghiệm thu < 80%.
 * - Hiển thị trạng thái "đã hết cảnh báo" (RESOLVED) khi chi phí > 80% nhưng khối lượng nghiệm thu đã đạt >= 80%.
 * - Tránh chia cho 0 khi chưa có dự toán.
 */
async function getBudgetSummary(projectId, options = {}) {
  let threshold = DEFAULT_ALERT_THRESHOLD;
  if (options && options.threshold !== undefined && options.threshold !== null) {
    const parsed = parseFloat(options.threshold);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 10) {
      threshold = parsed > 1 ? parsed / 100 : parsed;
    }
  }

  const alertThresholdDecimal = threshold.toString();
  const alertThresholdPercent = Math.round(threshold * 100);

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
              ib.budget_amount * $2
          AND ib.contract_quantity IS NOT NULL
          AND ib.contract_quantity > 0
          AND COALESCE(ib.approved_quantity, 0) <
              ib.contract_quantity * $2
        ) AS has_alert,
        (
          ib.has_budget_version
          AND ib.budget_amount IS NOT NULL
          AND ib.budget_amount > 0
          AND ib.direct_actual_cost >
              ib.budget_amount * $2
          AND ib.contract_quantity IS NOT NULL
          AND ib.contract_quantity > 0
          AND COALESCE(ib.approved_quantity, 0) >=
              ib.contract_quantity * $2
        ) AS is_resolved
      FROM item_base ib
      WHERE ib.is_leaf
    ),
    alert_rollups AS (
      SELECT
        tp.ancestor_id AS id,
        BOOL_OR(COALESCE(la.has_alert, false)) AS has_alert,
        COUNT(la.id) FILTER (WHERE la.has_alert)::int AS alert_count,
        BOOL_OR(COALESCE(la.is_resolved, false)) AS has_resolved_descendant
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
      ib.contract_quantity::text AS contract_quantity,
      ib.approved_quantity::text AS approved_quantity,
      CASE
        WHEN ib.is_leaf AND ib.contract_quantity > 0
        THEN ROUND(
          COALESCE(ib.approved_quantity, 0) / ib.contract_quantity * 100,
          2
        )::text
        ELSE NULL
      END AS acceptance_percent,
      ib.budget_amount::text AS budget_amount,
      ib.direct_actual_cost::text AS direct_actual_cost,
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
      COALESCE(ar.alert_count, 0) AS alert_count,
      CASE
        WHEN COALESCE(ar.has_alert, false)
        THEN 'ACTUAL_COST_OVER_80_AND_ACCEPTANCE_BELOW_80'
        ELSE NULL
      END AS alert_code,
      CASE
        WHEN COALESCE(ar.has_alert, false) THEN 'WARNING'
        WHEN ib.is_leaf AND COALESCE(la.is_resolved, false) THEN 'RESOLVED'
        WHEN NOT ib.is_leaf AND COALESCE(ar.has_resolved_descendant, false) AND NOT COALESCE(ar.has_alert, false) THEN 'RESOLVED'
        WHEN r.has_budget THEN 'NORMAL'
        ELSE 'NO_BUDGET'
      END AS alert_status,
      CASE
        WHEN COALESCE(ar.has_alert, false)
        THEN 'Chi phí thực tế vượt ngưỡng dự toán trong khi khối lượng nghiệm thu chưa đạt tương ứng'
        WHEN (ib.is_leaf AND COALESCE(la.is_resolved, false)) OR (NOT ib.is_leaf AND COALESCE(ar.has_resolved_descendant, false) AND NOT COALESCE(ar.has_alert, false))
        THEN 'Đã hết cảnh báo (Khối lượng nghiệm thu đạt tiến độ tương ứng chi phí)'
        WHEN r.has_budget
        THEN 'Trong ngưỡng an toàn'
        ELSE 'Chưa lập dự toán'
      END AS alert_message
    FROM item_base ib
    JOIN rollups r ON r.id = ib.id
    LEFT JOIN alert_rollups ar ON ar.id = ib.id
    LEFT JOIN leaf_alerts la ON la.id = ib.id
    ORDER BY ib.id
    `,
    [projectId, alertThresholdDecimal]
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

  return {
    project_id: projectId,
    budget_version: versionResult.rows[0]?.version_number ?? null,
    alert_threshold_percent: alertThresholdPercent,
    items: rows,
  };
}

module.exports = {
  getBudgetSummary,
};
