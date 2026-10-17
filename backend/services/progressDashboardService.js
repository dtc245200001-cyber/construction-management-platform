"use strict";

// S-49 / T-124
// Tầng dữ liệu cho dashboard tiến độ dành cho Chủ đầu tư.
//
// Nguồn sự thật (đã xác minh trong source):
//   - Giá trị hợp đồng: work_items.contract_value = ROUND(quantity*unit_price,2)
//     GENERATED, chỉ trên HẠNG MỤC LÁ (leaf guard chặn cha giữ giá trị).
//   - Khối lượng đã nghiệm thu: chỉ tính phiếu status='approved'
//     (computeVoucherItems/acceptanceRoutes dùng đúng quy tắc này — KHÔNG tính
//     draft/pending_review/returned). Lũy kế đã duyệt mới nhất theo hạng mục lá.
//   - Baseline: projects.current_baseline_version -> baselines -> baseline_items
//     (planned_early_finish, was_critical). Chưa chốt baseline => has_baseline=false.
//   - Ngày hiện tại dự kiến: schedule_results.early_finish (is_critical, total_float).
//   - Mốc: milestones (is_active) + milestone_warnings (overdue_days).
//
// Quy tắc tiến độ theo GIÁ TRỊ (đã chốt, xem báo cáo):
//   value_percent = Σ(min(approved_cumulative, contract_quantity) * unit_price)
//                   / Σ contract_value  * 100
//   Chỉ cộng các lá có đủ contract_quantity & unit_price. Mẫu số = 0
//   (chưa khai giá trị hợp đồng) => value_percent = null (trạng thái "chưa đủ dữ liệu").
//   Tính tiền bằng BigInt đồng-cent (x100) để tránh sai số float; quantity x1000 (millis).

const db = require("../config/db");
const { workingDayDiff, DEFAULT_CALENDAR } = require("../algorithms/workingDays");

const MILLIS = 1000n;
const CENTS = 100n;

// ── helpers parse an toàn (không bao giờ NaN/Infinity) ────────────────────────

// NUMERIC(x,3) -> bigint millis (x1000). Trả null nếu không parse được.
function qtyToMillis(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const [i, f = ""] = abs.split(".");
  const m = BigInt(i || "0") * MILLIS + BigInt((f + "000").slice(0, 3));
  return neg ? -m : m;
}

// NUMERIC(16,2) tiền -> bigint cents (x100). Trả null nếu không parse được.
function moneyToCents(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const [i, f = ""] = abs.split(".");
  const c = BigInt(i || "0") * CENTS + BigInt((f + "00").slice(0, 2));
  return neg ? -c : c;
}

