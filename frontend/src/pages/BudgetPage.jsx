import React, { useState, useEffect, useCallback, useMemo, useContext } from "react";
import { useLocation } from "react-router-dom";
import api from "../lib/api";
import { buildTree } from "../utils/buildTree";
import {
  formatMoneyVND,
  formatInputDisplayVN,
  normalizeDecimalInput,
  parseVietnameseNumber,
} from "../utils/decimal";
import { PermissionContext } from "../contexts/permissionContext";
import { can, ROLE_LABELS, SYSTEM_ADMIN_ROLE } from "../config/permissions";
import {
  ChevronRight,
  ChevronDown,
  Pencil,
  AlertTriangle,
  RefreshCw,
  FolderTree,
  Coins,
  History,
  Layers,
  Save,
  CheckCircle2,
  Info,
  Search,
  X,
  Filter,
  GitCompare,
  ChevronsDownUp,
  ChevronsUpDown,
  ShieldAlert,
  ShieldCheck,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FileClock,
  Lock,
  Sparkles,
  Gauge,
  FileWarning,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

// Danh mục lý do điều chỉnh dự toán chuẩn hóa (QoL #3)
const ADJUSTMENT_REASONS = [
  { value: "Điều chỉnh khối lượng", label: "Điều chỉnh khối lượng" },
  { value: "Thay đổi đơn giá", label: "Thay đổi đơn giá" },
  { value: "Phát sinh hạng mục", label: "Phát sinh hạng mục" },
  { value: "Cập nhật định mức dự toán", label: "Cập nhật định mức dự toán" },
  { value: "Lý do khác", label: "Lý do khác" },
];

// Phân loại nguyên nhân giải trình khi chi phí / đề nghị thanh toán vượt ngân sách còn lại
const OVERRUN_JUSTIFICATION_TYPES = [
  {
    value: "Phát sinh khối lượng hiện trường đã có chủ trương",
    label: "Phát sinh khối lượng hiện trường đã có chủ trương",
  },
  {
    value: "Biến động đơn giá vật tư / nhân công thực tế",
    label: "Biến động đơn giá vật tư / nhân công thực tế",
  },
  {
    value: "Bù trừ từ hạng mục tiết kiệm khác trong cùng dự án",
    label: "Bù trừ từ hạng mục tiết kiệm khác trong cùng dự án",
  },
  {
    value: "Đang chờ phê duyệt phụ lục điều chỉnh dự toán",
    label: "Đang chờ phê duyệt phụ lục điều chỉnh dự toán",
  },
];

// Các bộ lọc nhanh trên cây WBS (QoL #1 + Bộ lọc Cảnh báo ngưỡng)
const FILTER_OPTIONS = [
  { value: "all", label: "Tất cả hạng mục" },
  { value: "unallocated", label: "Chưa nhập dự toán" },
  { value: "allocated", label: "Đã có dự toán" },
  { value: "warning_overrun", label: "Cảnh báo / Vượt ngưỡng" },
  { value: "leaf", label: "Hạng mục lá" },
  { value: "parent", label: "Hạng mục cha" },
];

// ── Dữ liệu mẫu phục vụ chế độ Xem thử Giao diện (Mock Sandbox — Không chạm DB) ──
const DEMO_WBS_STRUCTURE = [
  { id: 1, parent_id: null, code: "HM-01", name: "Phần ngầm & Móng công trình", is_leaf: false },
  { id: 2, parent_id: 1, code: "HM-01.01", name: "Đào đất hố móng & vận chuyển", is_leaf: true },
  { id: 3, parent_id: 1, code: "HM-01.02", name: "Bê tông lót móng M150", is_leaf: true },
  { id: 4, parent_id: 1, code: "HM-01.03", name: "Gia công & lắp dựng cốt thép móng", is_leaf: true },
  { id: 5, parent_id: 1, code: "HM-01.04", name: "Chống thấm cổ móng & bể ngầm", is_leaf: true },
  { id: 6, parent_id: null, code: "HM-02", name: "Phần thân & Kết cấu bê tông", is_leaf: false },
  { id: 7, parent_id: 6, code: "HM-02.01", name: "Kết cấu cột, dầm, sàn tầng 1", is_leaf: false },
  { id: 8, parent_id: 7, code: "HM-02.01.01", name: "Bê tông thương phẩm C30 tầng 1", is_leaf: true },
  { id: 9, parent_id: 7, code: "HM-02.01.02", name: "Cốt thép & ván khuôn tầng 1", is_leaf: true },
  { id: 10, parent_id: 6, code: "HM-02.02", name: "Xây tường bao & ngăn phòng tầng 1", is_leaf: true },
  { id: 11, parent_id: null, code: "HM-03", name: "Hoàn thiện & Cơ điện (MEP)", is_leaf: false },
  { id: 12, parent_id: 11, code: "HM-03.01", name: "Hệ thống cấp thoát nước trục đứng", is_leaf: true },
  { id: 13, parent_id: 11, code: "HM-03.02", name: "Hệ thống điện chiếu sáng & tủ tổng", is_leaf: true },
];

// Dữ liệu đối chiếu độc lập (Tách biệt: Giá trị hợp đồng vs Thực chi vs Đề nghị thanh toán vs Tiến độ nghiệm thu)
const DEMO_USERS = [
  {
    id: 10,
    key: "bql_10",
    name: "Nguyễn Văn Quản Lý",
    role: "ban_quan_ly",
    label: "Ban quản lý — Nguyễn Văn Quản Lý (ID #10)",
    hasIndependentReviewerInProject: true,
  },
  {
    id: 20,
    key: "cdt_20",
    name: "Ông Trần Hoàng (Chủ đầu tư 1)",
    role: "chu_dau_tu",
    label: "Chủ đầu tư 1 — Ông Trần Hoàng (ID #20)",
    hasIndependentReviewerInProject: true,
  },
  {
    id: 25,
    key: "cdt_25",
    name: "Bà Nguyễn Lan (Chủ đầu tư 2 — Độc lập)",
    role: "chu_dau_tu",
    label: "Chủ đầu tư 2 — Bà Nguyễn Lan (ID #25 - Duyệt độc lập)",
    hasIndependentReviewerInProject: true,
  },
  {
    id: 30,
    key: "cdt_solo_30",
    name: "Ông Lê Độc Lập (CĐT duy nhất trong dự án)",
    role: "chu_dau_tu",
    label: "CĐT duy nhất — Ông Lê Độc Lập (ID #30 - Không có người duyệt độc lập)",
    hasIndependentReviewerInProject: false,
  },
  {
    id: 40,
    key: "ke_toan_40",
    name: "Phạm Thị Kế Toán",
    role: "ke_toan",
    label: "Kế toán — Phạm Thị Kế Toán (ID #40 - Đối chiếu & Xác nhận số liệu)",
    hasIndependentReviewerInProject: true,
  },
  {
    id: 50,
    key: "cht_50",
    name: "Hoàng Chỉ Huy Trưởng",
    role: "chi_huy_truong",
    label: "Chỉ huy trưởng — Hoàng Chỉ Huy (ID #50 - Chỉ xem)",
    hasIndependentReviewerInProject: true,
  },
];

const INITIAL_DEMO_CONTROL_METRICS = {
  2: {
    contract_value: "110000000.00",
    actual_cost: "92000000.00", // ~96.8% dự toán v2 (95tr), nghiệm thu 100% -> Chạm ngưỡng >= 80%
    approved_payment: "80000000.00",
    pending_payment: "15000000.00",
    acceptance_pct: 100,
    justification: null,
  },
  3: {
    contract_value: "135000000.00",
    actual_cost: "118000000.00",
    approved_payment: "100000000.00",
    pending_payment: "28000000.00", // Đã duyệt 100tr + Đề nghị kỳ này 28tr = 128tr > Dự toán 120tr (Vượt ngân sách còn lại +8tr)
    acceptance_pct: 95,
    justification: {
      id: 101,
      reason_type: "Phát sinh khối lượng hiện trường đã có chủ trương",
      explanation:
        "Tăng chiều dày lớp bê tông lót đáy móng thêm 5cm tại trục B-C theo biên bản hiện trường số 04/BB-HT.",
      legal_document_ref: "04/BB-HT-2026",
      submitted_by: 10,
      submitted_by_name: "Nguyễn Văn Quản Lý",
      submitted_by_role: "ban_quan_ly",
      submitted_at: "2026-10-21T14:20:00Z",
      accountant_verified_by: null,
      accountant_verified_by_name: null,
      accountant_verified_at: null,
      accountant_note: null,
      status: "PENDING_APPROVAL",
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_by_role: null,
      reviewed_at: null,
      review_note: null,
    },
  },
  4: {
    contract_value: "330000000.00",
    actual_cost: "260000000.00", // ~88.1% dự toán (295tr), nhưng nghiệm thu mới 62% (<80%) -> Cảnh báo đội vốn sớm (S-48)!
    approved_payment: "180000000.00",
    pending_payment: "0.00",
    acceptance_pct: 62,
    justification: null,
  },
  5: {
    contract_value: "50000000.00",
    actual_cost: "49500000.00", // 110% dự toán (45tr) -> Vượt trần 100% dự toán! Do CĐT 1 (#20) tự lập giải trình -> CĐT 1 không được tự duyệt!
    approved_payment: "40000000.00",
    pending_payment: "8000000.00",
    acceptance_pct: 90,
    justification: {
      id: 102,
      reason_type: "Biến động đơn giá vật tư / nhân công thực tế",
      explanation:
        "Đổi chủng loại màng chống thấm khò nóng dày 4mm theo yêu cầu kỹ thuật của đại diện Chủ đầu tư.",
      legal_document_ref: "TT-09/2026/CT-BQL",
      submitted_by: 20,
      submitted_by_name: "Ông Trần Hoàng (Chủ đầu tư 1)",
      submitted_by_role: "chu_dau_tu",
      submitted_at: "2026-10-21T16:05:00Z",
      accountant_verified_by: 40,
      accountant_verified_by_name: "Phạm Thị Kế Toán",
      accountant_verified_at: "2026-10-21T16:40:00Z",
      accountant_note:
        "Đã đối chiếu hóa đơn vật tư màng khò nóng 4mm và biên bản nghiệm thu đầu vào.",
      status: "PENDING_APPROVAL",
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_by_role: null,
      reviewed_at: null,
      review_note: null,
    },
  },
  8: {
    contract_value: "520000000.00",
    actual_cost: "290000000.00", // ~60.4% dự toán (An toàn)
    approved_payment: "250000000.00",
    pending_payment: "40000000.00",
    acceptance_pct: 65,
    justification: null,
  },
  9: {
    contract_value: "410000000.00",
    actual_cost: "190000000.00", // 50% dự toán (An toàn)
    approved_payment: "180000000.00",
    pending_payment: "0.00",
    acceptance_pct: 55,
    justification: null,
  },
  12: {
    contract_value: "210000000.00",
    actual_cost: "75000000.00", // ~39.5% dự toán (An toàn)
    approved_payment: "60000000.00",
    pending_payment: "0.00",
    acceptance_pct: 45,
    justification: null,
  },
};

const INITIAL_DEMO_VERSIONS = [
  {
    id: 2,
    project_id: 1,
    version_number: 2,
    status: "APPROVED",
    description:
      "[Điều chỉnh khối lượng] Cập nhật đơn giá bê tông C30 và bổ sung chống thấm bể ngầm",
    created_by: 1,
    created_by_name: "Nguyễn Văn Quản Lý (BQL)",
    created_at: "2026-10-20T09:15:00Z",
    leafMap: {
      2: { amount: "95000000.00", note: "Tăng khối lượng vận chuyển đất" },
      3: { amount: "120000000.00", note: "Bê tông thương phẩm M150" },
      4: { amount: "295000000.00", note: "Tối ưu hao hụt thép móng" },
      5: { amount: "45000000.00", note: "Bổ sung màng chống thấm 2 lớp" },
      8: { amount: "480000000.00", note: "Điều chỉnh theo giá trạm trộn tháng 10" },
      9: { amount: "380000000.00", note: "Thép Việt Nhật SD390" },
      12: { amount: "190000000.00", note: "Ống PPR và phụ kiện" },
    },
  },
  {
    id: 1,
    project_id: 1,
    version_number: 1,
    status: "APPROVED",
    description: "[Cập nhật định mức dự toán] Phiên bản dự toán cơ sở ban đầu",
    created_by: 1,
    created_by_name: "Nguyễn Văn Quản Lý (BQL)",
    created_at: "2026-10-12T08:00:00Z",
    leafMap: {
      2: { amount: "85000000.00", note: "Đào đất thủ công kết hợp máy" },
      3: { amount: "120000000.00", note: "Bê tông thương phẩm M150" },
      4: { amount: "310000000.00", note: "Thép móng theo bản vẽ thiết kế" },
      8: { amount: "450000000.00", note: "Bê tông C30" },
      9: { amount: "380000000.00", note: "Thép Việt Nhật SD390" },
      12: { amount: "190000000.00", note: "Ống PPR và phụ kiện" },
    },
  },
];

function buildDemoTreeResponse(versionObj, hasActualCosts) {
  const leafMap = versionObj?.leafMap || {};
  const childrenByParent = new Map();
  DEMO_WBS_STRUCTURE.forEach((w) => {
    const pid = w.parent_id || 0;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(w);
  });

  function calcTotal(nodeId) {
    const node = DEMO_WBS_STRUCTURE.find((x) => x.id === nodeId);
    if (!node) return 0;
    if (node.is_leaf) {
      const entry = leafMap[node.id];
      return entry?.amount ? Number(entry.amount) : 0;
    }
    const kids = childrenByParent.get(node.id) || [];
    return kids.reduce((sum, k) => sum + calcTotal(k.id), 0);
  }

  let projectTotalNum = 0;
  const items = DEMO_WBS_STRUCTURE.map((w) => {
    const entry = w.is_leaf ? leafMap[w.id] : null;
    const totalNum = calcTotal(w.id);
    if (w.is_leaf && entry?.amount) {
      projectTotalNum += Number(entry.amount);
    }
    return {
      ...w,
      amount: entry?.amount ?? null,
      note: entry?.note ?? null,
      total_budget: totalNum.toFixed(2),
    };
  });

  return {
    project_id: 1,
    has_actual_costs: hasActualCosts,
    version: versionObj
      ? {
          id: versionObj.id,
          project_id: 1,
          version_number: versionObj.version_number,
          status: versionObj.status || "APPROVED",
          description: versionObj.description,
          created_by: versionObj.created_by,
          created_by_name: versionObj.created_by_name,
          created_at: versionObj.created_at,
        }
      : null,
    project_total: projectTotalNum.toFixed(2),
    items,
  };
}

/**
 * Xác định màu sắc và phân vùng của Thanh phần trăm kiểm soát ngân sách (Chi phí thực tế / Dự toán được duyệt):
 * - Chưa có dự toán hoặc mẫu số <= 0: xám (no_basis)
 * - Dưới ngưỡng cảnh báo (< warnThresholdPct, mặc định < 80%): Xanh lá (green / bg-emerald-500)
 * - Trong ngưỡng cảnh báo (80% - < 90%): Màu vàng (yellow / bg-yellow-400)
 * - Gần mức trần (90% - < 100%): Màu cam (orange / bg-orange-500)
 * - Chạm và vượt mức trần (>= 100%): Màu đỏ (red / bg-red-600)
 */
function resolveBudgetProgressBarColor({
  hasBudgetBasis,
  actualRatioPct,
  warnThresholdPct = 80,
  limitThresholdPct = 100,
}) {
  if (!hasBudgetBasis || actualRatioPct === null || actualRatioPct === undefined) {
    return {
      zone: "no_basis",
      barColorClass: "bg-slate-300 dark:bg-slate-700",
      textColorClass: "text-amber-700 dark:text-amber-300",
      zoneLabel: "Chưa có cơ sở dự toán",
    };
  }

  const nearLimitStartPct = Math.max(
    warnThresholdPct,
    Math.min(limitThresholdPct - 0.001, Math.max(90, (warnThresholdPct + limitThresholdPct) / 2))
  );

  // 1. Chạm và vượt mức trần (>= 100%) -> Đỏ
  if (actualRatioPct >= limitThresholdPct - 0.0001) {
    return {
      zone: "at_or_over_limit",
      barColorClass: "bg-red-600",
      textColorClass: "text-red-600 font-bold",
      zoneLabel: `Chạm / vượt mức trần (≥ ${limitThresholdPct}%)`,
    };
  }

  // 2. Gần mức trần (90% - < 100%) -> Cam
  if (actualRatioPct >= nearLimitStartPct) {
    return {
      zone: "near_limit",
      barColorClass: "bg-orange-500",
      textColorClass: "text-orange-600 font-semibold",
      zoneLabel: `Gần mức trần (${nearLimitStartPct}% - <${limitThresholdPct}%)`,
    };
  }

  // 3. Trong ngưỡng cảnh báo (80% - < 90%) -> Vàng
  if (actualRatioPct >= warnThresholdPct) {
    return {
      zone: "in_warning",
      barColorClass: "bg-yellow-400",
      textColorClass: "text-amber-700 dark:text-amber-400 font-semibold",
      zoneLabel: `Trong ngưỡng cảnh báo (${warnThresholdPct}% - <${nearLimitStartPct}%)`,
    };
  }

  // 4. Dưới ngưỡng cảnh báo (< 80%) -> Xanh lá
  return {
    zone: "safe_green",
    barColorClass: "bg-emerald-500",
    textColorClass: "text-emerald-700 dark:text-emerald-400 font-semibold",
    zoneLabel: `Dưới ngưỡng cảnh báo (< ${warnThresholdPct}%)`,
  };
}

/**
 * Đánh giá trạng thái kiểm soát ngân sách của một hạng mục dựa trên:
 * - Dự toán phiên bản đã duyệt / đang có hiệu lực (budgetAmount)
 * - Chi phí thực tế đã được ghi nhận chính thức (actualCost - S-47)
 * - Đề nghị thanh toán lũy kế + kỳ này (approvedPayment + pendingPayment - S-43)
 * - Tỷ lệ khối lượng nghiệm thu (acceptancePct - S-36)
 * - Ngưỡng cảnh báo cấu hình (warnThresholdPct = 80%, limitThresholdPct = 100%)
 */
function evaluateItemBudgetControl({
  budgetAmount,
  actualCost,
  approvedPayment,
  pendingPayment,
  acceptancePct,
  warnThresholdPct = 80,
  limitThresholdPct = 100,
  justification = null,
}) {
  const budget = Number(budgetAmount || 0);
  const actual = Number(actualCost || 0);
  const approvedPay = Number(approvedPayment || 0);
  const pendingPay = Number(pendingPayment || 0);
  const totalPaymentRequested = approvedPay + pendingPay;
  const hasBudgetBasis = budget > 0;
  const remainingBudgetForActual = budget - actual;
  const remainingBudgetBeforePending = Math.max(budget - approvedPay, 0);
  const paymentOverrunAmount = Math.max(totalPaymentRequested - budget, 0);
  const actualOverrunAmount = Math.max(actual - budget, 0);

  if (!hasBudgetBasis) {
    const hasSpend = actual > 0 || totalPaymentRequested > 0;
    const colorMeta = resolveBudgetProgressBarColor({
      hasBudgetBasis: false,
      actualRatioPct: null,
      warnThresholdPct,
      limitThresholdPct,
    });
    return {
      budget,
      actual,
      approvedPay,
      pendingPay,
      totalPaymentRequested,
      hasBudgetBasis: false,
      remainingBudgetForActual,
      remainingBudgetBeforePending,
      paymentOverrunAmount,
      actualOverrunAmount,
      actualRatioPct: null,
      actualRatioDisplay: "Chưa có cơ sở dự toán",
      paymentRatioPct: null,
      acceptancePct: acceptancePct ?? null,
      level: hasSpend ? "overrun" : "unallocated",
      badgeLabel: hasSpend ? "Chi khi chưa có dự toán" : "Chưa có cơ sở dự toán",
      isWarningOrOverrun: hasSpend,
      justification,
      ...colorMeta,
    };
  }

  const actualRatioPct = (actual / budget) * 100;
  const paymentRatioPct = (totalPaymentRequested / budget) * 100;
  const colorMeta = resolveBudgetProgressBarColor({
    hasBudgetBasis: true,
    actualRatioPct,
    warnThresholdPct,
    limitThresholdPct,
  });

  // Kiểm tra chạm hoặc vượt trần (Actual >= 100% hoặc Đề nghị thanh toán > Ngân sách dự toán)
  const isActualAtOrOverLimit = actualRatioPct >= limitThresholdPct - 0.0001;
  const isPaymentOverBudget = totalPaymentRequested > budget + 0.005;

  // Kiểm tra cảnh báo đội vốn sớm (S-48): Thực chi >= ngưỡng 80% nhưng nghiệm thu < 80%
  const isDisproportionateProgress =
    actualRatioPct >= warnThresholdPct &&
    acceptancePct !== null &&
    acceptancePct !== undefined &&
    Number(acceptancePct) < warnThresholdPct;

  const isNearThreshold =
    actualRatioPct >= warnThresholdPct || paymentRatioPct >= warnThresholdPct;

  let level = "safe";
  let badgeLabel = "Trong hạn mức";

  if (
    isActualAtOrOverLimit ||
    isPaymentOverBudget ||
    isDisproportionateProgress ||
    isNearThreshold
  ) {
    if (
      justification?.status === "APPROVED" ||
      justification?.status === "APPROVED_EXCEPTION"
    ) {
      level = "approved_override";
      badgeLabel = "Đã duyệt giải trình";
    } else if (justification?.status === "PENDING_ASSIGNMENT") {
      level = "pending_assignment";
      badgeLabel = "Chờ phân công duyệt";
    } else if (justification?.status === "REJECTED") {
      level = "rejected_override";
      badgeLabel = "Đã từ chối giải trình";
    } else if (justification?.status === "PENDING_APPROVAL") {
      level = "pending_override";
      badgeLabel = "Chờ CĐT duyệt";
    } else if (isActualAtOrOverLimit || isPaymentOverBudget) {
      level = "overrun";
      badgeLabel = isPaymentOverBudget
        ? "Đề nghị vượt dự toán"
        : actualRatioPct > limitThresholdPct + 0.001
        ? "Thực chi vượt dự toán"
        : `Chạm mức trần ${limitThresholdPct}%`;
    } else if (isDisproportionateProgress) {
      level = "early_overrun_risk";
      badgeLabel = `Chi >${warnThresholdPct}% / Nghiệm thu ${acceptancePct}%`;
    } else if (colorMeta.zone === "near_limit") {
      level = "near_limit";
      badgeLabel = `Gần mức trần (${actualRatioPct.toFixed(1)}%)`;
    } else {
      level = "warning";
      badgeLabel = `Chạm ngưỡng ${warnThresholdPct}%`;
    }
  }

  return {
    budget,
    actual,
    approvedPay,
    pendingPay,
    totalPaymentRequested,
    hasBudgetBasis: true,
    remainingBudgetForActual,
    remainingBudgetBeforePending,
    paymentOverrunAmount,
    actualOverrunAmount,
    actualRatioPct,
    actualRatioDisplay: `${actualRatioPct.toFixed(1)}%`,
    paymentRatioPct,
    acceptancePct: acceptancePct ?? null,
    level,
    badgeLabel,
    isWarningOrOverrun: level !== "safe",
    justification,
    ...colorMeta,
  };
}

/**
 * Kiểm tra 1 node có khớp điều kiện tìm kiếm & bộ lọc hay không.
 */
function filterWbsTree(nodes, searchQuery, filterMode, controlMap) {
  const q = searchQuery.trim().toLowerCase();
  const isDefault = q === "" && filterMode === "all";
  if (isDefault) return nodes;

  function matchesSelf(node) {
    const codeStr = (node.code || "").toLowerCase();
    const nameStr = (node.name || "").toLowerCase();
    const matchesSearch =
      q === "" || codeStr.includes(q) || nameStr.includes(q);

    if (!matchesSearch) return false;

    const hasBudget = node.amount !== null && node.amount !== undefined;
    const ctrl = controlMap?.get(node.id);

    switch (filterMode) {
      case "unallocated":
        return Boolean(node.is_leaf) && !hasBudget;
      case "allocated":
        return Boolean(node.is_leaf) && hasBudget;
      case "warning_overrun":
        return Boolean(node.is_leaf) && Boolean(ctrl?.isWarningOrOverrun);
      case "leaf":
        return Boolean(node.is_leaf);
      case "parent":
        return !node.is_leaf;
      case "all":
      default:
        return true;
    }
  }

  function filterNode(node) {
    const filteredChildren = (node.children || [])
      .map(filterNode)
      .filter(Boolean);

    if (filterMode === "parent") {
      if (matchesSelf(node) || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    }

    if (matchesSelf(node) || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      };
    }

    return null;
  }

  return nodes.map(filterNode).filter(Boolean);
}

function countTreeNodes(nodes) {
  let count = 0;
  nodes.forEach((n) => {
    count += 1;
    if (n.children && n.children.length > 0) {
      count += countTreeNodes(n.children);
    }
  });
  return count;
}

function formatSignedDeltaVND(deltaNum) {
  if (!Number.isFinite(deltaNum) || Math.abs(deltaNum) < 0.005) {
    return "0 ₫";
  }
  const absFormatted = formatMoneyVND(Math.abs(deltaNum).toFixed(2));
  return deltaNum > 0 ? `+${absFormatted}` : `-${absFormatted}`;
}

function formatDeltaPercent(baseAmount, targetAmount) {
  const base = Number(baseAmount || 0);
  const target = Number(targetAmount || 0);
  const delta = target - base;

  if (Math.abs(delta) < 0.005) return "0%";
  if (base === 0) return target > 0 ? "Mới (+100%)" : "0%";

  const pct = (delta / base) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export default function BudgetPage({ user, demoMode = false }) {
  const location = useLocation();
  const isDemo = useMemo(() => {
    if (demoMode) return true;
    const params = new URLSearchParams(location.search || "");
    return params.get("demo") === "1";
  }, [demoMode, location.search]);

  const projectId = localStorage.getItem("currentProjectId") || "1";
  const permCtx = useContext(PermissionContext);

  // State riêng cho chế độ Demo Sandbox
  const [demoUserKey, setDemoUserKey] = useState("bql_10");
  const [demoHasActualCosts, setDemoHasActualCosts] = useState(true);
  const [demoVersionsState, setDemoVersionsState] = useState(INITIAL_DEMO_VERSIONS);

  const activeDemoUser = useMemo(() => {
    return DEMO_USERS.find((u) => u.key === demoUserKey) || DEMO_USERS[0];
  }, [demoUserKey]);

  const currentUserId = isDemo ? activeDemoUser.id : user?.id || 1;
  const currentUserName = isDemo
    ? activeDemoUser.name
    : user?.name || "Người dùng";

  // Xác định vai trò của người dùng trong dự án (QoL #5)
  const effectiveRole = useMemo(() => {
    if (isDemo) return activeDemoUser.role;
    if (user?.is_system_admin) return SYSTEM_ADMIN_ROLE;
    if (user?.projectRole) return user.projectRole;
    if (user?.role) return user.role;
    if (permCtx && permCtx.role) return permCtx.role;
    if (permCtx === null && user) return "ban_quan_ly";
    return null;
  }, [isDemo, activeDemoUser, user, permCtx]);

  const roleLoading = Boolean(
    !isDemo && permCtx?.loading && !user?.role && !user?.projectRole
  );
  const canManageBudget = Boolean(
    (!isDemo && user?.is_system_admin) ||
      (!roleLoading && can(effectiveRole, "budget.manage"))
  );
  const canVerifyOverrun = Boolean(
    (!isDemo && user?.is_system_admin) ||
      (!roleLoading && can(effectiveRole, "budget.verify_overrun"))
  );
  const canApproveOverrun = Boolean(
    (!isDemo && user?.is_system_admin) ||
      (!roleLoading && can(effectiveRole, "budget.approve_overrun"))
  );
  const roleLabel = ROLE_LABELS[effectiveRole] || "Thành viên";

  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState("latest");
  const [collapsedNodes, setCollapsedNodes] = useState({});

  // QoL #1: Tìm kiếm và bộ lọc nhanh theo WBS
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all");

  // QoL #2: So sánh hai phiên bản dự toán (Diff vA vs vB)
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState("");
  const [compareVersionB, setCompareVersionB] = useState("");
  const [compareDataA, setCompareDataA] = useState(null);
  const [compareDataB, setCompareDataB] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareOnlyChanged, setCompareOnlyChanged] = useState(false);

  // QoL #3: Nhật ký thay đổi phiên bản & Lý do điều chỉnh
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState("Cập nhật định mức dự toán");
  const [createNewVersionFlag, setCreateNewVersionFlag] = useState(false);

  // Kiểm soát ngân sách & Cảnh báo ngưỡng (80% / 100% + Giải trình vượt mức)
  const [warnThresholdPct, setWarnThresholdPct] = useState(80);
  const [limitThresholdPct, setLimitThresholdPct] = useState(100);
  const [controlMetricsState, setControlMetricsState] = useState(
    () => (isDemo ? INITIAL_DEMO_CONTROL_METRICS : {})
  );
  const [selectedOverrunItem, setSelectedOverrunItem] = useState(null);
  const [justificationType, setJustificationType] = useState(
    OVERRUN_JUSTIFICATION_TYPES[0].value
  );
  const [justificationText, setJustificationText] = useState("");
  const [justificationLegalRef, setJustificationLegalRef] = useState("");
  const [justificationAccountantNote, setJustificationAccountantNote] =
    useState("");
  const [justificationReviewNote, setJustificationReviewNote] = useState("");
  const [justificationError, setJustificationError] = useState("");
  const [eligibleReviewers, setEligibleReviewers] = useState([]);

  // Dialog nhập dự toán cho từng lá
  const [editingItem, setEditingItem] = useState(null);
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Đồng bộ dữ liệu khi ở chế độ Demo Sandbox
  const syncDemoData = useCallback(
    (versionNum = null) => {
      const formattedVersions = demoVersionsState.map((v) => {
        const treeRes = buildDemoTreeResponse(v, demoHasActualCosts);
        return {
          id: v.id,
          project_id: 1,
          version_number: v.version_number,
          status: v.status || "APPROVED",
          description: v.description,
          created_at: v.created_at,
          created_by_name: v.created_by_name,
          total_amount: treeRes.project_total,
          items_count: Object.keys(v.leafMap || {}).length,
        };
      });
      setVersions(formattedVersions);

      // Mặc định lấy phiên bản đã được duyệt hoặc đang có hiệu lực (APPROVED / EFFECTIVE), không lấy phiên bản nháp (DRAFT)
      const targetVer =
        versionNum && versionNum !== "latest"
          ? demoVersionsState.find(
              (v) => String(v.version_number) === String(versionNum)
            )
          : demoVersionsState.find(
              (v) => !v.status || ["APPROVED", "EFFECTIVE"].includes(v.status)
            ) || demoVersionsState[0];

      setData(buildDemoTreeResponse(targetVer, demoHasActualCosts));
      setLoading(false);
    },
    [demoVersionsState, demoHasActualCosts]
  );

  const fetchVersions = useCallback(async () => {
    if (isDemo) return;
    try {
      const res = await api.get(`/projects/${projectId}/budgets`);
      setVersions(res.data?.versions || []);
    } catch (_err) {
      // Bỏ qua lỗi phụ khi tải version
    }
  }, [projectId, isDemo]);

  const fetchJustifications = useCallback(async () => {
    if (isDemo) return;
    try {
      const res = await api.get(`/projects/${projectId}/budgets/justifications`);
      const list = res.data?.justifications || [];
      setEligibleReviewers(res.data?.eligible_reviewers || []);
      setControlMetricsState((prev) => {
        const next = { ...prev };
        list.forEach((j) => {
          const wid = j.work_item_id;
          next[wid] = {
            ...(next[wid] || {}),
            justification: j,
          };
        });
        return next;
      });
    } catch (_err) {
      // Bỏ qua nếu endpoint chưa có dữ liệu hoặc lỗi phụ
    }
  }, [projectId, isDemo]);

  const fetchBudgetTree = useCallback(
    async (versionNum = null) => {
      if (isDemo) return;
      setLoading(true);
      setError(null);
      try {
        const url =
          versionNum && versionNum !== "latest"
            ? `/projects/${projectId}/budgets/tree?version=${versionNum}`
            : `/projects/${projectId}/budgets/tree`;

        const res = await api.get(url);
        setData(res.data);
      } catch (err) {
        setError(
          err?.response?.data?.message || "Không thể tải dữ liệu dự toán dự án"
        );
      } finally {
        setLoading(false);
      }
    },
    [projectId, isDemo]
  );

  useEffect(() => {
    if (isDemo) {
      syncDemoData(selectedVersion === "latest" ? null : selectedVersion);
      return;
    }
    fetchVersions();
    fetchJustifications();
    fetchBudgetTree(selectedVersion === "latest" ? null : selectedVersion);
  }, [isDemo, syncDemoData, fetchVersions, fetchJustifications, fetchBudgetTree, selectedVersion]);

  useEffect(() => {
    if (compareMode && versions.length >= 2 && (!compareVersionA || !compareVersionB)) {
      const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);
      const latest = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      setCompareVersionA(String(prev.version_number));
      setCompareVersionB(String(latest.version_number));
    } else if (compareMode && versions.length === 1 && !compareVersionA) {
      const only = versions[0];
      setCompareVersionA(String(only.version_number));
      setCompareVersionB(String(only.version_number));
    }
  }, [compareMode, versions, compareVersionA, compareVersionB]);

  useEffect(() => {
    if (!compareMode || !compareVersionA || !compareVersionB) return;

    if (isDemo) {
      const vA = demoVersionsState.find(
        (v) => String(v.version_number) === String(compareVersionA)
      );
      const vB = demoVersionsState.find(
        (v) => String(v.version_number) === String(compareVersionB)
      );
      setCompareDataA(buildDemoTreeResponse(vA, demoHasActualCosts));
      setCompareDataB(buildDemoTreeResponse(vB, demoHasActualCosts));
      return;
    }

    let cancelled = false;
    (async () => {
      setCompareLoading(true);
      try {
        const [resA, resB] = await Promise.all([
          api.get(`/projects/${projectId}/budgets/tree?version=${compareVersionA}`),
          api.get(`/projects/${projectId}/budgets/tree?version=${compareVersionB}`),
        ]);
        if (!cancelled) {
          setCompareDataA(resA.data);
          setCompareDataB(resB.data);
        }
      } catch (_err) {
        if (!cancelled) {
          toast.error("Không thể tải dữ liệu đối chiếu giữa hai phiên bản");
        }
      } finally {
        if (!cancelled) {
          setCompareLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    compareMode,
    compareVersionA,
    compareVersionB,
    projectId,
    isDemo,
    demoVersionsState,
    demoHasActualCosts,
  ]);

  const latestVersionNumber = useMemo(() => {
    if (!versions || versions.length === 0) return data?.version?.version_number || null;
    return Math.max(...versions.map((v) => Number(v.version_number)));
  }, [versions, data?.version?.version_number]);

  const isViewingHistoricalVersion = useMemo(() => {
    if (selectedVersion === "latest") return false;
    if (!latestVersionNumber) return false;
    return Number(selectedVersion) !== Number(latestVersionNumber);
  }, [selectedVersion, latestVersionNumber]);

  const handleVersionChange = (val) => {
    setSelectedVersion(val);
  };

  const toggleCollapse = (id) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    setCollapsedNodes({});
  };

  const handleCollapseAll = () => {
    const nextCollapsed = {};
    (data?.items || []).forEach((item) => {
      if (!item.is_leaf) {
        nextCollapsed[item.id] = true;
      }
    });
    setCollapsedNodes(nextCollapsed);
  };

  // Tính toán bản đồ Kiểm soát Ngân sách cho từng hạng mục lá và cộng dồn cho hạng mục cha
  const itemControlMap = useMemo(() => {
    const map = new Map();
    const items = data?.items || [];
    if (items.length === 0) return map;

    const childrenByParent = new Map();
    items.forEach((it) => {
      const pid = it.parent_id || 0;
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid).push(it);
    });

    // 1. Tính cho các hạng mục lá
    items.forEach((it) => {
      if (!it.is_leaf) return;
      const metric = controlMetricsState[it.id] || {};
      const actualCost =
        it.actual_cost !== undefined
          ? it.actual_cost
          : isDemo
          ? metric.actual_cost || "0.00"
          : "0.00";
      const approvedPayment =
        it.approved_payment !== undefined
          ? it.approved_payment
          : isDemo
          ? metric.approved_payment || "0.00"
          : "0.00";
      const pendingPayment =
        it.pending_payment !== undefined
          ? it.pending_payment
          : isDemo
          ? metric.pending_payment || "0.00"
          : "0.00";
      const contractValue =
        it.contract_value !== undefined
          ? it.contract_value
          : isDemo
          ? metric.contract_value || "0.00"
          : "0.00";
      const acceptancePct =
        it.acceptance_pct !== undefined
          ? it.acceptance_pct
          : isDemo
          ? metric.acceptance_pct ?? null
          : null;

      const evaluated = evaluateItemBudgetControl({
        budgetAmount: it.amount,
        actualCost,
        approvedPayment,
        pendingPayment,
        acceptancePct,
        warnThresholdPct,
        limitThresholdPct,
        justification: metric.justification || null,
      });

      map.set(it.id, {
        ...evaluated,
        contractValue: Number(contractValue || 0),
      });
    });

    // 2. Cộng dồn cho các hạng mục cha
    function calcParentMetrics(nodeId) {
      if (map.has(nodeId)) return map.get(nodeId);
      const node = items.find((x) => x.id === nodeId);
      if (!node) return null;
      const kids = childrenByParent.get(nodeId) || [];
      let sumActual = 0;
      let sumApprovedPay = 0;
      let sumPendingPay = 0;
      let sumContract = 0;

      kids.forEach((k) => {
        const km = calcParentMetrics(k.id);
        if (km) {
          sumActual += km.actual;
          sumApprovedPay += km.approvedPay;
          sumPendingPay += km.pendingPay;
          sumContract += km.contractValue || 0;
        }
      });

      const parentEval = evaluateItemBudgetControl({
        budgetAmount: node.total_budget,
        actualCost: sumActual,
        approvedPayment: sumApprovedPay,
        pendingPayment: sumPendingPay,
        acceptancePct: null,
        warnThresholdPct,
        limitThresholdPct,
        justification: null,
      });

      const res = {
        ...parentEval,
        contractValue: sumContract,
      };
      map.set(nodeId, res);
      return res;
    }

    items.forEach((it) => {
      if (!it.is_leaf) calcParentMetrics(it.id);
    });

    return map;
  }, [data?.items, controlMetricsState, isDemo, warnThresholdPct, limitThresholdPct]);

  // Tổng hợp số liệu kiểm soát toàn dự án (Tách biệt: Hợp đồng vs Dự toán vs Thực chi vs Đề nghị thanh toán)
  const projectControlSummary = useMemo(() => {
    const leaves = (data?.items || []).filter((i) => i.is_leaf);
    let totalContract = 0;
    let totalBudget = Number(data?.project_total || 0);
    let totalActual = 0;
    let totalApprovedPayment = 0;
    let totalPendingPayment = 0;
    let warningCount = 0;
    let overrunCount = 0;

    leaves.forEach((leaf) => {
      const ctrl = itemControlMap.get(leaf.id);
      if (!ctrl) return;
      totalContract += ctrl.contractValue || 0;
      totalActual += ctrl.actual;
      totalApprovedPayment += ctrl.approvedPay;
      totalPendingPayment += ctrl.pendingPay;

      if (
        ctrl.level === "overrun" ||
        ctrl.level === "pending_override" ||
        ctrl.level === "pending_assignment" ||
        ctrl.level === "rejected_override" ||
        ctrl.level === "approved_override"
      ) {
        overrunCount += 1;
      } else if (
        ctrl.level === "warning" ||
        ctrl.level === "near_limit" ||
        ctrl.level === "early_overrun_risk"
      ) {
        warningCount += 1;
      }
    });

    const hasBudgetBasis = totalBudget > 0;
    const remainingBudget = totalBudget - totalActual;
    const actualPct = hasBudgetBasis ? (totalActual / totalBudget) * 100 : null;
    const colorMeta = resolveBudgetProgressBarColor({
      hasBudgetBasis,
      actualRatioPct: actualPct,
      warnThresholdPct,
      limitThresholdPct,
    });

    return {
      totalContract,
      totalBudget,
      totalActual,
      totalApprovedPayment,
      totalPendingPayment,
      hasBudgetBasis,
      remainingBudget,
      actualPct,
      actualRatioDisplay: hasBudgetBasis
        ? `${actualPct.toFixed(1)}%`
        : "Chưa có cơ sở dự toán",
      warningCount,
      overrunCount,
      ...colorMeta,
    };
  }, [
    data?.items,
    data?.project_total,
    itemControlMap,
    warnThresholdPct,
    limitThresholdPct,
  ]);

  // Danh sách các hạng mục vượt ngưỡng / có phiếu giải trình để hiển thị khay theo dõi chống bỏ sót
  const attentionOverrunItems = useMemo(() => {
    const leaves = (data?.items || []).filter((i) => i.is_leaf);
    const list = [];
    leaves.forEach((leaf) => {
      const ctrl = itemControlMap.get(leaf.id);
      if (!ctrl) return;
      if (ctrl.isWarningOrOverrun || ctrl.justification) {
        const just = ctrl.justification || null;
        const step1Done = Boolean(just);
        const hasLegalRef = Boolean(just?.legal_document_ref?.trim());
        const step2Done = Boolean(just?.accountant_verified_by);
        const step3Status =
          just?.status === "APPROVED" || just?.status === "APPROVED_EXCEPTION"
            ? "approved"
            : just?.status === "REJECTED"
            ? "rejected"
            : just?.status === "PENDING_ASSIGNMENT"
            ? "pending_assignment"
            : step1Done
            ? "pending"
            : "waiting";

        // Vẫn cần hành động (chưa được CĐT duyệt xong)
        const needsAction =
          !just ||
          !hasLegalRef ||
          !step2Done ||
          (step3Status !== "approved" && ctrl.isWarningOrOverrun);

        list.push({
          item: leaf,
          ctrl,
          just,
          step1Done,
          hasLegalRef,
          step2Done,
          step3Status,
          needsAction,
        });
      }
    });
    return list;
  }, [data?.items, itemControlMap]);

  const rawTreeRoots = useMemo(() => {
    if (!data?.items || data.items.length === 0) return [];
    return buildTree(data.items);
  }, [data?.items]);

  const isFilteringActive = searchQuery.trim() !== "" || filterMode !== "all";

  const treeRoots = useMemo(() => {
    return filterWbsTree(rawTreeRoots, searchQuery, filterMode, itemControlMap);
  }, [rawTreeRoots, searchQuery, filterMode, itemControlMap]);

  const matchedNodesCount = useMemo(() => countTreeNodes(treeRoots), [treeRoots]);

  const handleOpenEdit = (item) => {
    if (!canManageBudget) {
      toast.info(`Vai trò ${roleLabel} đang ở chế độ Chỉ xem, không thể chỉnh sửa dự toán.`);
      return;
    }
    if (isViewingHistoricalVersion) {
      toast.warning(
        "Phiên bản lịch sử chỉ cho phép xem để bảo toàn dấu vết kiểm toán. Vui lòng chuyển về Phiên bản mới nhất để điều chỉnh."
      );
      return;
    }
    if (!item.is_leaf) {
      toast.warning(
        "Hạng mục cha không cho phép nhập dự toán trực tiếp. Hệ thống sẽ tự động cộng tổng từ các hạng mục lá con."
      );
      return;
    }
    setEditingItem(item);
    setFormAmount(item.amount ? formatInputDisplayVN(item.amount) : "");
    setFormNote(item.note || "");
    setAdjustmentReason(
      data?.has_actual_costs
        ? "Điều chỉnh khối lượng"
        : item.amount !== null && item.amount !== undefined
        ? "Điều chỉnh khối lượng"
        : "Cập nhật định mức dự toán"
    );
    setCreateNewVersionFlag(Boolean(data?.has_actual_costs));
    setFormError("");
  };

  // Mở dialog Giải trình & Xử lý vượt ngân sách
  const handleOpenOverrunControl = (item) => {
    const ctrl = itemControlMap.get(item.id);
    setSelectedOverrunItem(item);
    setJustificationType(
      ctrl?.justification?.reason_type || OVERRUN_JUSTIFICATION_TYPES[0].value
    );
    setJustificationText(ctrl?.justification?.explanation || "");
    setJustificationLegalRef(ctrl?.justification?.legal_document_ref || "");
    setJustificationAccountantNote(ctrl?.justification?.accountant_note || "");
    setJustificationReviewNote(ctrl?.justification?.review_note || "");
    setJustificationError("");
  };

  // Gửi giải trình vượt ngân sách (Quy tắc 1 & Quy tắc 6)
  const handleSubmitOverrunJustification = async () => {
    if (!selectedOverrunItem) return;
    if (!justificationText.trim()) {
      setJustificationError(
        "Vui lòng nhập nội dung giải trình cụ thể để gửi Chủ đầu tư xem xét phê duyệt"
      );
      return;
    }

    if (isDemo) {
      // Quy tắc 6: Kiểm tra có người duyệt độc lập phù hợp trong dự án hay không
      const hasIndependentReviewer = Boolean(
        activeDemoUser.hasIndependentReviewerInProject
      );
      const nextStatus = hasIndependentReviewer
        ? "PENDING_APPROVAL"
        : "PENDING_ASSIGNMENT";
      const prevJust =
        controlMetricsState[selectedOverrunItem.id]?.justification || null;

      setControlMetricsState((prev) => ({
        ...prev,
        [selectedOverrunItem.id]: {
          ...(prev[selectedOverrunItem.id] || {}),
          justification: {
            id: prevJust?.id || Date.now(),
            reason_type: justificationType,
            explanation: justificationText.trim(),
            legal_document_ref:
              justificationLegalRef.trim() ||
              prevJust?.legal_document_ref ||
              null,
            submitted_by: currentUserId,
            submitted_by_name: currentUserName,
            submitted_by_role: effectiveRole,
            submitted_at: new Date().toISOString(),
            accountant_verified_by: prevJust?.accountant_verified_by || null,
            accountant_verified_by_name:
              prevJust?.accountant_verified_by_name || null,
            accountant_verified_at: prevJust?.accountant_verified_at || null,
            accountant_note: prevJust?.accountant_note || null,
            status: nextStatus,
            reviewed_by: null,
            reviewed_by_name: null,
            reviewed_by_role: null,
            reviewed_at: null,
            review_note: null,
          },
        },
      }));

      if (hasIndependentReviewer) {
        toast.success(
          `Đã gửi giải trình vượt dự toán cho hạng mục [${selectedOverrunItem.code}] để Kế toán đối chiếu và Chủ đầu tư xét duyệt`
        );
      } else {
        toast.warning(
          `Đã lưu giải trình ở trạng thái "Chờ phân công người duyệt độc lập" (tuyệt đối không tự động thông qua do chưa có người duyệt độc lập phù hợp)`
        );
      }
      setSelectedOverrunItem(null);
      return;
    }

    try {
      const res = await api.post(
        `/projects/${projectId}/budgets/justifications`,
        {
          work_item_id: selectedOverrunItem.id,
          budget_version_id: data?.version?.id || null,
          reason_type: justificationType,
          explanation: justificationText.trim(),
          legal_document_ref: justificationLegalRef.trim() || null,
        }
      );

      const created = res.data?.justification;
      if (created) {
        setControlMetricsState((prev) => ({
          ...prev,
          [selectedOverrunItem.id]: {
            ...(prev[selectedOverrunItem.id] || {}),
            justification: created,
          },
        }));
      }
      toast.success(
        res.data?.message ||
          `Đã gửi giải trình vượt dự toán cho hạng mục [${selectedOverrunItem.code}]`
      );
      setSelectedOverrunItem(null);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        "Không thể gửi giải trình vượt dự toán, vui lòng thử lại";
      setJustificationError(msg);
      toast.error(msg);
    }
  };

  // Kế toán xác nhận đối chiếu số liệu trên phiếu giải trình trước khi CĐT duyệt
  const handleAccountantVerifyJustification = async () => {
    if (!selectedOverrunItem) return;
    const existing = controlMetricsState[selectedOverrunItem.id]?.justification;
    if (!existing) {
      setJustificationError(
        "Chưa có hồ sơ giải trình được lập để Kế toán xác nhận đối chiếu."
      );
      return;
    }

    if (isDemo) {
      setControlMetricsState((prev) => ({
        ...prev,
        [selectedOverrunItem.id]: {
          ...(prev[selectedOverrunItem.id] || {}),
          justification: {
            ...existing,
            legal_document_ref:
              justificationLegalRef.trim() ||
              existing.legal_document_ref ||
              null,
            accountant_verified_by: currentUserId,
            accountant_verified_by_name: currentUserName,
            accountant_verified_at: new Date().toISOString(),
            accountant_note:
              justificationAccountantNote.trim() ||
              "Đã kiểm tra và xác nhận khớp số liệu thực chi / hợp đồng",
          },
        },
      }));
      toast.success(
        `Kế toán (${currentUserName}) đã xác nhận đối chiếu số liệu cho phiếu giải trình [${selectedOverrunItem.code}]`
      );
      setSelectedOverrunItem(null);
      return;
    }

    try {
      const res = await api.post(
        `/projects/${projectId}/budgets/justifications/${existing.id}/verify`,
        {
          accountant_note:
            justificationAccountantNote.trim() ||
            "Đã kiểm tra và xác nhận khớp số liệu thực chi / hợp đồng",
          legal_document_ref:
            justificationLegalRef.trim() ||
            existing.legal_document_ref ||
            null,
        }
      );
      const updated = res.data?.justification;
      if (updated) {
        setControlMetricsState((prev) => ({
          ...prev,
          [selectedOverrunItem.id]: {
            ...(prev[selectedOverrunItem.id] || {}),
            justification: updated,
          },
        }));
      }
      toast.success(
        res.data?.message || "Kế toán đã xác nhận đối chiếu số liệu"
      );
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        "Không thể xác nhận đối chiếu số liệu Kế toán";
      setJustificationError(msg);
      toast.error(msg);
    }
  };

  // Xét duyệt hoặc Từ chối giải trình vượt dự toán (Quy tắc 2, 3, 4, 5 + Điều kiện Pháp lý & Kế toán)
  const handleReviewOverrunJustification = async (decision) => {
    if (!selectedOverrunItem) return;
    const existing = controlMetricsState[selectedOverrunItem.id]?.justification;
    if (!existing) {
      setJustificationError(
        "Chưa có hồ sơ giải trình được gửi. Vui lòng gửi giải trình trước để người duyệt độc lập xử lý."
      );
      return;
    }

    // Nguyên tắc bắt buộc (Quy tắc 2 & 3): Người lập không được duyệt chính giải trình đó, bất kể giữ vai trò gì
    if (Number(existing.submitted_by) === Number(currentUserId)) {
      const selfErrMsg =
        "Vi phạm nguyên tắc Bất kiêm nhiệm: Người lập giải trình không được phép duyệt hoặc từ chối chính giải trình của mình, bất kể giữ vai trò gì.";
      setJustificationError(selfErrMsg);
      toast.error(selfErrMsg);
      return;
    }

    if (decision === "REJECTED" && !justificationReviewNote.trim()) {
      setJustificationError(
        "Vui lòng nhập ý kiến / lý do từ chối giải trình để người lập căn cứ bổ sung"
      );
      return;
    }

    const effectiveLegalRef =
      justificationLegalRef.trim() || existing.legal_document_ref || "";

    // Điều kiện pháp lý bắt buộc trước khi CĐT bấm Duyệt (APPROVED)
    if (decision === "APPROVED") {
      if (!effectiveLegalRef) {
        const legalErr =
          "Chưa đủ điều kiện pháp lý: Bắt buộc nhập Số biên bản hiện trường / Tờ trình pháp lý trước khi Chủ đầu tư phê duyệt vượt dự toán.";
        setJustificationError(legalErr);
        toast.error(legalErr);
        return;
      }
      if (!existing.accountant_verified_by) {
        const accErr =
          "Chưa đủ điều kiện kiểm soát nội bộ: Bắt buộc phải có Xác nhận đối chiếu số liệu của Kế toán trên phiếu trước khi Chủ đầu tư phê duyệt.";
        setJustificationError(accErr);
        toast.error(accErr);
        return;
      }
    }

    if (isDemo) {
      setControlMetricsState((prev) => ({
        ...prev,
        [selectedOverrunItem.id]: {
          ...(prev[selectedOverrunItem.id] || {}),
          justification: {
            ...existing,
            legal_document_ref: effectiveLegalRef || null,
            status: decision,
            reviewed_by: currentUserId,
            reviewed_by_name: currentUserName,
            reviewed_by_role: effectiveRole,
            reviewed_at: new Date().toISOString(),
            review_note: justificationReviewNote.trim() || null,
          },
        },
      }));

      if (decision === "APPROVED") {
        toast.success(
          `Đã phê duyệt giải trình vượt dự toán cho hạng mục [${selectedOverrunItem.code}] bởi ${currentUserName}`
        );
      } else {
        toast.info(
          `Đã từ chối giải trình vượt dự toán cho hạng mục [${selectedOverrunItem.code}]`
        );
      }
      setSelectedOverrunItem(null);
      return;
    }

    try {
      const res = await api.post(
        `/projects/${projectId}/budgets/justifications/${existing.id}/review`,
        {
          decision,
          review_note: justificationReviewNote.trim() || null,
          legal_document_ref: effectiveLegalRef || null,
          enforce_legal_checklist: true,
        }
      );

      const updated = res.data?.justification;
      if (updated) {
        setControlMetricsState((prev) => ({
          ...prev,
          [selectedOverrunItem.id]: {
            ...(prev[selectedOverrunItem.id] || {}),
            justification: updated,
          },
        }));
      }
      toast.success(res.data?.message || "Đã xử lý giải trình vượt dự toán");
      setSelectedOverrunItem(null);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        "Không thể xử lý giải trình vượt dự toán";
      setJustificationError(msg);
      toast.error(msg);
    }
  };

  const handleSaveItemBudget = async () => {
    if (!editingItem) return;

    let norm;
    if (formAmount.trim() === "") {
      norm = { ok: true, value: null };
    } else {
      const cleaned = parseVietnameseNumber(formAmount);
      norm = normalizeDecimalInput(cleaned, {
        maxIntDigits: 14,
        maxScale: 2,
        fieldName: "Số tiền dự toán",
      });
    }

    if (!norm.ok) {
      setFormError(norm.error);
      return;
    }

    const willCreateNewVersion = Boolean(
      data?.has_actual_costs || createNewVersionFlag || !data?.version
    );

    if (willCreateNewVersion && !adjustmentReason.trim()) {
      setFormError("Vui lòng chọn lý do điều chỉnh khi tạo phiên bản dự toán mới");
      return;
    }

    const reasonTag = adjustmentReason ? `[${adjustmentReason}] ` : "";
    const noteDetail = formNote.trim() ? ` - ${formNote.trim()}` : "";
    const actionDesc = data?.has_actual_costs
      ? `${reasonTag}Điều chỉnh dự toán hạng mục "${editingItem.name}"${noteDetail} (sinh phiên bản mới do đã có thực chi)`
      : `${reasonTag}Cập nhật dự toán hạng mục "${editingItem.name}"${noteDetail}`;

    if (isDemo) {
      const latestVer = demoVersionsState[0];
      const nextLeafMap = { ...(latestVer?.leafMap || {}) };
      if (norm.value !== null && norm.value !== "") {
        nextLeafMap[editingItem.id] = {
          amount: Number(norm.value).toFixed(2),
          note: formNote.trim() || null,
        };
      } else {
        delete nextLeafMap[editingItem.id];
      }

      if (willCreateNewVersion) {
        const nextVerNum = (latestVer?.version_number || 0) + 1;
        const newVerObj = {
          id: nextVerNum,
          project_id: 1,
          version_number: nextVerNum,
          description: actionDesc,
          created_by: 1,
          created_by_name: `Bạn (${roleLabel})`,
          created_at: new Date().toISOString(),
          leafMap: nextLeafMap,
        };
        setDemoVersionsState([newVerObj, ...demoVersionsState]);
        setCompareVersionA(String(latestVer.version_number));
        setCompareVersionB(String(nextVerNum));
        toast.success(`Đã tạo phiên bản dự toán mới v${nextVerNum} thành công`);
      } else {
        const updatedLatest = {
          ...latestVer,
          description: actionDesc,
          leafMap: nextLeafMap,
        };
        setDemoVersionsState([updatedLatest, ...demoVersionsState.slice(1)]);
        toast.success(
          `Đã cập nhật dự toán cho phiên bản v${latestVer.version_number} thành công`
        );
      }

      setEditingItem(null);
      setSelectedVersion("latest");
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      const currentItems = (data?.items || [])
        .filter(
          (i) =>
            i.is_leaf &&
            i.id !== editingItem.id &&
            i.amount !== null &&
            i.amount !== undefined
        )
        .map((i) => ({
          work_item_id: i.id,
          amount: i.amount,
          note: i.note,
        }));

      if (norm.value !== null && norm.value !== "") {
        currentItems.push({
          work_item_id: editingItem.id,
          amount: norm.value,
          note: formNote.trim() || null,
        });
      }

      const res = await api.post(`/projects/${projectId}/budgets`, {
        description: actionDesc,
        createNewVersion: Boolean(createNewVersionFlag),
        items: currentItems,
      });

      toast.success(res.data?.message || "Đã lưu dự toán thành công");
      setEditingItem(null);
      setSelectedVersion("latest");
      await fetchVersions();
      await fetchBudgetTree(null);
    } catch (err) {
      const msg =
        err?.response?.data?.message || "Không thể lưu dự toán, vui lòng thử lại";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Xây dựng dữ liệu bảng so sánh 2 phiên bản (QoL #2)
  const comparisonRows = useMemo(() => {
    if (!compareMode || !compareDataA?.items || !compareDataB?.items) return [];

    const mapA = new Map(compareDataA.items.map((i) => [i.id, i]));

    const mergedItems = compareDataB.items.map((itemB) => {
      const itemA = mapA.get(itemB.id);
      const valA = itemB.is_leaf
        ? itemA?.amount !== null && itemA?.amount !== undefined
          ? Number(itemA.amount)
          : null
        : Number(itemA?.total_budget || 0);
      const valB = itemB.is_leaf
        ? itemB.amount !== null && itemB.amount !== undefined
          ? Number(itemB.amount)
          : null
        : Number(itemB.total_budget || 0);

      const numA = valA ?? 0;
      const numB = valB ?? 0;
      const delta = numB - numA;

      let status = "unchanged";
      if (itemB.is_leaf) {
        if (valA === null && valB !== null) status = "added";
        else if (valA !== null && valB === null) status = "removed";
        else if (Math.abs(delta) >= 0.005) {
          status = delta > 0 ? "increased" : "decreased";
        }
      } else if (Math.abs(delta) >= 0.005) {
        status = delta > 0 ? "increased" : "decreased";
      }

      return {
        ...itemB,
        valA,
        valB,
        numA,
        numB,
        delta,
        status,
        pctText: formatDeltaPercent(numA, numB),
      };
    });

    const tree = buildTree(mergedItems);

    function flattenTree(nodes, level = 0) {
      const result = [];
      nodes.forEach((n) => {
        const childrenRows =
          n.children && n.children.length > 0
            ? flattenTree(n.children, level + 1)
            : [];
        const hasChangedDescendant = childrenRows.some(
          (c) => c.status !== "unchanged"
        );
        if (!compareOnlyChanged || n.status !== "unchanged" || hasChangedDescendant) {
          result.push({ ...n, level });
          result.push(...childrenRows);
        }
      });
      return result;
    }

    return flattenTree(tree, 0);
  }, [compareMode, compareDataA, compareDataB, compareOnlyChanged]);

  const compareSummary = useMemo(() => {
    const totalA = Number(compareDataA?.project_total || 0);
    const totalB = Number(compareDataB?.project_total || 0);
    const delta = totalB - totalA;
    const pctText = formatDeltaPercent(totalA, totalB);
    return { totalA, totalB, delta, pctText };
  }, [compareDataA, compareDataB]);

  const renderTreeRows = (nodes, level = 0) => {
    const rows = [];

    nodes.forEach((node) => {
      const isLeaf = node.is_leaf;
      const isCollapsed = isFilteringActive ? false : Boolean(collapsedNodes[node.id]);
      const ctrl = itemControlMap.get(node.id);

      const barPct = ctrl?.hasBudgetBasis
        ? Math.min(Math.max(ctrl.actualRatioPct || 0, 0), 100)
        : ctrl?.actual > 0
        ? 100
        : 0;
      const barColorClass = ctrl?.hasBudgetBasis
        ? ctrl.barColorClass
        : ctrl?.actual > 0
        ? "bg-red-600"
        : "bg-slate-300 dark:bg-slate-700";

      rows.push(
        <tr
          key={node.id}
          className={`border-b transition-colors hover:bg-muted/40 ${
            !isLeaf
              ? level === 0
                ? "bg-slate-100/80 dark:bg-slate-900/60 font-semibold text-foreground border-l-4 border-l-primary"
                : "bg-muted/25 font-semibold text-foreground border-l-2 border-l-primary/50"
              : "text-muted-foreground"
          }`}
        >
          <td className="p-3 text-sm font-mono whitespace-nowrap text-muted-foreground">
            {node.code || "—"}
          </td>

          <td className="p-3 text-sm">
            <div
              className="flex items-center gap-1.5"
              style={{ paddingLeft: `${level * 24}px` }}
            >
              {!isLeaf ? (
                <button
                  type="button"
                  onClick={() => toggleCollapse(node.id)}
                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={isCollapsed ? "Mở rộng nhánh" : "Thu gọn nhánh"}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <span className="w-6 inline-block" />
              )}

              <span
                className={`break-words ${
                  !isLeaf
                    ? "font-bold text-foreground"
                    : "text-foreground font-normal"
                }`}
              >
                {node.name}
              </span>

              {!isLeaf && (
                <span className="text-[11px] text-muted-foreground font-normal ml-2 italic">
                  (Tổng cộng từ cây con)
                </span>
              )}
            </div>
          </td>

          <td className="p-3 text-sm text-center">
            {isLeaf ? (
              <Badge
                variant="outline"
                className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 border-emerald-200"
              >
                Hạng mục lá
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Hạng mục cha
              </Badge>
            )}
          </td>

          <td className="p-3 text-sm text-right font-mono tabular-nums">
            {isLeaf ? (
              node.amount !== null && node.amount !== undefined ? (
                <span className="font-medium text-foreground">
                  {formatMoneyVND(node.amount)}
                </span>
              ) : (
                <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-200">
                  Chưa nhập
                </span>
              )
            ) : (
              <span className="text-muted-foreground italic text-xs">
                Không nhập ở cha
              </span>
            )}
          </td>

          <td className="p-3 text-sm text-right font-mono tabular-nums font-semibold text-primary">
            {formatMoneyVND(node.total_budget || "0.00")}
          </td>

          {/* Cột Kiểm soát Ngân sách: Thực chi (actual_costs) / Dự toán được duyệt (/budget), Ngân sách còn lại & Thanh chuyển màu 4 vùng */}
          <td className="p-3 text-xs min-w-[230px]">
            {ctrl ? (
              ctrl.hasBudgetBasis ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Thực chi:{" "}
                      <strong className="font-mono text-foreground">
                        {formatMoneyVND(ctrl.actual.toFixed(2))}
                      </strong>
                    </span>
                    <span
                      data-testid={`row-budget-ratio-${node.id}`}
                      className={`font-mono ${ctrl.textColorClass}`}
                      title={ctrl.zoneLabel}
                    >
                      {ctrl.actualRatioDisplay}
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      data-testid={`row-budget-bar-${node.id}`}
                      data-zone={ctrl.zone}
                      className={`h-full transition-all ${barColorClass}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Còn lại: {formatSignedDeltaVND(ctrl.remainingBudgetForActual)}
                    </span>

                    {ctrl.level === "overrun" && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        {ctrl.badgeLabel}
                      </Badge>
                    )}
                    {ctrl.level === "rejected_override" && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        {ctrl.badgeLabel}
                      </Badge>
                    )}
                    {ctrl.level === "pending_assignment" && (
                      <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-[10px] px-1.5 py-0 h-4">
                        {ctrl.badgeLabel}
                      </Badge>
                    )}
                    {ctrl.level === "pending_override" && (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0 h-4">
                        {ctrl.badgeLabel}
                      </Badge>
                    )}
                    {ctrl.level === "approved_override" && (
                      <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px] px-1.5 py-0 h-4">
                        {ctrl.badgeLabel}
                      </Badge>
                    )}
                    {ctrl.level === "early_overrun_risk" && (
                      <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-[10px] px-1.5 py-0 h-4">
                        {ctrl.badgeLabel}
                      </Badge>
                    )}
                    {ctrl.level === "near_limit" && (
                      <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-[10px] px-1.5 py-0 h-4">
                        {ctrl.badgeLabel}
                      </Badge>
                    )}
                    {ctrl.level === "warning" && (
                      <Badge className="bg-yellow-100 text-amber-900 border-yellow-300 text-[10px] px-1.5 py-0 h-4">
                        {ctrl.badgeLabel}
                      </Badge>
                    )}
                  </div>

                  {isLeaf && ctrl.pendingPay > 0 && (
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between border-t border-dashed pt-1 mt-1">
                      <span>Đề nghị kỳ này:</span>
                      <span
                        className={`font-mono font-medium ${
                          ctrl.paymentOverrunAmount > 0
                            ? "text-red-600 font-semibold"
                            : "text-foreground"
                        }`}
                      >
                        {formatMoneyVND(ctrl.pendingPay.toFixed(2))}
                      </span>
                    </div>
                  )}

                  {isLeaf && (ctrl.isWarningOrOverrun || ctrl.justification) && (
                    <div
                      data-testid={`row-actor-pipeline-${node.id}`}
                      className="flex flex-wrap items-center gap-1 pt-1 mt-1 border-t border-dashed text-[10px]"
                    >
                      <span
                        className={`px-1.5 py-0.5 rounded font-medium ${
                          ctrl.justification && ctrl.justification.legal_document_ref
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : ctrl.justification
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                        title={
                          ctrl.justification
                            ? `Người lập: ${ctrl.justification.submitted_by_name || ctrl.justification.submitted_by} | VB: ${ctrl.justification.legal_document_ref || "Chưa có số VB"}`
                            : "Chưa lập phiếu giải trình"
                        }
                      >
                        1. Lập{ctrl.justification?.legal_document_ref ? " + VB" : ctrl.justification ? " (Thiếu VB)" : ""}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-medium ${
                          ctrl.justification?.accountant_verified_by
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        }`}
                        title={
                          ctrl.justification?.accountant_verified_by
                            ? `Kế toán đã đối chiếu: ${ctrl.justification.accountant_verified_by_name || ctrl.justification.accountant_verified_by}`
                            : "Chờ Kế toán xác nhận đối chiếu số liệu"
                        }
                      >
                        2. KT {ctrl.justification?.accountant_verified_by ? "✓" : "chờ"}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-medium ${
                          ctrl.justification?.status === "APPROVED" ||
                          ctrl.justification?.status === "APPROVED_EXCEPTION"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                            : ctrl.justification?.status === "REJECTED"
                            ? "bg-red-100 text-red-800"
                            : ctrl.justification?.status === "PENDING_ASSIGNMENT"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        3. CĐT{" "}
                        {ctrl.justification?.status === "APPROVED" ||
                        ctrl.justification?.status === "APPROVED_EXCEPTION"
                          ? "✓"
                          : ctrl.justification?.status === "REJECTED"
                          ? "✕"
                          : "chờ"}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Thực chi:{" "}
                      <strong className="font-mono text-foreground">
                        {formatMoneyVND(ctrl.actual.toFixed(2))}
                      </strong>
                    </span>
                    <Badge
                      variant="outline"
                      data-testid={`row-budget-ratio-${node.id}`}
                      className="text-[10px] px-1.5 py-0 h-4 border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                    >
                      Chưa có cơ sở dự toán
                    </Badge>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      data-testid={`row-budget-bar-${node.id}`}
                      data-zone="no_basis"
                      className={`h-full transition-all ${barColorClass}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {ctrl.actual > 0 ? (
                      <span className="text-red-600 font-semibold">
                        Phát sinh thực chi khi chưa có dự toán được duyệt
                      </span>
                    ) : (
                      <span className="italic">
                        Cần phê duyệt dự toán để tính tỷ lệ % và ngân sách còn lại
                      </span>
                    )}
                  </div>
                </div>
              )
            ) : (
              <span className="text-muted-foreground italic text-xs">
                Chưa có cơ sở dự toán
              </span>
            )}
          </td>

          <td className="p-3 text-sm text-muted-foreground max-w-[180px] truncate">
            {node.note || "—"}
          </td>

          <td className="p-3 text-sm text-center whitespace-nowrap">
            {isLeaf ? (
              <div className="flex items-center justify-center gap-1">
                {canManageBudget && !isViewingHistoricalVersion ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(node)}
                    className="h-8 px-2 text-primary hover:text-primary hover:bg-primary/10 gap-1"
                    title="Nhập / Sửa dự toán"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span className="text-xs">Nhập dự toán</span>
                  </Button>
                ) : isViewingHistoricalVersion ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded bg-muted/50"
                    title="Phiên bản lịch sử được khóa chỉ đọc để bảo toàn dấu vết"
                  >
                    <Lock className="w-3 h-3" />
                    Bản lịch sử
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded bg-muted/40"
                    title={`Vai trò ${roleLabel} chỉ có quyền xem, không thể chỉnh sửa dự toán`}
                  >
                    <Eye className="w-3 h-3" />
                    Chỉ xem
                  </span>
                )}

                {ctrl?.isWarningOrOverrun && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenOverrunControl(node)}
                    className="h-7 px-2 text-xs border-amber-300 text-amber-800 hover:bg-amber-50 dark:text-amber-300 gap-1"
                    title="Xem đối chiếu ngân sách & Giải trình / Phê duyệt vượt mức"
                  >
                    <FileWarning className="w-3.5 h-3.5 text-amber-600" />
                    <span>Giải trình</span>
                  </Button>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </td>
        </tr>
      );

      if (!isCollapsed && node.children && node.children.length > 0) {
        rows.push(...renderTreeRows(node.children, level + 1));
      }
    });

    return rows;
  };

  const leafItems = (data?.items || []).filter((i) => i.is_leaf);
  const allocatedLeaves = leafItems.filter(
    (i) => i.amount !== null && i.amount !== undefined
  );
  const unallocatedLeavesCount = leafItems.length - allocatedLeaves.length;
  const selectedOverrunCtrl = selectedOverrunItem
    ? itemControlMap.get(selectedOverrunItem.id)
    : null;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* ── Thanh điều khiển Chế độ Xem thử Giao diện ── */}
      {isDemo && (
        <div className="rounded-xl border-2 border-indigo-500/40 bg-indigo-50/70 dark:bg-indigo-950/30 p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-indigo-600 shrink-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-bold text-indigo-950 dark:text-indigo-200">
                Chế độ Trải nghiệm Giao diện & Kiểm soát Ngân sách (Mock Sandbox — Không chạm Database)
              </span>
              <p className="text-xs text-indigo-800/80 dark:text-indigo-300">
                Thử nghiệm đối chiếu Dự toán với Thực chi, Đề nghị thanh toán, cảnh báo ngưỡng 80% / 100% và luồng Giải trình vượt mức.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-indigo-900 dark:text-indigo-200">
                Tài khoản thử nghiệm:
              </span>
              <select
                aria-label="Tài khoản thử nghiệm"
                value={demoUserKey}
                onChange={(e) => setDemoUserKey(e.target.value)}
                className="h-8 rounded-md border border-indigo-300 bg-background px-2.5 text-xs font-semibold"
              >
                {DEMO_USERS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-900 dark:text-indigo-200 cursor-pointer select-none bg-background px-2.5 py-1.5 rounded-md border border-indigo-200">
              <input
                type="checkbox"
                checked={demoHasActualCosts}
                onChange={(e) => setDemoHasActualCosts(e.target.checked)}
                className="rounded"
              />
              <span>Giả lập: Đã có thực chi (S-47)</span>
            </label>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDemoVersionsState(INITIAL_DEMO_VERSIONS);
                setControlMetricsState(INITIAL_DEMO_CONTROL_METRICS);
                setSelectedVersion("latest");
                setSearchQuery("");
                setFilterMode("all");
                toast.info("Đã khôi phục dữ liệu mẫu về ban đầu");
              }}
              className="h-8 text-xs"
            >
              Khôi phục mẫu
            </Button>
          </div>
        </div>
      )}

      {/* ── Tiêu đề & Chọn phiên bản ───────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Coins className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Dự toán chi phí theo hạng mục
            </h1>
            <Badge variant="outline" className="ml-1 font-mono text-xs">
              S-46 / T-119
            </Badge>

            {canManageBudget ? (
              <Badge
                variant="outline"
                className="gap-1 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Quyền quản lý dự toán ({roleLabel})
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 text-xs bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300"
              >
                <Eye className="w-3.5 h-3.5" />
                Chế độ Chỉ xem ({roleLabel})
              </Badge>
            )}

            {!isDemo && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = "/budget?demo=1";
                }}
                className="h-7 px-2.5 text-xs border-indigo-300 bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100 gap-1"
                title="Bật dữ liệu mẫu Sandbox để kiểm thử đầy đủ 4 màu cảnh báo và luồng 3 tác nhân mà không chạm Database"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Trải nghiệm dữ liệu mẫu (Sandbox)</span>
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý dự toán cho từng hạng mục lá, cộng tổng lũy kế theo cây WBS và kiểm soát hạn mức chi phí.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <Select value={selectedVersion} onValueChange={handleVersionChange}>
              <SelectTrigger className="w-[190px] h-9" aria-label="Chọn phiên bản dự toán">
                <SelectValue placeholder="Chọn phiên bản" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Phiên bản mới nhất</SelectItem>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={String(v.version_number)}>
                    v{v.version_number} ({new Date(v.created_at).toLocaleDateString("vi-VN")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant={compareMode ? "default" : "outline"}
            size="sm"
            onClick={() => setCompareMode((prev) => !prev)}
            className="h-9 gap-1.5"
            title="Đối chiếu chênh lệch giữa hai phiên bản dự toán"
          >
            <GitCompare className="w-4 h-4" />
            <span>{compareMode ? "Đóng so sánh" : "So sánh phiên bản"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryDialogOpen(true)}
            className="h-9 gap-1.5"
            title="Xem lịch sử và lý do điều chỉnh các phiên bản dự toán"
          >
            <FileClock className="w-4 h-4" />
            <span>Nhật ký ({versions.length})</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (isDemo) {
                syncDemoData(selectedVersion === "latest" ? null : selectedVersion);
                return;
              }
              fetchVersions();
              fetchBudgetTree(selectedVersion === "latest" ? null : selectedVersion);
            }}
            className="h-9 gap-1.5"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Làm mới</span>
          </Button>
        </div>
      </div>

      {/* ── QoL #5: Banner giải thích chế độ Chỉ xem ── */}
      {!canManageBudget && (
        <div
          data-testid="readonly-permission-banner"
          className="rounded-lg border border-blue-200 bg-blue-50/80 dark:bg-blue-950/20 p-3.5 flex items-start gap-3"
        >
          <ShieldAlert className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-900 dark:text-blue-200">
            <p className="font-semibold">
              Chế độ Chỉ xem — Vai trò hiện tại: {roleLabel}
            </p>
            <p className="mt-0.5 text-xs text-blue-800/90 dark:text-blue-300">
              Bạn có quyền tra cứu cây dự toán, theo dõi cảnh báo ngưỡng ngân sách và xem giải trình vượt mức. Quyền nhập hoặc điều chỉnh dự toán chỉ dành cho <strong>Ban quản lý</strong> và <strong>Chủ đầu tư</strong> (được kiểm tra xác thực tại máy chủ).
            </p>
          </div>
        </div>
      )}

      {/* ── QoL #3: Banner thông báo khi đang xem phiên bản lịch sử ── */}
      {isViewingHistoricalVersion && (
        <div
          data-testid="historical-version-banner"
          className="rounded-lg border border-purple-200 bg-purple-50/80 dark:bg-purple-950/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
            <div className="text-sm text-purple-900 dark:text-purple-200">
              <p className="font-semibold">
                Đang xem phiên bản lịch sử v{selectedVersion} (Chế độ bảo toàn dấu vết)
              </p>
              <p className="mt-0.5 text-xs text-purple-800/90 dark:text-purple-300">
                Các phiên bản cũ được giữ nguyên dữ liệu lịch sử và không cho phép sửa trực tiếp. Để điều chỉnh dự toán, vui lòng chuyển về phiên bản mới nhất (v{latestVersionNumber}).
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedVersion("latest")}
            className="shrink-0 border-purple-300 text-purple-800 hover:bg-purple-100"
          >
            Về phiên bản mới nhất
          </Button>
        </div>
      )}

      {/* ── Cảnh báo khi dự án đã phát sinh thực chi ───────── */}
      {data?.has_actual_costs && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/80 dark:bg-amber-950/20 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <p className="font-semibold">
              Dự án đã phát sinh chi phí thực tế (Actual Costs - S-47)
            </p>
            <p className="mt-0.5 text-xs">
              Theo quy tắc nghiệp vụ, mọi thay đổi dự toán từ thời điểm này sẽ được bảo lưu và <strong>tự động tạo thành một phiên bản dự toán mới</strong> kèm lý do điều chỉnh để không ghi đè làm mất lịch sử các mốc ban đầu.
            </p>
          </div>
        </div>
      )}

      {/* ── Thống kê tổng quan ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              Tổng dự toán dự án
            </span>
            <Coins className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-primary">
            {formatMoneyVND(data?.project_total || "0.00")}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Cộng dồn từ toàn bộ các hạng mục lá
          </p>
        </div>

        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              Phiên bản áp dụng
            </span>
            <Layers className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-foreground">
            {data?.version ? `v${data.version.version_number}` : "Chưa lập"}
          </div>
          <p
            className="text-xs text-muted-foreground mt-1 truncate"
            title={data?.version?.description || "Chưa có mô tả"}
          >
            {data?.version?.description || "Chưa có mô tả"}
          </p>
        </div>

        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              Tiến độ phân bổ
            </span>
            <FolderTree className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-foreground">
            {allocatedLeaves.length} / {leafItems.length}
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">
              hạng mục lá đã được định mức
            </p>
            {unallocatedLeavesCount > 0 && (
              <button
                type="button"
                onClick={() =>
                  setFilterMode((prev) =>
                    prev === "unallocated" ? "all" : "unallocated"
                  )
                }
                className="text-xs font-medium text-amber-600 hover:underline cursor-pointer"
              >
                {filterMode === "unallocated"
                  ? "Hiện tất cả"
                  : `Lọc ${unallocatedLeavesCount} mục chưa nhập`}
              </button>
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              Thực chi đối chiếu
            </span>
            <CheckCircle2
              className={`w-4 h-4 ${
                data?.has_actual_costs ? "text-amber-600" : "text-muted-foreground"
              }`}
            />
          </div>
          <div className="mt-2 text-base font-semibold text-foreground">
            {data?.has_actual_costs ? "Đã phát sinh thực chi" : "Chưa có thực chi"}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {data?.has_actual_costs
              ? "Khóa ghi đè lịch sử"
              : "Có thể cập nhật trực tiếp"}
          </p>
        </div>
      </div>

      {/* ── Khung Kiểm soát Ngân sách & Phân tách 4 số liệu độc lập (Hợp đồng ≠ Dự toán ≠ Thực chi ≠ Đề nghị TT) ── */}
      <div
        data-testid="budget-control-panel"
        className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b bg-muted/20 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-sm sm:text-base text-foreground">
                Kiểm soát Ngân sách & Đối chiếu Đề nghị thanh toán (Áp dụng theo{" "}
                {data?.version
                  ? `v${data.version.version_number} — ${
                      data.version.status === "DRAFT"
                        ? "Bản nháp"
                        : "Đã được duyệt / Đang hiệu lực"
                    }`
                  : "phiên bản hiện hành"}
                )
              </h2>
              {projectControlSummary.overrunCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {projectControlSummary.overrunCount} hạng mục vượt ngân sách
                </Badge>
              )}
              {projectControlSummary.warningCount > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                  {projectControlSummary.warningCount} hạng mục chạm ngưỡng{" "}
                  {warnThresholdPct}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lưu ý nghiệp vụ: Thanh kiểm soát dùng công thức{" "}
              <strong>Chi phí thực tế đã ghi nhận chính thức (actual_costs) / Dự toán được duyệt (/budget)</strong>.{" "}
              <strong>Giá trị hợp đồng</strong>, <strong>Dự toán</strong>,{" "}
              <strong>Chi phí thực tế</strong> và <strong>Đề nghị thanh toán</strong> được theo dõi độc lập.
            </p>
          </div>

          {/* Cấu hình ngưỡng cảnh báo (80% / 100%) */}
          <div className="flex flex-wrap items-center gap-3 shrink-0 bg-background px-3 py-2 rounded-lg border text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            <div className="flex items-center gap-1.5">
              <Label htmlFor="warn-threshold-input" className="text-xs">
                Ngưỡng cảnh báo:
              </Label>
              <input
                id="warn-threshold-input"
                aria-label="Ngưỡng cảnh báo phần trăm"
                type="number"
                min={50}
                max={99}
                value={warnThresholdPct}
                onChange={(e) =>
                  setWarnThresholdPct(
                    Math.min(99, Math.max(50, Number(e.target.value) || 80))
                  )
                }
                className="w-14 h-7 rounded border px-1.5 text-center font-mono font-semibold bg-background"
              />
              <span>%</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Label htmlFor="limit-threshold-input" className="text-xs">
                Ngưỡng trần:
              </Label>
              <input
                id="limit-threshold-input"
                aria-label="Ngưỡng trần phần trăm"
                type="number"
                min={100}
                max={150}
                value={limitThresholdPct}
                onChange={(e) =>
                  setLimitThresholdPct(
                    Math.min(150, Math.max(100, Number(e.target.value) || 100))
                  )
                }
                className="w-16 h-7 rounded border px-1.5 text-center font-mono font-semibold bg-background"
              />
              <span>%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-muted/10 text-xs">
          <div className="p-3 rounded-lg bg-background border">
            <span className="text-muted-foreground block">
              1. Giá trị hợp đồng (S-35)
            </span>
            <span className="text-sm font-bold font-mono text-foreground mt-0.5 block">
              {formatMoneyVND(projectControlSummary.totalContract.toFixed(2))}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Trần pháp lý nghiệm thu với CĐT
            </span>
          </div>

          <div className="p-3 rounded-lg bg-background border">
            <span className="text-muted-foreground block">
              2. Dự toán áp dụng ({data?.version ? `v${data.version.version_number}` : "v1"})
            </span>
            <span className="text-sm font-bold font-mono text-primary mt-0.5 block">
              {formatMoneyVND(projectControlSummary.totalBudget.toFixed(2))}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Hạn mức ngân sách kiểm soát
            </span>
          </div>

          <div className="p-3 rounded-lg bg-background border">
            <span className="text-muted-foreground block">
              3. Chi phí thực tế lũy kế (S-47)
            </span>
            <div className="flex items-center justify-between mt-0.5 gap-1">
              <span className="text-sm font-bold font-mono text-foreground">
                {formatMoneyVND(projectControlSummary.totalActual.toFixed(2))}
              </span>
              <Badge
                variant="outline"
                data-testid="project-budget-ratio-badge"
                className="font-mono text-[11px]"
              >
                {projectControlSummary.hasBudgetBasis
                  ? `${projectControlSummary.actualPct.toFixed(1)}% dự toán`
                  : "Chưa có cơ sở dự toán"}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Ngân sách còn lại:{" "}
              <strong className="font-mono">
                {projectControlSummary.hasBudgetBasis
                  ? formatSignedDeltaVND(projectControlSummary.remainingBudget)
                  : "Chưa có cơ sở dự toán"}
              </strong>
            </span>
          </div>

          <div className="p-3 rounded-lg bg-background border">
            <span className="text-muted-foreground block">
              4. Đề nghị thanh toán (S-43)
            </span>
            <span className="text-sm font-bold font-mono text-foreground mt-0.5 block">
              Đã duyệt:{" "}
              {formatMoneyVND(projectControlSummary.totalApprovedPayment.toFixed(2))}
            </span>
            <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
              Đang trình kỳ này:{" "}
              {formatMoneyVND(projectControlSummary.totalPendingPayment.toFixed(2))}
            </span>
          </div>
        </div>

        {/* ── Thanh phần trăm kiểm soát ngân sách tổng thể & Chú giải 4 mức chuyển màu ── */}
        <div
          data-testid="project-budget-progress-section"
          className="px-4 py-3 border-t bg-background/80 space-y-2 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-foreground">
              Thanh kiểm soát ngân sách dự án (Chi phí thực tế chính thức / Dự toán được duyệt):
            </span>
            <span
              data-testid="project-budget-progress-label"
              className={`font-mono ${projectControlSummary.textColorClass}`}
            >
              {projectControlSummary.hasBudgetBasis
                ? `${projectControlSummary.actualRatioDisplay} (${projectControlSummary.zoneLabel})`
                : "Chưa có cơ sở dự toán"}
            </span>
          </div>

          <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              data-testid="project-budget-progress-bar"
              data-zone={projectControlSummary.zone}
              className={`h-full transition-all ${projectControlSummary.barColorClass}`}
              style={{
                width: `${
                  projectControlSummary.hasBudgetBasis
                    ? Math.min(Math.max(projectControlSummary.actualPct || 0, 0), 100)
                    : projectControlSummary.totalActual > 0
                    ? 100
                    : 0
                }%`,
              }}
            />
          </div>

          <div
            data-testid="budget-color-legend"
            className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-muted-foreground"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span>Dưới ngưỡng (&lt;{warnThresholdPct}%): Xanh lá</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
                <span>Trong ngưỡng cảnh báo ({warnThresholdPct}%–90%): Vàng</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                <span>Gần mức trần (90%–&lt;{limitThresholdPct}%): Cam</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                <span>Chạm &amp; vượt mức trần (≥{limitThresholdPct}%): Đỏ</span>
              </span>
            </div>
            <span>
              Ngân sách còn lại = Dự toán được duyệt − Chi phí thực tế:{" "}
              <strong className="font-mono text-foreground">
                {projectControlSummary.hasBudgetBasis
                  ? formatSignedDeltaVND(projectControlSummary.remainingBudget)
                  : "Chưa có cơ sở dự toán"}
              </strong>
            </span>
          </div>
        </div>

        {/* ── Khay Theo dõi Phiếu giải trình & Hạng mục vượt ngưỡng (Chống bỏ sót & Minh bạch 3 Tác nhân) ── */}
        {attentionOverrunItems.length > 0 && (
          <div
            data-testid="overrun-attention-tracker"
            className="border-t bg-amber-50/40 dark:bg-amber-950/15 p-4 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <FileWarning className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-bold text-xs sm:text-sm text-foreground">
                  Bảng theo dõi Phiếu giải trình & Kiểm soát nội bộ 3 tác nhân (Chống bỏ sót)
                </span>
                <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[11px]">
                  {attentionOverrunItems.filter((x) => x.needsAction).length} phiếu cần xử lý /{" "}
                  {attentionOverrunItems.length} hạng mục lưu ý
                </Badge>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Chuẩn pháp lý: <strong>(1) Người lập + Số biên bản</strong> →{" "}
                <strong>(2) Kế toán đối chiếu số liệu</strong> →{" "}
                <strong>(3) Chủ đầu tư độc lập phê duyệt</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {attentionOverrunItems.map(
                ({
                  item,
                  ctrl,
                  just,
                  step1Done,
                  hasLegalRef,
                  step2Done,
                  step3Status,
                  needsAction,
                }) => (
                  <div
                    key={item.id}
                    data-testid={`tracker-card-${item.code}`}
                    className={`p-3 rounded-lg border bg-background flex flex-col justify-between gap-2.5 shadow-2xs ${
                      needsAction
                        ? "border-amber-300 dark:border-amber-800"
                        : "border-emerald-200 dark:border-emerald-900/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-primary">
                            Phiếu [{item.code}] — {item.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Thực chi:{" "}
                          {ctrl.hasBudgetBasis
                            ? `${ctrl.actualRatioDisplay} dự toán`
                            : "Chưa có cơ sở dự toán"}{" "}
                          |{" "}
                          {just?.legal_document_ref ? (
                            <span className="text-foreground font-medium">
                              Số VB pháp lý: {just.legal_document_ref}
                            </span>
                          ) : (
                            <span className="text-amber-700 font-medium">
                              Chưa đính kèm số biên bản/tờ trình pháp lý
                            </span>
                          )}
                        </p>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant={needsAction ? "default" : "outline"}
                        onClick={() => handleOpenOverrunControl(item)}
                        className="h-7 px-2.5 text-xs shrink-0"
                      >
                        {!step1Done
                          ? "Lập giải trình"
                          : !step2Done && canVerifyOverrun
                          ? "Kế toán đối chiếu"
                          : step3Status !== "approved" && canApproveOverrun
                          ? "Xét duyệt"
                          : "Mở phiếu"}
                      </Button>
                    </div>

                    {/* Stepper 3 tác nhân trực quan trên thẻ */}
                    <div className="grid grid-cols-3 gap-1.5 pt-2 border-t text-[11px]">
                      <div
                        className={`p-1.5 rounded border ${
                          step1Done && hasLegalRef
                            ? "bg-emerald-50/80 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                            : step1Done
                            ? "bg-amber-50 border-amber-200 text-amber-900"
                            : "bg-muted/40 border-dashed text-muted-foreground"
                        }`}
                      >
                        <span className="font-bold block">1. Người lập & VB</span>
                        <span className="block truncate text-[10px]">
                          {step1Done
                            ? `${just.submitted_by_name || `#${just.submitted_by}`}`
                            : "Chưa lập phiếu"}
                        </span>
                      </div>

                      <div
                        className={`p-1.5 rounded border ${
                          step2Done
                            ? "bg-emerald-50/80 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                            : "bg-amber-50/80 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                        }`}
                      >
                        <span className="font-bold block">2. Kế toán thẩm tra</span>
                        <span className="block truncate text-[10px]">
                          {step2Done
                            ? `${just.accountant_verified_by_name || `#${just.accountant_verified_by}`} ✓`
                            : "Chờ Kế toán xác nhận"}
                        </span>
                      </div>

                      <div
                        className={`p-1.5 rounded border ${
                          step3Status === "approved"
                            ? "bg-blue-50/80 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200"
                            : step3Status === "rejected"
                            ? "bg-red-50 border-red-200 text-red-900"
                            : step3Status === "pending_assignment"
                            ? "bg-purple-50 border-purple-200 text-purple-900"
                            : "bg-amber-50/80 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                        }`}
                      >
                        <span className="font-bold block">3. CĐT độc lập</span>
                        <span className="block truncate text-[10px]">
                          {step3Status === "approved"
                            ? `${just?.reviewed_by_name || "Đã duyệt"} ✓`
                            : step3Status === "rejected"
                            ? "Đã từ chối ✕"
                            : step3Status === "pending_assignment"
                            ? "Chờ phân công CĐT"
                            : "Chờ CĐT độc lập duyệt"}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── QoL #2: Khung So sánh hai phiên bản dự toán (vA vs vB) ───────── */}
      {compareMode && (
        <div
          data-testid="budget-version-comparison"
          className="rounded-xl border border-primary/30 bg-card text-card-foreground shadow-sm overflow-hidden"
        >
          <div className="p-4 border-b bg-primary/5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-base text-foreground">
                  So sánh hai phiên bản dự toán
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Đối chiếu chênh lệch số tiền, tỷ lệ phần trăm và các hạng mục tăng/giảm giữa hai mốc phiên bản.
              </p>
            </div>

            {versions.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="compare-version-a" className="text-xs whitespace-nowrap">
                    Phiên bản gốc:
                  </Label>
                  <select
                    id="compare-version-a"
                    aria-label="Phiên bản gốc"
                    value={compareVersionA}
                    onChange={(e) => setCompareVersionA(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium"
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={String(v.version_number)}>
                        v{v.version_number} ({formatMoneyVND(v.total_amount)})
                      </option>
                    ))}
                  </select>
                </div>

                <span className="text-xs text-muted-foreground font-semibold">so với</span>

                <div className="flex items-center gap-1.5">
                  <Label htmlFor="compare-version-b" className="text-xs whitespace-nowrap">
                    Phiên bản đối chiếu:
                  </Label>
                  <select
                    id="compare-version-b"
                    aria-label="Phiên bản đối chiếu"
                    value={compareVersionB}
                    onChange={(e) => setCompareVersionB(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2.5 text-xs font-medium"
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={String(v.version_number)}>
                        v{v.version_number} ({formatMoneyVND(v.total_amount)})
                      </option>
                    ))}
                  </select>
                </div>

                <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer select-none ml-1">
                  <input
                    type="checkbox"
                    checked={compareOnlyChanged}
                    onChange={(e) => setCompareOnlyChanged(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span>Chỉ hiện mục thay đổi</span>
                </label>
              </div>
            )}
          </div>

          {versions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Dự án chưa có phiên bản dự toán nào để so sánh.
            </div>
          ) : compareLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-muted/20 border-b text-sm">
                <div className="p-3 rounded-lg bg-background border">
                  <span className="text-xs text-muted-foreground block">
                    Tổng dự toán v{compareVersionA} (Gốc)
                  </span>
                  <span className="text-base font-bold font-mono">
                    {formatMoneyVND(compareSummary.totalA.toFixed(2))}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-background border">
                  <span className="text-xs text-muted-foreground block">
                    Tổng dự toán v{compareVersionB} (Đối chiếu)
                  </span>
                  <span className="text-base font-bold font-mono text-primary">
                    {formatMoneyVND(compareSummary.totalB.toFixed(2))}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-background border">
                  <span className="text-xs text-muted-foreground block">
                    Tổng thay đổi toàn dự án
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-base font-bold font-mono ${
                        compareSummary.delta > 0
                          ? "text-amber-600"
                          : compareSummary.delta < 0
                          ? "text-emerald-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatSignedDeltaVND(compareSummary.delta)}
                    </span>
                    <Badge variant="outline" className="text-xs font-mono">
                      {compareSummary.pctText}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                    <tr className="border-b text-xs font-semibold uppercase text-muted-foreground">
                      <th className="p-3 w-24">Mã</th>
                      <th className="p-3 min-w-[220px]">Hạng mục</th>
                      <th className="p-3 w-36 text-right">v{compareVersionA} (VND)</th>
                      <th className="p-3 w-36 text-right">v{compareVersionB} (VND)</th>
                      <th className="p-3 w-40 text-right">Chênh lệch</th>
                      <th className="p-3 w-28 text-right">Tỷ lệ %</th>
                      <th className="p-3 w-32 text-center">Biến động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          Không có hạng mục nào thay đổi giữa hai phiên bản.
                        </td>
                      </tr>
                    ) : (
                      comparisonRows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b hover:bg-muted/30 ${
                            !row.is_leaf ? "bg-muted/15 font-semibold" : ""
                          }`}
                        >
                          <td className="p-3 font-mono text-xs text-muted-foreground">
                            {row.code || "—"}
                          </td>
                          <td
                            className="p-3"
                            style={{ paddingLeft: `${12 + row.level * 20}px` }}
                          >
                            {row.name}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums">
                            {row.is_leaf && row.valA === null
                              ? "Chưa nhập"
                              : formatMoneyVND(row.numA.toFixed(2))}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums">
                            {row.is_leaf && row.valB === null
                              ? "Chưa nhập"
                              : formatMoneyVND(row.numB.toFixed(2))}
                          </td>
                          <td
                            className={`p-3 text-right font-mono tabular-nums font-medium ${
                              row.delta > 0
                                ? "text-amber-600"
                                : row.delta < 0
                                ? "text-emerald-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            {formatSignedDeltaVND(row.delta)}
                          </td>
                          <td className="p-3 text-right font-mono text-xs">
                            {row.pctText}
                          </td>
                          <td className="p-3 text-center">
                            {row.status === "added" && (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs">
                                Mới nhập
                              </Badge>
                            )}
                            {row.status === "removed" && (
                              <Badge variant="destructive" className="text-xs">
                                Đã xóa số
                              </Badge>
                            )}
                            {row.status === "increased" && (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs gap-0.5">
                                <ArrowUpRight className="w-3 h-3" />
                                Tăng
                              </Badge>
                            )}
                            {row.status === "decreased" && (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs gap-0.5">
                                <ArrowDownRight className="w-3 h-3" />
                                Giảm
                              </Badge>
                            )}
                            {row.status === "unchanged" && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                                <Minus className="w-3 h-3" />
                                Không đổi
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Bảng cây dự toán ── */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-muted/20 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">
                Cây cơ cấu công việc & kiểm soát dự toán chi phí
              </span>
              {isFilteringActive && (
                <Badge variant="secondary" className="text-xs">
                  Hiển thị {matchedNodesCount} mục phù hợp
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {canManageBudget
                ? '* Nhấp vào nút "Nhập dự toán" ở hạng mục lá để khai báo chi phí'
                : `* Chế độ Chỉ xem (${roleLabel})`}
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            {/* Tìm kiếm & Bộ lọc (QoL #1) */}
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px] max-w-sm">
                <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo mã hoặc tên hạng mục..."
                  aria-label="Tìm kiếm hạng mục WBS"
                  className="pl-8 pr-8 h-9 text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Xóa từ khóa tìm kiếm"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div
                className="flex flex-wrap items-center gap-1.5"
                role="tablist"
                aria-label="Bộ lọc hạng mục"
              >
                <Filter className="w-3.5 h-3.5 text-muted-foreground mr-0.5 hidden sm:inline" />
                {FILTER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    role="tab"
                    aria-selected={filterMode === opt.value}
                    variant={filterMode === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterMode(opt.value)}
                    className="h-8 text-xs px-2.5"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Điều khiển Mở rộng tất cả / Thu gọn tất cả (QoL #4) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExpandAll}
                className="h-8 text-xs gap-1 px-2.5"
                title="Mở rộng toàn bộ các nhánh trong cây WBS"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
                <span>Mở rộng tất cả</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCollapseAll}
                className="h-8 text-xs gap-1 px-2.5"
                title="Thu gọn toàn bộ các nhánh cha để tập trung tổng quan"
              >
                <ChevronsDownUp className="w-3.5 h-3.5" />
                <span>Thu gọn tất cả</span>
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-destructive">{error}</div>
        ) : rawTreeRoots.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Dự án chưa có hạng mục công việc (WBS). Vui lòng thêm hạng mục tại màn hình WBS trước.
          </div>
        ) : treeRoots.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Không tìm thấy hạng mục nào khớp với điều kiện lọc hiện tại.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setFilterMode("all");
              }}
            >
              Xóa bộ lọc
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80 shadow-xs">
                <tr className="border-b text-xs font-semibold uppercase text-muted-foreground">
                  <th className="p-3 w-28">Mã</th>
                  <th className="p-3 min-w-[260px]">Hạng mục công việc (WBS)</th>
                  <th className="p-3 w-28 text-center">Phân loại</th>
                  <th className="p-3 w-40 text-right">Dự toán lá (VND)</th>
                  <th className="p-3 w-44 text-right">Tổng cộng dồn (VND)</th>
                  <th className="p-3 min-w-[230px]">
                    Kiểm soát ngân sách ({warnThresholdPct}% / {limitThresholdPct}%)
                  </th>
                  <th className="p-3 min-w-[140px]">Ghi chú</th>
                  <th className="p-3 w-44 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>{renderTreeRows(treeRoots)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Dialog Đối chiếu & Giải trình / Xử lý vượt ngân sách (Soft-Control & 3-Actor Legal Rigor) ── */}
      <Dialog
        open={Boolean(selectedOverrunItem)}
        onOpenChange={(open) => !open && setSelectedOverrunItem(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileWarning className="w-5 h-5 text-amber-600" />
              Đối chiếu Ngân sách & Luồng Kiểm soát 3 Tác nhân
            </DialogTitle>
          </DialogHeader>

          {selectedOverrunItem && selectedOverrunCtrl && (
            <div className="space-y-4 py-2 text-sm">
              <div className="p-3 rounded-lg bg-muted/40 border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs text-muted-foreground font-mono block">
                    Hạng mục lá: [{selectedOverrunItem.code}]
                  </span>
                  <span className="font-bold text-foreground">
                    {selectedOverrunItem.name}
                  </span>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  Phiên bản dự toán áp dụng: v{data?.version?.version_number || 1}
                </Badge>
              </div>

              {/* ── Stepper Trực quan 3 Tác nhân (Người lập + VB pháp lý → Kế toán đối chiếu → CĐT độc lập duyệt) ── */}
              <div
                data-testid="actor-workflow-stepper"
                className="p-3 rounded-lg border bg-slate-50/80 dark:bg-slate-900/50 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-foreground">
                    Quy trình Kiểm soát Nội bộ & Pháp lý (3 Tác nhân độc lập)
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Chống tự duyệt & đảm bảo đủ căn cứ chứng từ
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {/* Bước 1: Người lập + Hồ sơ pháp lý */}
                  <div
                    className={`p-2.5 rounded-lg border ${
                      selectedOverrunCtrl.justification
                        ? selectedOverrunCtrl.justification.legal_document_ref ||
                          justificationLegalRef.trim()
                          ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
                          : "bg-amber-50/90 border-amber-300 text-amber-950"
                        : "bg-background border-dashed text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-bold">
                      <span>1. Người lập & Hồ sơ</span>
                      <span>
                        {selectedOverrunCtrl.justification
                          ? selectedOverrunCtrl.justification.legal_document_ref ||
                            justificationLegalRef.trim()
                            ? "✓ Đủ VB"
                            : "Thiếu VB"
                          : "Chưa lập"}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1">
                      {selectedOverrunCtrl.justification ? (
                        <>
                          Người lập:{" "}
                          <strong>
                            {selectedOverrunCtrl.justification.submitted_by_name ||
                              `#${selectedOverrunCtrl.justification.submitted_by}`}
                          </strong>
                          <span className="block font-mono text-[10px] mt-0.5">
                            Số VB:{" "}
                            {selectedOverrunCtrl.justification.legal_document_ref ||
                              justificationLegalRef.trim() ||
                              "Chưa cập nhật"}
                          </span>
                        </>
                      ) : (
                        "Ban quản lý / Chủ đầu tư lập giải trình kèm số biên bản hiện trường."
                      )}
                    </p>
                  </div>

                  {/* Bước 2: Kế toán đối chiếu & xác nhận số liệu */}
                  <div
                    className={`p-2.5 rounded-lg border ${
                      selectedOverrunCtrl.justification?.accountant_verified_by
                        ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
                        : "bg-amber-50/90 border-amber-300 text-amber-950 dark:bg-amber-950/30 dark:text-amber-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-bold">
                      <span>2. Kế toán đối chiếu</span>
                      <span>
                        {selectedOverrunCtrl.justification?.accountant_verified_by
                          ? "✓ Đã xác nhận"
                          : "Chờ Kế toán"}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1">
                      {selectedOverrunCtrl.justification?.accountant_verified_by ? (
                        <>
                          Xác nhận bởi:{" "}
                          <strong>
                            {selectedOverrunCtrl.justification
                              .accountant_verified_by_name ||
                              `#${selectedOverrunCtrl.justification.accountant_verified_by}`}
                          </strong>
                          {selectedOverrunCtrl.justification.accountant_note && (
                            <span className="block text-[10px] mt-0.5 truncate">
                              {selectedOverrunCtrl.justification.accountant_note}
                            </span>
                          )}
                        </>
                      ) : (
                        "Kế toán kiểm tra chéo thực chi (S-47) & đề nghị thanh toán (S-43)."
                      )}
                    </p>
                  </div>

                  {/* Bước 3: Chủ đầu tư độc lập phê duyệt */}
                  <div
                    className={`p-2.5 rounded-lg border ${
                      selectedOverrunCtrl.justification?.status === "APPROVED" ||
                      selectedOverrunCtrl.justification?.status ===
                        "APPROVED_EXCEPTION"
                        ? "bg-blue-50/90 border-blue-300 text-blue-950 dark:bg-blue-950/30 dark:text-blue-200"
                        : selectedOverrunCtrl.justification?.status === "REJECTED"
                        ? "bg-red-50/90 border-red-300 text-red-950"
                        : selectedOverrunCtrl.justification?.status ===
                          "PENDING_ASSIGNMENT"
                        ? "bg-purple-50/90 border-purple-300 text-purple-950"
                        : "bg-amber-50/90 border-amber-300 text-amber-950 dark:bg-amber-950/30 dark:text-amber-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 font-bold">
                      <span>3. CĐT độc lập duyệt</span>
                      <span>
                        {selectedOverrunCtrl.justification?.status === "APPROVED" ||
                        selectedOverrunCtrl.justification?.status ===
                          "APPROVED_EXCEPTION"
                          ? "✓ Đã duyệt"
                          : selectedOverrunCtrl.justification?.status === "REJECTED"
                          ? "✕ Từ chối"
                          : "Chờ duyệt"}
                      </span>
                    </div>
                    <p className="text-[11px] mt-1">
                      {selectedOverrunCtrl.justification?.reviewed_by_name ||
                      selectedOverrunCtrl.justification?.approved_by ? (
                        <>
                          Người xử lý:{" "}
                          <strong>
                            {selectedOverrunCtrl.justification.reviewed_by_name ||
                              selectedOverrunCtrl.justification.approved_by}
                          </strong>
                        </>
                      ) : (
                        "Chủ đầu tư độc lập (khác người lập) phê duyệt khi đủ Bước 1 & Bước 2."
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bảng tách bạch 4 chỉ số của hạng mục */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded border bg-background">
                  <span className="text-muted-foreground block">
                    Giá trị hợp đồng (S-35):
                  </span>
                  <strong className="font-mono text-sm">
                    {formatMoneyVND(selectedOverrunCtrl.contractValue.toFixed(2))}
                  </strong>
                  {selectedOverrunCtrl.acceptancePct !== null && (
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      Tiến độ nghiệm thu: {selectedOverrunCtrl.acceptancePct}%
                    </span>
                  )}
                </div>

                <div className="p-2.5 rounded border bg-background">
                  <span className="text-muted-foreground block">
                    Dự toán áp dụng (v{data?.version?.version_number || 1}):
                  </span>
                  <strong className="font-mono text-sm text-primary">
                    {formatMoneyVND(selectedOverrunCtrl.budget.toFixed(2))}
                  </strong>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    Ngưỡng cảnh báo: {warnThresholdPct}% | Trần: {limitThresholdPct}%
                  </span>
                </div>

                <div className="p-2.5 rounded border bg-background">
                  <span className="text-muted-foreground block">
                    Chi phí thực tế đã ghi nhận (S-47):
                  </span>
                  <strong className="font-mono text-sm">
                    {formatMoneyVND(selectedOverrunCtrl.actual.toFixed(2))} (
                    {selectedOverrunCtrl.hasBudgetBasis
                      ? selectedOverrunCtrl.actualRatioDisplay
                      : "Chưa có cơ sở dự toán"}
                    )
                  </strong>
                  <span className="block text-[11px] text-muted-foreground mt-0.5">
                    Dự toán còn lại so với thực chi:{" "}
                    {selectedOverrunCtrl.hasBudgetBasis
                      ? formatSignedDeltaVND(
                          selectedOverrunCtrl.remainingBudgetForActual
                        )
                      : "Chưa có cơ sở dự toán"}
                  </span>
                </div>

                <div className="p-2.5 rounded border bg-background">
                  <span className="text-muted-foreground block">
                    Đề nghị thanh toán (Đã duyệt + Kỳ này):
                  </span>
                  <strong className="font-mono text-sm">
                    {formatMoneyVND(
                      selectedOverrunCtrl.totalPaymentRequested.toFixed(2)
                    )}{" "}
                    (
                    {selectedOverrunCtrl.hasBudgetBasis &&
                    selectedOverrunCtrl.paymentRatioPct !== null
                      ? `${selectedOverrunCtrl.paymentRatioPct.toFixed(1)}%`
                      : "Chưa có cơ sở dự toán"}
                    )
                  </strong>
                  {selectedOverrunCtrl.paymentOverrunAmount > 0 && (
                    <span className="block text-[11px] text-red-600 font-semibold mt-0.5">
                      Vượt dự toán còn lại:{" "}
                      +{formatMoneyVND(selectedOverrunCtrl.paymentOverrunAmount.toFixed(2))}
                    </span>
                  )}
                </div>
              </div>

              {/* Hiển thị giải trình hiện có (nếu đã gửi) — Quy tắc 5 & 6 */}
              {selectedOverrunCtrl.justification && (
                <div
                  data-testid="overrun-justification-record"
                  className="p-3 rounded-lg border border-blue-200 bg-blue-50/70 dark:bg-blue-950/20 text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-blue-900 dark:text-blue-200">
                      Hồ sơ giải trình vượt dự toán (1 cấp Chủ đầu tư duyệt):
                    </span>
                    <Badge variant="outline" className="text-[11px]">
                      {selectedOverrunCtrl.justification.status === "APPROVED" ||
                      selectedOverrunCtrl.justification.status ===
                        "APPROVED_EXCEPTION"
                        ? "Đã phê duyệt (APPROVED)"
                        : selectedOverrunCtrl.justification.status === "REJECTED"
                        ? "Đã từ chối (REJECTED)"
                        : selectedOverrunCtrl.justification.status ===
                          "PENDING_ASSIGNMENT"
                        ? "Chờ phân công người duyệt độc lập"
                        : "Đang chờ Chủ đầu tư duyệt"}
                    </Badge>
                  </div>

                  <p className="font-medium text-foreground">
                    Nguyên nhân: {selectedOverrunCtrl.justification.reason_type}
                  </p>
                  <p className="text-muted-foreground">
                    Nội dung giải trình:{" "}
                    {selectedOverrunCtrl.justification.explanation}
                  </p>
                  {selectedOverrunCtrl.justification.legal_document_ref && (
                    <p className="text-foreground font-mono text-[11px]">
                      Căn cứ văn bản pháp lý:{" "}
                      <strong>
                        {selectedOverrunCtrl.justification.legal_document_ref}
                      </strong>
                    </p>
                  )}

                  {/* Quy tắc 5: Ghi nhận chính xác người lập, kế toán đối chiếu, người duyệt, thời gian và kết quả xử lý */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1.5 border-t border-blue-200/70 text-[11px] text-muted-foreground">
                    <div>
                      <span className="font-semibold text-foreground block">
                        1. Người lập giải trình:
                      </span>
                      <span>
                        {selectedOverrunCtrl.justification.submitted_by_name ||
                          selectedOverrunCtrl.justification.submitted_by}{" "}
                        (ID #{selectedOverrunCtrl.justification.submitted_by})
                      </span>
                      {selectedOverrunCtrl.justification.submitted_at && (
                        <span className="block">
                          Thời gian lập:{" "}
                          {new Date(
                            selectedOverrunCtrl.justification.submitted_at
                          ).toLocaleString("vi-VN")}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="font-semibold text-foreground block">
                        2. Kế toán đối chiếu số liệu:
                      </span>
                      {selectedOverrunCtrl.justification.accountant_verified_by ? (
                        <>
                          <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                            {selectedOverrunCtrl.justification
                              .accountant_verified_by_name ||
                              `ID #${selectedOverrunCtrl.justification.accountant_verified_by}`}{" "}
                            (ID #
                            {
                              selectedOverrunCtrl.justification
                                .accountant_verified_by
                            }
                            )
                          </span>
                          {selectedOverrunCtrl.justification
                            .accountant_verified_at && (
                            <span className="block">
                              Xác nhận lúc:{" "}
                              {new Date(
                                selectedOverrunCtrl.justification
                                  .accountant_verified_at
                              ).toLocaleString("vi-VN")}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="italic text-amber-700">
                          Chưa có xác nhận đối chiếu của Kế toán
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="font-semibold text-foreground block">
                        3. Người duyệt độc lập (CĐT):
                      </span>
                      {selectedOverrunCtrl.justification.reviewed_by_name ||
                      selectedOverrunCtrl.justification.approved_by ? (
                        <>
                          <span>
                            {selectedOverrunCtrl.justification.reviewed_by_name ||
                              selectedOverrunCtrl.justification.approved_by}
                            {selectedOverrunCtrl.justification.reviewed_by &&
                              ` (ID #${selectedOverrunCtrl.justification.reviewed_by})`}
                          </span>
                          {(selectedOverrunCtrl.justification.reviewed_at ||
                            selectedOverrunCtrl.justification.approved_at) && (
                            <span className="block">
                              Thời gian xử lý:{" "}
                              {new Date(
                                selectedOverrunCtrl.justification.reviewed_at ||
                                  selectedOverrunCtrl.justification.approved_at
                              ).toLocaleString("vi-VN")}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="italic">
                          Chưa có quyết định phê duyệt / từ chối
                        </span>
                      )}
                    </div>
                  </div>

                  {selectedOverrunCtrl.justification.accountant_note && (
                    <div className="pt-1 text-[11px] text-foreground">
                      <strong>Ghi chú thẩm tra Kế toán:</strong>{" "}
                      {selectedOverrunCtrl.justification.accountant_note}
                    </div>
                  )}

                  {selectedOverrunCtrl.justification.review_note && (
                    <div className="pt-1 text-[11px] text-foreground">
                      <strong>Ý kiến người duyệt:</strong>{" "}
                      {selectedOverrunCtrl.justification.review_note}
                    </div>
                  )}

                  {/* Quy tắc 6: Cảnh báo khi không có người duyệt độc lập phù hợp */}
                  {selectedOverrunCtrl.justification.status ===
                    "PENDING_ASSIGNMENT" && (
                    <div
                      data-testid="pending-assignment-alert"
                      className="mt-1.5 p-2 rounded bg-purple-100/90 border border-purple-300 text-purple-950 text-[11px]"
                    >
                      <strong>Quy tắc 6 (Chờ phân công):</strong> Dự án hiện chưa có người duyệt độc lập phù hợp (khác với người lập giải trình). Giải trình được giữ ở trạng thái{" "}
                      <strong>Chờ phân công người duyệt độc lập</strong> và{" "}
                      <strong>tuyệt đối không tự động thông qua</strong>.
                    </div>
                  )}

                  {/* Quy tắc 2: Cảnh báo trực quan khi người lập đang đăng nhập trùng với người lập giải trình */}
                  {canApproveOverrun &&
                    Number(selectedOverrunCtrl.justification.submitted_by) ===
                      Number(currentUserId) && (
                      <div
                        data-testid="self-approval-blocked-alert"
                        className="mt-1.5 p-2 rounded bg-amber-100/90 border border-amber-300 text-amber-950 text-[11px]"
                      >
                        <strong>Nguyên tắc bắt buộc (Cấm tự duyệt):</strong> Bạn (
                        {currentUserName}) là người đã lập giải trình này nên{" "}
                        <strong>không được phép tự duyệt hoặc từ chối</strong> giải trình của chính mình, kể cả khi giữ vai trò Chủ đầu tư. Cần một Chủ đầu tư độc lập khác xét duyệt.
                      </div>
                    )}
                </div>
              )}

              {/* Tác nhân 1: Form nhập giải trình & số văn bản pháp lý (Quy tắc 1) */}
              {canManageBudget && (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">
                      1. Lập / Cập nhật giải trình vượt dự toán (Người lập:{" "}
                      {currentUserName} — {roleLabel})
                    </span>
                    {!isDemo && eligibleReviewers.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        Người duyệt CĐT trong dự án:{" "}
                        {eligibleReviewers.map((r) => r.name).join(", ")}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="overrun-reason-type"
                        className="text-xs font-semibold"
                      >
                        Phân loại nguyên nhân vượt ngưỡng:
                      </Label>
                      <select
                        id="overrun-reason-type"
                        value={justificationType}
                        onChange={(e) => setJustificationType(e.target.value)}
                        className="w-full h-9 rounded-md border bg-background px-2.5 text-xs"
                      >
                        {OVERRUN_JUSTIFICATION_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="overrun-legal-ref"
                        className="text-xs font-semibold"
                      >
                        Số biên bản hiện trường / Tờ trình pháp lý (Bắt buộc trước khi duyệt):
                      </Label>
                      <Input
                        id="overrun-legal-ref"
                        value={justificationLegalRef}
                        onChange={(e) => {
                          setJustificationLegalRef(e.target.value);
                          setJustificationError("");
                        }}
                        placeholder="VD: 04/BB-HT-2026 hoặc TT-09/2026/CT-BQL"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="overrun-explanation"
                      className="text-xs font-semibold"
                    >
                      Nội dung giải trình & phương án xử lý:
                    </Label>
                    <Input
                      id="overrun-explanation"
                      value={justificationText}
                      onChange={(e) => {
                        setJustificationText(e.target.value);
                        setJustificationError("");
                      }}
                      placeholder="Nhập căn cứ biên bản hiện trường hoặc phương án bù trừ ngân sách..."
                    />
                  </div>
                </div>
              )}

              {/* Tác nhân 2: Khung Thẩm tra & Xác nhận đối chiếu số liệu dành cho Kế toán */}
              {canVerifyOverrun && selectedOverrunCtrl.justification && (
                <div
                  data-testid="accountant-verification-section"
                  className="space-y-2.5 border-t pt-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      2. Thẩm tra & Xác nhận đối chiếu số liệu của Kế toán (Người thẩm tra:{" "}
                      {currentUserName})
                    </span>
                    <Badge variant="outline" className="text-[11px]">
                      {selectedOverrunCtrl.justification.accountant_verified_by
                        ? "Đã xác nhận đối chiếu"
                        : "Đang chờ xác nhận"}
                    </Badge>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="overrun-accountant-note"
                      className="text-xs font-semibold"
                    >
                      Nhận xét đối chiếu chứng từ thực chi (S-47) & đề nghị thanh toán (S-43):
                    </Label>
                    <Input
                      id="overrun-accountant-note"
                      value={justificationAccountantNote}
                      onChange={(e) => {
                        setJustificationAccountantNote(e.target.value);
                        setJustificationError("");
                      }}
                      placeholder="Xác nhận số liệu thực chi và hồ sơ thanh toán khớp chứng từ gốc..."
                    />
                  </div>
                </div>
              )}

              {/* Tác nhân 3: Khung xét duyệt 1 cấp dành cho Chủ đầu tư độc lập (Quy tắc 2, 3, 4 & Điều kiện pháp lý) */}
              {canApproveOverrun && selectedOverrunCtrl.justification && (
                <div className="space-y-2 border-t pt-3 mt-2">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                    <span className="font-bold text-xs text-foreground">
                      3. Quyết định phê duyệt của Chủ đầu tư độc lập:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={
                          selectedOverrunCtrl.justification.legal_document_ref ||
                          justificationLegalRef.trim()
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-amber-300 bg-amber-50 text-amber-800"
                        }
                      >
                        {selectedOverrunCtrl.justification.legal_document_ref ||
                        justificationLegalRef.trim()
                          ? "✓ Có số văn bản pháp lý"
                          : "! Chưa có số văn bản pháp lý"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          selectedOverrunCtrl.justification
                            .accountant_verified_by
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-amber-300 bg-amber-50 text-amber-800"
                        }
                      >
                        {selectedOverrunCtrl.justification.accountant_verified_by
                          ? "✓ Kế toán đã đối chiếu"
                          : "! Chờ Kế toán đối chiếu"}
                      </Badge>
                    </div>
                  </div>

                  <Label
                    htmlFor="overrun-review-note"
                    className="text-xs font-semibold"
                  >
                    Ý kiến phê duyệt / Lý do từ chối của Chủ đầu tư (Bắt buộc khi từ chối):
                  </Label>
                  <Input
                    id="overrun-review-note"
                    value={justificationReviewNote}
                    onChange={(e) => {
                      setJustificationReviewNote(e.target.value);
                      setJustificationError("");
                    }}
                    disabled={
                      Number(
                        selectedOverrunCtrl.justification.submitted_by
                      ) === Number(currentUserId)
                    }
                    placeholder="Nhập quyết định phê duyệt hoặc yêu cầu bổ sung hồ sơ..."
                  />
                </div>
              )}

              {justificationError && (
                <div
                  data-testid="overrun-justification-error"
                  className="text-xs text-destructive bg-destructive/10 p-2 rounded"
                >
                  {justificationError}
                </div>
              )}

              {!canManageBudget && !canVerifyOverrun && (
                <div className="p-2.5 rounded bg-muted/40 text-xs text-muted-foreground">
                  Bạn đang ở chế độ <strong>Chỉ xem ({roleLabel})</strong>. Quy trình xử lý gồm 3 tác nhân: (1) Ban quản lý / Chủ đầu tư lập giải trình kèm số biên bản pháp lý → (2) Kế toán xác nhận đối chiếu số liệu → (3) Chủ đầu tư độc lập phê duyệt.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedOverrunItem(null)}
            >
              Đóng
            </Button>

            {canVerifyOverrun && selectedOverrunCtrl?.justification && (
              <Button
                type="button"
                onClick={handleAccountantVerifyJustification}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                Kế toán xác nhận số liệu
              </Button>
            )}

            {canManageBudget && selectedOverrunItem && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const item = selectedOverrunItem;
                    setSelectedOverrunItem(null);
                    handleOpenEdit(item);
                  }}
                >
                  Điều chỉnh dự toán (Tạo phiên bản mới)
                </Button>

                <Button
                  type="button"
                  onClick={handleSubmitOverrunJustification}
                >
                  Gửi giải trình để duyệt
                </Button>

                {canApproveOverrun && selectedOverrunCtrl?.justification && (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={
                        Number(
                          selectedOverrunCtrl.justification.submitted_by
                        ) === Number(currentUserId)
                      }
                      onClick={() => handleReviewOverrunJustification("REJECTED")}
                      title={
                        Number(
                          selectedOverrunCtrl.justification.submitted_by
                        ) === Number(currentUserId)
                          ? "Người lập không được phép tự duyệt hoặc từ chối giải trình của chính mình"
                          : "Từ chối giải trình vượt dự toán"
                      }
                    >
                      Từ chối giải trình
                    </Button>

                    <Button
                      type="button"
                      variant="default"
                      disabled={
                        Number(
                          selectedOverrunCtrl.justification.submitted_by
                        ) === Number(currentUserId)
                      }
                      onClick={() => handleReviewOverrunJustification("APPROVED")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      title={
                        Number(
                          selectedOverrunCtrl.justification.submitted_by
                        ) === Number(currentUserId)
                          ? "Người lập không được phép tự duyệt giải trình của chính mình"
                          : "Phê duyệt giải trình vượt dự toán"
                      }
                    >
                      Duyệt giải trình
                    </Button>
                  </>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog nhập dự toán cho hạng mục lá (kèm Lý do điều chỉnh - QoL #3) ── */}
      <Dialog
        open={Boolean(editingItem)}
        onOpenChange={(open) => !open && setEditingItem(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Pencil className="w-5 h-5 text-primary" />
              Nhập dự toán cho hạng mục lá
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <span className="text-xs text-muted-foreground block font-mono">
                Hạng mục:
              </span>
              <span className="font-semibold text-foreground">
                [{editingItem?.code || "—"}] {editingItem?.name}
              </span>
            </div>

            {data?.has_actual_costs && (
              <div className="flex items-center gap-2 p-2.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-xs text-amber-800 dark:text-amber-300">
                <Info className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Dự án đã có thực chi. Thay đổi này sẽ được lưu thành{" "}
                  <strong>
                    phiên bản mới v{(data?.version?.version_number || 1) + 1}
                  </strong>
                  .
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="budget-amount" className="text-sm font-medium">
                Số tiền dự toán (VND) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="budget-amount"
                type="text"
                value={formAmount}
                onChange={(e) => {
                  setFormAmount(e.target.value);
                  setFormError("");
                }}
                placeholder="Ví dụ: 150.000.000"
                className="font-mono text-base"
                autoFocus
              />
              <span className="text-xs text-muted-foreground block">
                Số tiền phải lớn hơn hoặc bằng 0, không nhập số âm.
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget-reason" className="text-sm font-medium">
                Lý do điều chỉnh{" "}
                {(data?.has_actual_costs || createNewVersionFlag) && (
                  <span className="text-destructive">*</span>
                )}
              </Label>
              <select
                id="budget-reason"
                aria-label="Lý do điều chỉnh"
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                {ADJUSTMENT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget-note" className="text-sm font-medium">
                Ghi chú dự toán / Chi tiết thay đổi
              </Label>
              <Input
                id="budget-note"
                type="text"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Ghi chú chi tiết lý do hoặc căn cứ điều chỉnh (nếu có)"
              />
            </div>

            {!data?.has_actual_costs && data?.version && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={createNewVersionFlag}
                  onChange={(e) => setCreateNewVersionFlag(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span>
                  Chốt thành phiên bản dự toán mới (v
                  {(data?.version?.version_number || 1) + 1}) để lưu mốc lịch sử
                </span>
              </label>
            )}

            {formError && (
              <div className="text-xs text-destructive bg-destructive/10 p-2.5 rounded border border-destructive/20">
                {formError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingItem(null)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleSaveItemBudget}
              disabled={submitting}
              className="gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? "Đang lưu..." : "Lưu dự toán"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QoL #3: Dialog Nhật ký thay đổi và Lịch sử phiên bản dự toán ── */}
      <Dialog
        open={historyDialogOpen}
        onOpenChange={(open) => setHistoryDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileClock className="w-5 h-5 text-primary" />
              Nhật ký thay đổi & Lịch sử phiên bản dự toán
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 max-h-[460px] overflow-y-auto">
            {versions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Chưa có phiên bản dự toán nào được ghi nhận cho dự án này.
              </div>
            ) : (
              versions.map((ver, idx) => {
                const prevVer = versions[idx + 1];
                const currTotal = Number(ver.total_amount || 0);
                const prevTotal = prevVer ? Number(prevVer.total_amount || 0) : null;
                const diff = prevTotal !== null ? currTotal - prevTotal : null;

                return (
                  <div
                    key={ver.id}
                    className="p-3.5 rounded-lg border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="default" className="font-mono text-xs">
                          Phiên bản v{ver.version_number}
                        </Badge>
                        {idx === 0 && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            Mới nhất
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(ver.created_at).toLocaleString("vi-VN")}
                        </span>
                        <span className="text-xs font-medium text-foreground">
                          • Người thực hiện: {ver.created_by_name || "Hệ thống"}
                        </span>
                      </div>

                      <p className="text-sm text-foreground font-medium">
                        {ver.description || "Khởi tạo / Cập nhật phiên bản dự toán"}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Tổng dự toán:{" "}
                          <strong className="font-mono text-foreground">
                            {formatMoneyVND(ver.total_amount || "0.00")}
                          </strong>
                        </span>
                        <span>• {ver.items_count || 0} hạng mục lá</span>
                        {diff !== null && (
                          <span
                            className={`font-mono font-medium ${
                              diff > 0
                                ? "text-amber-600"
                                : diff < 0
                                ? "text-emerald-600"
                                : "text-muted-foreground"
                            }`}
                          >
                            ({formatSignedDeltaVND(diff)} so với v{prevVer.version_number})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedVersion(
                            idx === 0 ? "latest" : String(ver.version_number)
                          );
                          setHistoryDialogOpen(false);
                        }}
                        className="h-8 text-xs"
                      >
                        Xem bản này
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setHistoryDialogOpen(false)}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
