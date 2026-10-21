import React, { useState, useEffect, useCallback, useMemo } from "react";
import api from "../lib/api";
import { buildTree } from "../utils/buildTree";
import {
  formatMoneyVND,
  formatInputDisplayVN,
  normalizeDecimalInput,
} from "../utils/decimal";
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
  BarChart3,
  ShieldCheck,
  TrendingUp,
  Filter,
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

export default function BudgetPage({ user }) {
  const projectId = localStorage.getItem("currentProjectId") || "1";

  // Tab: "entry" (S-46 Khai báo dự toán) | "summary" (S-48 Tổng hợp Thực chi & Cảnh báo)
  const [activeTab, setActiveTab] = useState("entry");

  // State cho Tab 1 (Khai báo dự toán)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState("latest");
  const [collapsedNodes, setCollapsedNodes] = useState({});

  // State cho Tab 2 (Tổng hợp Thực chi & Cảnh báo - T-122 / T-123)
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryThreshold, setSummaryThreshold] = useState("80");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "warning" | "resolved" | "normal"
  const [summaryCollapsedNodes, setSummaryCollapsedNodes] = useState({});

  // Dialog nhập dự toán cho từng lá (Tab 1)
  const [editingItem, setEditingItem] = useState(null);
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Dialog mô tả phiên bản khi lưu
  const [versionDescDialogOpen, setVersionDescDialogOpen] = useState(false);
  const [versionDescription, setVersionDescription] = useState("");

  // Tải danh sách phiên bản
  const fetchVersions = useCallback(async () => {
    try {
      const res = await api.get(`/projects/${projectId}/budgets`);
      setVersions(res.data?.versions || []);
    } catch (_err) {
      // Bỏ qua lỗi phụ khi tải version
    }
  }, [projectId]);

  // Tải dữ liệu cây dự toán
  const fetchBudgetTree = useCallback(async (versionNum = null) => {
    setLoading(true);
    setError(null);
    try {
      const url = versionNum && versionNum !== "latest"
        ? `/projects/${projectId}/budgets/tree?version=${versionNum}`
        : `/projects/${projectId}/budgets/tree`;

      const res = await api.get(url);
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || "Không thể tải dữ liệu dự toán dự án");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchVersions();
    fetchBudgetTree(selectedVersion === "latest" ? null : selectedVersion);
  }, [fetchVersions, fetchBudgetTree, selectedVersion]);

  // Tải dữ liệu tổng hợp dự toán & thực chi (S-48 / T-122, T-123)
  const fetchBudgetSummary = useCallback(async (thresholdVal = summaryThreshold) => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await api.get(`/projects/${projectId}/budgets/summary?threshold=${thresholdVal}`);
      setSummaryData(res.data);
    } catch (err) {
      setSummaryError(err?.response?.data?.message || "Không thể tải báo cáo tổng hợp dự toán & thực chi");
    } finally {
      setSummaryLoading(false);
    }
  }, [projectId, summaryThreshold]);

  useEffect(() => {
    if (activeTab === "summary") {
      fetchBudgetSummary(summaryThreshold);
    }
  }, [activeTab, fetchBudgetSummary, summaryThreshold]);

  // Đổi phiên bản xem
  const handleVersionChange = (val) => {
    setSelectedVersion(val);
  };

  // Mở/thu một node trong cây (Tab 1)
  const toggleCollapse = (id) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Mở/thu một node trong cây (Tab 2)
  const toggleSummaryCollapse = (id) => {
    setSummaryCollapsedNodes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Xây dựng cây WBS từ danh sách phẳng (Tab 1)
  const treeRoots = useMemo(() => {
    if (!data?.items || data.items.length === 0) return [];
    return buildTree(data.items);
  }, [data?.items]);

  // Xây dựng cây WBS từ danh sách phẳng (Tab 2)
  const summaryTreeRoots = useMemo(() => {
    if (!summaryData?.items || summaryData.items.length === 0) return [];
    return buildTree(summaryData.items);
  }, [summaryData?.items]);

  // Mở dialog sửa một hạng mục lá
  const handleOpenEdit = (item) => {
    if (!item.is_leaf) {
      toast.warning("Hạng mục cha không cho phép nhập dự toán trực tiếp. Hệ thống sẽ tự động cộng tổng từ các hạng mục lá con.");
      return;
    }
    setEditingItem(item);
    setFormAmount(item.amount ? formatInputDisplayVN(item.amount) : "");
    setFormNote(item.note || "");
    setFormError("");
  };

  // Lưu dự toán cho hạng mục lá
  const handleSaveItemBudget = async () => {
    if (!editingItem) return;

    // Chuẩn hoá số tiền
    const norm = normalizeDecimalInput(formAmount, {
      maxIntDigits: 14,
      maxScale: 2,
      fieldName: "Số tiền dự toán",
    });

    if (!norm.ok && formAmount.trim() !== "") {
      setFormError(norm.error);
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      // Chuẩn bị payload: gửi toàn bộ các lá đã có dự toán + hạng mục vừa sửa
      const currentItems = (data?.items || [])
        .filter((i) => i.is_leaf && i.id !== editingItem.id && i.amount !== null)
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
        description: data?.has_actual_costs
          ? `Điều chỉnh dự toán hạng mục "${editingItem.name}" (sinh phiên bản mới do đã có thực chi)`
          : `Cập nhật dự toán hạng mục "${editingItem.name}"`,
        items: currentItems,
      });

      toast.success(res.data?.message || "Đã lưu dự toán thành công");
      setEditingItem(null);
      setSelectedVersion("latest");
      await fetchVersions();
      await fetchBudgetTree(null);
    } catch (err) {
      const msg = err?.response?.data?.message || "Không thể lưu dự toán, vui lòng thử lại";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Đệ quy render các hàng trong cây WBS
  const renderTreeRows = (nodes, level = 0) => {
    const rows = [];

    nodes.forEach((node) => {
      const isLeaf = node.is_leaf;
      const isCollapsed = collapsedNodes[node.id];

      rows.push(
        <tr
          key={node.id}
          className={`border-b transition-colors hover:bg-muted/40 ${
            !isLeaf ? "bg-muted/15 font-semibold text-foreground" : "text-muted-foreground"
          }`}
        >
          {/* Cột Mã */}
          <td className="p-3 text-sm font-mono whitespace-nowrap text-muted-foreground">
            {node.code || "—"}
          </td>

          {/* Cột Hạng mục (thụt lề theo cấp) */}
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
                  title={isCollapsed ? "Mở rộng" : "Thu gọn"}
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

              <span className={`break-words ${!isLeaf ? "font-bold text-foreground" : "text-foreground font-normal"}`}>
                {node.name}
              </span>

              {!isLeaf && (
                <span className="text-[11px] text-muted-foreground font-normal ml-2 italic">
                  (Tổng cộng từ cây con)
                </span>
              )}
            </div>
          </td>

          {/* Cột Phân loại */}
          <td className="p-3 text-sm text-center">
            {isLeaf ? (
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 border-emerald-200">
                Hạng mục lá
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Hạng mục cha
              </Badge>
            )}
          </td>

          {/* Cột Dự toán lá (VND) */}
          <td className="p-3 text-sm text-right font-mono tabular-nums">
            {isLeaf ? (
              node.amount !== null && node.amount !== undefined ? (
                <span className="font-medium text-foreground">{formatMoneyVND(node.amount)}</span>
              ) : (
                <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-200">
                  Chưa nhập
                </span>
              )
            ) : (
              <span className="text-muted-foreground italic text-xs">Không nhập ở cha</span>
            )}
          </td>

          {/* Cột Tổng cộng cây (VND) */}
          <td className="p-3 text-sm text-right font-mono tabular-nums font-semibold text-primary">
            {formatMoneyVND(node.total_budget || "0.00")}
          </td>

          {/* Cột Ghi chú */}
          <td className="p-3 text-sm text-muted-foreground max-w-[200px] truncate">
            {node.note || "—"}
          </td>

          {/* Cột Thao tác */}
          <td className="p-3 text-sm text-center whitespace-nowrap">
            {isLeaf ? (
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
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </td>
        </tr>
      );

      // Đệ quy render các con nếu node chưa thu gọn
      if (!isCollapsed && node.children && node.children.length > 0) {
        rows.push(...renderTreeRows(node.children, level + 1));
      }
    });

    return rows;
  };

  // Đệ quy render các hàng trong cây WBS tổng hợp (Tab 2: S-48 / T-122, T-123)
  const renderSummaryTreeRows = (nodes, level = 0) => {
    const rows = [];

    nodes.forEach((node) => {
      const isLeaf = node.is_leaf;
      const isCollapsed = summaryCollapsedNodes[node.id];

      // Lọc trạng thái nếu người dùng chọn
      const matchesFilter =
        statusFilter === "all" ||
        (statusFilter === "warning" && (node.has_alert || node.alert_status === "WARNING")) ||
        (statusFilter === "resolved" && node.alert_status === "RESOLVED") ||
        (statusFilter === "normal" && node.alert_status === "NORMAL") ||
        (statusFilter === "nobudget" && node.alert_status === "NO_BUDGET");

      const utilNum = node.utilization_percent ? parseFloat(node.utilization_percent) : null;
      const threshNum = parseFloat(summaryThreshold);
      const isOverThreshold = utilNum !== null && utilNum > threshNum;

      if (matchesFilter) {
        rows.push(
          <tr
            key={`summary-${node.id}`}
            className={`border-b transition-colors hover:bg-muted/40 ${
              !isLeaf ? "bg-muted/15 font-semibold text-foreground" : "text-muted-foreground"
            }`}
          >
            {/* Cột Mã */}
            <td className="p-3 text-sm font-mono whitespace-nowrap text-muted-foreground">
              {node.code || "—"}
            </td>

            {/* Cột Hạng mục (thụt lề theo cấp) */}
            <td className="p-3 text-sm">
              <div
                className="flex items-center gap-1.5"
                style={{ paddingLeft: `${level * 24}px` }}
              >
                {!isLeaf ? (
                  <button
                    type="button"
                    onClick={() => toggleSummaryCollapse(node.id)}
                    className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title={isCollapsed ? "Mở rộng" : "Thu gọn"}
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

                <span className={`break-words ${!isLeaf ? "font-bold text-foreground" : "text-foreground font-normal"}`}>
                  {node.name}
                </span>

                {!isLeaf && (
                  <span className="text-[11px] text-muted-foreground font-normal ml-2 italic">
                    (Tổng cộng từ cây con)
                  </span>
                )}
              </div>
            </td>

            {/* Cột Phân loại */}
            <td className="p-3 text-sm text-center">
              {isLeaf ? (
                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 border-emerald-200">
                  Hạng mục lá
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Hạng mục cha
                </Badge>
              )}
            </td>

            {/* Cột Khối lượng HĐ & Nghiệm thu */}
            <td className="p-3 text-sm text-center font-mono">
              {isLeaf ? (
                node.contract_quantity ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs">
                      {node.approved_quantity ? Number(node.approved_quantity).toLocaleString("vi-VN") : "0"} / {Number(node.contract_quantity).toLocaleString("vi-VN")}
                    </span>
                    {node.acceptance_percent !== null && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                        NT: {node.acceptance_percent}%
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Không có HĐ</span>
                )
              ) : (
                <span className="text-xs text-muted-foreground italic">—</span>
              )}
            </td>

            {/* Cột Dự toán (VND) */}
            <td className="p-3 text-sm text-right font-mono tabular-nums">
              {node.has_budget || Number(node.total_budget) > 0 ? (
                <span className="font-semibold text-foreground">
                  {formatMoneyVND(node.total_budget || "0.00")}
                </span>
              ) : (
                <span className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-200">
                  Chưa có dự toán
                </span>
              )}
            </td>

            {/* Cột Thực chi (VND) */}
            <td className="p-3 text-sm text-right font-mono tabular-nums font-semibold text-primary">
              {formatMoneyVND(node.total_actual_cost || "0.00")}
            </td>

            {/* Cột Tỷ lệ sử dụng (%) */}
            <td className="p-3 text-sm text-center">
              {node.utilization_percent !== null ? (
                <div className="w-full max-w-[130px] mx-auto space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono font-medium">
                    <span className={isOverThreshold ? "text-destructive font-bold" : "text-foreground"}>
                      {node.utilization_percent}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOverThreshold ? "bg-destructive" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(utilNum || 0, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">—</span>
              )}
            </td>

            {/* Cột Trạng thái & Cảnh báo */}
            <td className="p-3 text-sm text-center">
              {node.alert_status === "WARNING" ? (
                <Badge variant="destructive" className="gap-1 text-xs py-0.5 px-2 font-medium" title={node.alert_message}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Cảnh báo vượt ngưỡng</span>
                  {node.alert_count > 0 && !isLeaf && (
                    <span className="ml-1 text-[10px]">({node.alert_count})</span>
                  )}
                </Badge>
              ) : node.alert_status === "RESOLVED" ? (
                <Badge variant="outline" className="gap-1 text-xs py-0.5 px-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 border-emerald-300" title={node.alert_message}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Đã hết cảnh báo</span>
                </Badge>
              ) : node.alert_status === "NORMAL" ? (
                <Badge variant="outline" className="gap-1 text-xs py-0.5 px-2 text-muted-foreground" title={node.alert_message}>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>An toàn</span>
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground italic">Chưa lập dự toán</span>
              )}
            </td>
          </tr>
        );
      }

      if (!isCollapsed && node.children && node.children.length > 0) {
        rows.push(...renderSummaryTreeRows(node.children, level + 1));
      }
    });

    return rows;
  };

  const leafItems = (data?.items || []).filter((i) => i.is_leaf);
  const allocatedLeaves = leafItems.filter((i) => i.amount !== null && i.amount !== undefined);

  // Thống kê Tab 2
  const summaryRootItems = (summaryData?.items || []).filter((i) => !i.parent_id);
  const summaryTotalBudget = summaryRootItems.reduce((acc, i) => acc + (parseFloat(i.total_budget) || 0), 0);
  const summaryTotalActual = summaryRootItems.reduce((acc, i) => acc + (parseFloat(i.total_actual_cost) || 0), 0);
  const summaryOverallUtilization = summaryTotalBudget > 0 ? ((summaryTotalActual / summaryTotalBudget) * 100).toFixed(2) : null;
  const summaryWarningCount = (summaryData?.items || []).filter((i) => i.is_leaf && i.has_alert).length;
  const summaryResolvedCount = (summaryData?.items || []).filter((i) => i.is_leaf && i.alert_status === "RESOLVED").length;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* ── Tiêu đề & Chuyển đổi tab ───────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Dự toán chi phí theo hạng mục
            </h1>
            <Badge variant="outline" className="ml-2 font-mono text-xs">
              {activeTab === "entry" ? "S-46 / T-119" : "S-48 / T-122, T-123"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTab === "entry"
              ? "Quản lý dự toán cho từng hạng mục lá và tự động cộng tổng lũy kế lên các hạng mục cha theo cây WBS."
              : "Tổng hợp dự toán hiện hành, đối chiếu chi phí thực tế theo cây WBS và phát hiện cảnh báo vượt ngưỡng chi phí so với tiến độ nghiệm thu."}
          </p>
        </div>

        {/* Nút chuyển Tab */}
        <div className="flex items-center gap-2 bg-muted/60 p-1 rounded-lg border">
          <Button
            variant={activeTab === "entry" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("entry")}
            className="h-8 gap-1.5"
          >
            <FolderTree className="w-4 h-4" />
            <span>Khai báo dự toán (S-46)</span>
          </Button>
          <Button
            variant={activeTab === "summary" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("summary")}
            className="h-8 gap-1.5"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Tổng hợp Thực chi & Cảnh báo</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
              S-48
            </Badge>
          </Button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: KHAI BÁO DỰ TOÁN (S-46 / T-119)                   */}
      {/* ======================================================== */}
      {activeTab === "entry" && (
        <>
          {/* Thanh công cụ chọn version & làm mới */}
          <div className="flex items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedVersion} onValueChange={handleVersionChange}>
                <SelectTrigger className="w-[180px] h-9">
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
              variant="outline"
              size="sm"
              onClick={() => {
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

          {/* Cảnh báo khi dự án đã phát sinh thực chi */}
          {data?.has_actual_costs && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/80 dark:bg-amber-950/20 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <p className="font-semibold">
                  Dự án đã phát sinh chi phí thực tế (Actual Costs - S-47)
                </p>
                <p className="mt-0.5 text-xs">
                  Theo quy tắc nghiệp vụ, mọi thay đổi dự toán từ thời điểm này sẽ được bảo lưu và <strong>tự động tạo thành một phiên bản dự toán mới</strong> để không ghi đè làm mất lịch sử các mốc ban đầu.
                </p>
              </div>
            </div>
          )}

          {/* Thống kê tổng quan Tab 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Tổng dự toán dự án</span>
                <Coins className="w-4 h-4 text-primary" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-primary">
                {formatMoneyVND(data?.project_total || "0.00")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Cộng dồn từ toàn bộ các hạng mục lá</p>
            </div>

            <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Phiên bản hiện tại</span>
                <Layers className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-foreground">
                {data?.version ? `v${data.version.version_number}` : "Chưa lập"}
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {data?.version?.description || "Chưa có mô tả"}
              </p>
            </div>

            <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Tiến độ phân bổ</span>
                <FolderTree className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-foreground">
                {allocatedLeaves.length} / {leafItems.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">hạng mục lá đã được định mức</p>
            </div>

            <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Thực chi đối chiếu</span>
                <CheckCircle2 className={`w-4 h-4 ${data?.has_actual_costs ? "text-amber-600" : "text-muted-foreground"}`} />
              </div>
              <div className="mt-2 text-base font-semibold text-foreground">
                {data?.has_actual_costs ? "Đã phát sinh thực chi" : "Chưa có thực chi"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data?.has_actual_costs ? "Khóa ghi đè lịch sử" : "Có thể cập nhật trực tiếp"}
              </p>
            </div>
          </div>

          {/* Bảng cây dự toán Tab 1 */}
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Cây cơ cấu công việc & dự toán chi phí</span>
              </div>
              <span className="text-xs text-muted-foreground">
                * Nhấp vào nút "Nhập dự toán" ở hạng mục lá để khai báo chi phí
              </span>
            </div>

            {loading ? (
              <div className="p-8 space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-destructive">
                {error}
              </div>
            ) : treeRoots.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Dự án chưa có hạng mục công việc (WBS). Vui lòng thêm hạng mục tại màn hình WBS trước.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                      <th className="p-3 w-28">Mã</th>
                      <th className="p-3 min-w-[280px]">Hạng mục công việc (WBS)</th>
                      <th className="p-3 w-32 text-center">Phân loại</th>
                      <th className="p-3 w-44 text-right">Dự toán lá (VND)</th>
                      <th className="p-3 w-48 text-right">Tổng cộng dồn (VND)</th>
                      <th className="p-3 min-w-[140px]">Ghi chú</th>
                      <th className="p-3 w-36 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>{renderTreeRows(treeRoots)}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ======================================================== */}
      {/* TAB 2: TỔNG HỢP DỰ TOÁN, THỰC CHI & CẢNH BÁO (S-48 / T-122, T-123) */}
      {/* ======================================================== */}
      {activeTab === "summary" && (
        <>
          {/* Thanh công cụ cấu hình ngưỡng & bộ lọc trạng thái */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30 p-3 rounded-xl border">
            <div className="flex flex-wrap items-center gap-3">
              {/* Chọn ngưỡng cảnh báo */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Ngưỡng cảnh báo:</span>
                <Select
                  value={summaryThreshold}
                  onValueChange={(val) => {
                    setSummaryThreshold(val);
                    fetchBudgetSummary(val);
                  }}
                >
                  <SelectTrigger className="w-[110px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="70">70%</SelectItem>
                    <SelectItem value="80">80% (Chuẩn)</SelectItem>
                    <SelectItem value="85">85%</SelectItem>
                    <SelectItem value="90">90%</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bộ lọc trạng thái */}
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    <SelectItem value="warning">Chỉ mục Cảnh báo</SelectItem>
                    <SelectItem value="resolved">Đã hết cảnh báo</SelectItem>
                    <SelectItem value="normal">Mục an toàn</SelectItem>
                    <SelectItem value="nobudget">Chưa có dự toán</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchBudgetSummary(summaryThreshold)}
              className="h-8 gap-1.5"
              title="Làm mới dữ liệu tổng hợp"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Làm mới</span>
            </Button>
          </div>

          {/* Cảnh báo tổng quan nếu có mục vi phạm */}
          {summaryWarningCount > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm text-destructive">
                <p className="font-semibold">
                  Phát hiện {summaryWarningCount} hạng mục vượt ngưỡng chi phí thực tế ({summaryThreshold}%) so với tiến độ nghiệm thu!
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Các hạng mục này có chi phí thực chi vượt quá {summaryThreshold}% dự toán trong khi tỷ lệ khối lượng nghiệm thu chưa đạt {summaryThreshold}%. Vui lòng kiểm tra tiến độ hiện trường và đối chiếu hồ sơ nghiệm thu.
                </p>
              </div>
            </div>
          )}

          {/* Thống kê 4 thẻ Tab 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Tổng dự toán</span>
                <Coins className="w-4 h-4 text-primary" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-primary">
                {formatMoneyVND(summaryTotalBudget)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Cộng dồn toàn bộ cây WBS</p>
            </div>

            <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Tổng thực chi</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-foreground">
                {formatMoneyVND(summaryTotalActual)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Chi phí thực tế đã ghi nhận</p>
            </div>

            <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Tỷ lệ sử dụng</span>
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-foreground">
                {summaryOverallUtilization ? `${summaryOverallUtilization}%` : "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summaryTotalBudget > 0 ? "So với tổng ngân sách dự án" : "Chưa có dự toán"}
              </p>
            </div>

            <div className="p-4 rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">Cảnh báo chi phí</span>
                <AlertTriangle className={`w-4 h-4 ${summaryWarningCount > 0 ? "text-destructive" : "text-emerald-600"}`} />
              </div>
              <div className={`mt-2 text-2xl font-bold font-mono tracking-tight ${summaryWarningCount > 0 ? "text-destructive" : "text-emerald-600"}`}>
                {summaryWarningCount} <span className="text-xs font-normal text-muted-foreground">hạng mục</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {summaryResolvedCount > 0 ? `${summaryResolvedCount} hạng mục đã hết cảnh báo` : "Ngưỡng giám sát: " + summaryThreshold + "%"}
              </p>
            </div>
          </div>

          {/* Bảng cây tổng hợp dự toán, thực chi & cảnh báo */}
          <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Bảng tổng hợp dự toán, chi phí thực tế & cảnh báo vượt ngưỡng</span>
              </div>
              <span className="text-xs text-muted-foreground">
                * Tỷ lệ sử dụng và trạng thái cảnh báo được tổng hợp theo thời gian thực
              </span>
            </div>

            {summaryLoading ? (
              <div className="p-8 space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : summaryError ? (
              <div className="p-8 text-center text-sm text-destructive">
                {summaryError}
              </div>
            ) : summaryTreeRoots.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                Chưa có dữ liệu tổng hợp dự toán & thực chi.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                      <th className="p-3 w-28">Mã</th>
                      <th className="p-3 min-w-[260px]">Hạng mục công việc (WBS)</th>
                      <th className="p-3 w-28 text-center">Phân loại</th>
                      <th className="p-3 w-40 text-center">HĐ & Nghiệm thu</th>
                      <th className="p-3 w-44 text-right">Dự toán (VND)</th>
                      <th className="p-3 w-44 text-right">Thực chi (VND)</th>
                      <th className="p-3 w-36 text-center">Tỷ lệ sử dụng</th>
                      <th className="p-3 w-48 text-center">Trạng thái & Cảnh báo</th>
                    </tr>
                  </thead>
                  <tbody>{renderSummaryTreeRows(summaryTreeRoots)}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Dialog nhập dự toán cho hạng mục lá ─────────────── */}
      <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Pencil className="w-5 h-5 text-primary" />
              Nhập dự toán cho hạng mục lá
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <span className="text-xs text-muted-foreground block font-mono">Hạng mục:</span>
              <span className="font-semibold text-foreground">
                [{editingItem?.code || "—"}] {editingItem?.name}
              </span>
            </div>

            {data?.has_actual_costs && (
              <div className="flex items-center gap-2 p-2.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-xs text-amber-800 dark:text-amber-300">
                <Info className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Dự án đã có thực chi. Thay đổi này sẽ được lưu thành <strong>phiên bản mới v{(data?.version?.version_number || 1) + 1}</strong>.
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
              <Label htmlFor="budget-note" className="text-sm font-medium">
                Ghi chú dự toán
              </Label>
              <Input
                id="budget-note"
                type="text"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Ghi chú chi tiết (nếu có)"
              />
            </div>

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
    </div>
  );
}