// bigint cents -> chuỗi tiền "1234.56" (an toàn, không dùng float).
function centsToStr(cents) {
  const neg = cents < 0n;
  const a = neg ? -cents : cents;
  const s = `${a / CENTS}.${String(a % CENTS).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

// Chia an toàn hai bigint -> number trong [0..100], làm tròn 2 chữ số.
// Trả null nếu mẫu số <= 0 (chưa đủ dữ liệu) hoặc đầu vào null.
function percentRatio(numerator, denominator) {
  if (numerator === null || denominator === null) return null;
  if (denominator <= 0n) return null;
  if (numerator < 0n) return null; // không cho âm
  // ratio*10000 để giữ 2 chữ số thập phân của phần trăm
  const pct100 = (numerator * 10000n) / denominator;
  let v = Number(pct100) / 100;
  if (!Number.isFinite(v)) return null;
  if (v > 100) v = 100; // clamp phòng dữ liệu lũy kế vượt hợp đồng
  return Math.round(v * 100) / 100;
}

function toDateStr(v) {
  if (!v) return null;
  // pg trả date là 'YYYY-MM-DD' (đã set typeParser), timestamp là Date|string
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

// ── truy vấn tổng hợp ────────────────────────────────────────────────────────

/**
 * Tổng hợp tiến độ theo giá trị hợp đồng cho một dự án.
 * 1 query gom lá + approved-cumulative + giá, tính BigInt ở tầng app (không N+1).
 */
async function computeValueProgress(projectId) {
  // Lấy mọi lá có hợp đồng + lũy kế đã duyệt mới nhất (DISTINCT ON) trong 1 query.
  const { rows } = await db.query(
    `
      SELECT
        wi.id,
        wi.quantity::text        AS contract_quantity,
        wi.unit,
        wi.unit_price::text      AS unit_price,
        wi.contract_value::text  AS contract_value,
        ap.cumulative_quantity::text AS approved_cumulative
      FROM work_items wi
      LEFT JOIN LATERAL (
        SELECT avi.cumulative_quantity
        FROM acceptance_voucher_items avi
        JOIN acceptance_vouchers av ON av.id = avi.voucher_id
        WHERE avi.work_item_id = wi.id
          AND av.project_id = $1
          AND av.status = 'approved'
        -- Đồng nhất với DB trigger + acceptanceApprovalService: reviewed_at DESC NULLS LAST
        ORDER BY av.reviewed_at DESC NULLS LAST, av.id DESC
        LIMIT 1
      ) ap ON true
      WHERE wi.project_id = $1
        AND wi.unit_price IS NOT NULL
        AND wi.quantity IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM work_items c WHERE c.parent_id = wi.id)
    `,
    [projectId]
  );

  let totalCents = 0n;
  let doneCents = 0n;
  let itemsWithContract = 0;
  let itemsMissingPrice = 0;

  for (const r of rows) {
    const priceCents = moneyToCents(r.unit_price);
    const contractQtyM = qtyToMillis(r.contract_quantity);
    const contractValCents = moneyToCents(r.contract_value);
    if (contractValCents === null || priceCents === null || contractQtyM === null) {
      itemsMissingPrice++;
      continue;
    }
    itemsWithContract++;
    totalCents += contractValCents;

    const doneQtyM = qtyToMillis(r.approved_cumulative) || 0n;
    // chặn lũy kế vượt hợp đồng để không thổi phồng tiến độ khi dữ liệu lỗi
    const cappedDoneQtyM = doneQtyM > contractQtyM ? contractQtyM : doneQtyM;
    // done value = price_cents * doneQty_millis / 1000  (giữ cent)
    doneCents += (priceCents * cappedDoneQtyM) / MILLIS;
  }

  const valuePercent = percentRatio(doneCents, totalCents);

  return {
    has_contract_data: itemsWithContract > 0,
    items_with_contract: itemsWithContract,
    items_missing_price: itemsMissingPrice,
    total_contract_value: centsToStr(totalCents),
    completed_value: centsToStr(doneCents),
    value_percent: valuePercent, // number | null
  };
}

/**
 * Chênh lệch ngày kết thúc so với baseline + mốc trễ + việc găng chậm.
 */
async function computeScheduleSection(projectId) {
  // Lịch làm việc + ngày nghỉ để tính working-day diff giống scheduleQuery.
  const calRes = await db.query("SELECT * FROM calendars WHERE project_id = $1", [projectId]);
  const holRes = await db.query("SELECT holiday_date FROM holidays WHERE project_id = $1", [projectId]);
  const calendar = calRes.rows.length > 0 ? calRes.rows[0] : DEFAULT_CALENDAR;
  const holidays = holRes.rows.map((r) => toDateStr(r.holiday_date));

  // Baseline hiện hành
  const blRes = await db.query(
    `
      SELECT b.id, b.version, b.frozen_at
      FROM projects p
      LEFT JOIN baselines b ON b.project_id = p.id AND b.version = p.current_baseline_version
      WHERE p.id = $1
    `,
    [projectId]
  );
  const baseline = blRes.rows[0] && blRes.rows[0].id ? blRes.rows[0] : null;
  const hasBaseline = Boolean(baseline);

  // Ngày kết thúc baseline = MAX(planned_early_finish)
  let plannedFinish = null;
  if (baseline) {
    const pf = await db.query(
      `SELECT MAX(planned_early_finish) AS m FROM baseline_items WHERE baseline_id = $1`,
      [baseline.id]
    );
    plannedFinish = toDateStr(pf.rows[0] && pf.rows[0].m);
  }

  // Ngày kết thúc dự kiến hiện tại = MAX(schedule_results.early_finish)
  const cf = await db.query(
    `
      SELECT MAX(sr.early_finish) AS m
      FROM schedule_results sr
      JOIN tasks t ON t.id = sr.task_id
      JOIN work_items wi ON wi.id = t.work_item_id
      WHERE wi.project_id = $1
    `,
    [projectId]
  );
  const currentFinish = toDateStr(cf.rows[0] && cf.rows[0].m);

  // Chênh lệch ngày (working days): dương = chậm, âm = sớm, 0 = đúng, null = thiếu baseline
  let finishVarianceWorkingDays = null;
  let scheduleStatus = "no_baseline";
  if (plannedFinish && currentFinish) {
    finishVarianceWorkingDays = workingDayDiff(plannedFinish, currentFinish, calendar, holidays);
    scheduleStatus =
      finishVarianceWorkingDays > 0 ? "late" : finishVarianceWorkingDays < 0 ? "early" : "on_track";
  } else if (!hasBaseline) {
    scheduleStatus = "no_baseline";
  } else {
    scheduleStatus = "insufficient_data";
  }

  // ── Mốc bị vượt (milestone_warnings đang mở) ──
  const msRes = await db.query(
    `
      SELECT
        m.id            AS milestone_id,
        wi.id           AS work_item_id,
        wi.code         AS work_item_code,
        wi.name         AS work_item_name,
        to_char(m.required_date, 'YYYY-MM-DD') AS required_date,
        mw.overdue_days AS overdue_days,
        mw.status       AS warning_status
      FROM milestone_warnings mw
      JOIN milestones m   ON m.id = mw.milestone_id
      JOIN work_items wi  ON wi.id = mw.work_item_id
      WHERE mw.project_id = $1 AND mw.status = 'open'
      ORDER BY mw.overdue_days DESC, m.required_date
      LIMIT 50
    `,
    [projectId]
  );

  // ── Công việc găng đang chậm ──
  // Găng = schedule_results.is_critical (theo CPM hiện hành). Chậm = chưa hoàn
  // thành (percent_complete<100 hoặc chưa có actual_end_date) và early_finish
  // đã quá hạn so với hôm nay HOẶC trễ hơn planned (baseline) khi có.
  const today = toDateStr(new Date());
  const critRes = await db.query(
    `
      SELECT
        t.id            AS task_id,
        t.name          AS task_name,
        wi.code         AS work_item_code,
        wi.name         AS work_item_name,
        COALESCE(t.percent_complete, 0) AS percent_complete,
        to_char(t.actual_start_date,'YYYY-MM-DD') AS actual_start_date,
        to_char(t.actual_end_date,'YYYY-MM-DD')   AS actual_end_date,
        to_char(sr.early_finish,'YYYY-MM-DD')     AS early_finish,
        to_char(bi.planned_early_finish,'YYYY-MM-DD') AS baseline_finish,
        sr.total_float
      FROM tasks t
      JOIN work_items wi ON wi.id = t.work_item_id
      JOIN schedule_results sr ON sr.task_id = t.id
      LEFT JOIN baselines b ON b.project_id = wi.project_id AND b.version = (
        SELECT current_baseline_version FROM projects WHERE id = wi.project_id
      )
      LEFT JOIN baseline_items bi ON bi.baseline_id = b.id AND bi.task_id = t.id
      WHERE wi.project_id = $1
        AND sr.is_critical = true
        AND COALESCE(t.percent_complete,0) < 100
        AND (
          sr.early_finish::date < $2::date
          OR (bi.planned_early_finish IS NOT NULL AND sr.early_finish::date > bi.planned_early_finish::date)
        )
      ORDER BY sr.early_finish NULLS LAST, t.id
      LIMIT 50
    `,
    [projectId, today]
  );

  const criticalDelayed = critRes.rows.map((r) => {
    let delayDays = null;
    if (r.baseline_finish && r.early_finish) {
      // chậm so với baseline: dương = trễ
      delayDays = workingDayDiff(r.baseline_finish, r.early_finish, calendar, holidays);
    } else if (r.early_finish && r.early_finish < today) {
      // không có baseline: quá hạn tính tới hôm nay
      delayDays = workingDayDiff(r.early_finish, today, calendar, holidays);
    }
    return {
      task_id: r.task_id,
      task_name: r.task_name,
      work_item_code: r.work_item_code,
      work_item_name: r.work_item_name,
      percent_complete: r.percent_complete,
      planned_finish: r.baseline_finish || null,
      current_finish: r.early_finish || null,
      delay_days: delayDays,
      delay_basis: r.baseline_finish ? "baseline" : "overdue",
    };
  });

  const overdueMilestones = msRes.rows.map((r) => ({
    milestone_id: r.milestone_id,
    work_item_id: r.work_item_id,
    work_item_code: r.work_item_code,
    work_item_name: r.work_item_name,
    required_date: r.required_date,
    overdue_days: r.overdue_days,
  }));

  return {
    has_baseline: hasBaseline,
    baseline_version: baseline ? baseline.version : null,
    planned_finish: plannedFinish,
    current_finish: currentFinish,
    finish_variance_working_days: finishVarianceWorkingDays,
    schedule_status: scheduleStatus,
    overdue_milestones: overdueMilestones,
    critical_delayed_tasks: criticalDelayed,
  };
}

/**
 * API chính cho dashboard. Trả cấu trúc rõ phần nào có/thiếu dữ liệu.
 */
async function getProgressDashboard(projectId) {
  const [value, schedule] = await Promise.all([
    computeValueProgress(projectId),
    computeScheduleSection(projectId),
  ]);

  // Cờ trạng thái dữ liệu để UI phân biệt "0" thật vs "chưa đủ dữ liệu".
  const dataStatus = {
    value: value.has_contract_data
      ? value.value_percent === null
        ? "insufficient"
        : "ok"
      : "no_contract",
    schedule: schedule.schedule_status,
    milestones: schedule.overdue_milestones.length > 0 ? "ok" : "empty",
    critical: schedule.critical_delayed_tasks.length > 0 ? "ok" : "empty",
  };

  return {
    project_id: projectId,
    generated_at: new Date().toISOString(),
    progress: {
      value_percent: value.value_percent, // null = chưa đủ dữ liệu
      total_contract_value: value.total_contract_value,
      completed_value: value.completed_value,
      currency: "VND",
    },
    schedule: {
      has_baseline: schedule.has_baseline,
      baseline_version: schedule.baseline_version,
      planned_finish: schedule.planned_finish,
      current_finish: schedule.current_finish,
      finish_variance_working_days: schedule.finish_variance_working_days,
      status: schedule.schedule_status,
    },
    overdue_milestones: schedule.overdue_milestones,
    critical_delayed_tasks: schedule.critical_delayed_tasks,
    data_status: dataStatus,
  };
}

module.exports = {
  getProgressDashboard,
  // export để test đơn vị
  _internal: { qtyToMillis, moneyToCents, centsToStr, percentRatio },
};
