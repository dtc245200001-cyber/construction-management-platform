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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState("latest");
  const [collapsedNodes, setCollapsedNodes] = useState({});

  // Dialog nhập dự toán cho từng lá
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

  // Đổi phiên bản xem
  const handleVersionChange = (val) => {
    setSelectedVersion(val);
  };

  // Mở/thu một node trong cây
  const toggleCollapse = (id) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Xây dựng cây WBS từ danh sách phẳng
  const treeRoots = useMemo(() => {
    if (!data?.items || data.items.length === 0) return [];
    return buildTree(data.items);
  }, [data?.items]);

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

  const leafItems = (data?.items || []).filter((i) => i.is_leaf);
  const allocatedLeaves = leafItems.filter((i) => i.amount !== null && i.amount !== undefined);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* ── Tiêu đề & Chọn phiên bản ───────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-7 h-7 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Dự toán chi phí theo hạng mục
            </h1>
            <Badge variant="outline" className="ml-2 font-mono text-xs">
              S-46 / T-119
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Quản lý dự toán cho từng hạng mục lá và tự động cộng tổng lũy kế lên các hạng mục cha theo cây WBS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Dropdown xem phiên bản cũ / mới */}
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
      </div>

      {/* ── Cảnh báo khi dự án đã phát sinh thực chi ───────── */}
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

      {/* ── Thống kê tổng quan ─────────────────────────────── */}
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

      {/* ── Bảng cây dự toán ────────────────────────────────── */}
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
