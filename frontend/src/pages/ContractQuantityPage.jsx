import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { can } from "../config/permissions";
import { buildTree } from "../utils/buildTree";
import {
  formatMoneyVND,
  formatQuantityVN,
  formatInputDisplayVN,
  normalizeDecimalInput,
  multiplyAndRoundVND,
} from "../utils/decimal";
import {
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  AlertCircle,
  RefreshCw,
  FolderTree,
  Coins,
  ChevronsUpDown,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

// Danh sách vai trò có quyền chỉnh sửa khối lượng hợp đồng

/**
 * Kiểm tra xem một node hoặc bất kỳ node con cháu nào trong nhánh có khai báo khối lượng hay không.
 */
function branchHasContract(node) {
  if (node.quantity !== null && node.quantity !== undefined) {
    return true;
  }
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      if (branchHasContract(child)) {
        return true;
      }
    }
  }
  return false;
}

export default function ContractQuantityPage({ user: _user }) {
  const projectId = localStorage.getItem("currentProjectId") || 1;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [data, setData] = useState(null);
  const [projectRole, setProjectRole] = useState(null);

  // Trạng thái thu gọn/mở rộng cây
  const [collapsedNodes, setCollapsedNodes] = useState({});

  // Dialog nhập/sửa
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formQuantity, setFormQuantity] = useState("");
  const [formUnit, setFormUnit] = useState("");
  const [formUnitPrice, setFormUnitPrice] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [serverWarning, setServerWarning] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Alert Dialog xoá
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Xác định quyền sửa: Chỉ khi đã tải xong vai trò và thuộc chu_dau_tu hoặc ban_quan_ly
  const canEdit = can(projectRole, "contract_quantity.edit");

  // Lấy vai trò thành viên trong dự án
  const fetchMembership = useCallback(async () => {
    try {
      const res = await api.get(`/projects/${projectId}`);
      setProjectRole(res.data?.membership || null);
    } catch (_err) {
      setProjectRole(null);
    }
  }, [projectId]);

  // Lấy dữ liệu khối lượng hợp đồng
  const fetchContractQuantities = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const res = await api.get(`/projects/${projectId}/contract-quantities`);
      setData(res.data);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) {
        setForbidden(true);
      } else {
        setError(err?.response?.data?.message || "Không thể tải khối lượng hợp đồng");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMembership();
    fetchContractQuantities();
  }, [fetchMembership, fetchContractQuantities]);

  // Xây dựng cây hạng mục
  const treeRoots = useMemo(() => {
    if (!data?.items || data.items.length === 0) return [];
    return buildTree(data.items);
  }, [data?.items]);

  // Mở/thu một node
  const toggleCollapse = (id) => {
    setCollapsedNodes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Mở rộng hoặc thu gọn tất cả
  const toggleAllCollapse = () => {
    const hasAnyCollapsed = Object.values(collapsedNodes).some(Boolean);
    if (hasAnyCollapsed) {
      setCollapsedNodes({});
    } else {
      const allMap = {};
      if (data?.items) {
        data.items.forEach((it) => {
          if (!it.is_leaf) {
            allMap[it.id] = true;
          }
        });
      }
      setCollapsedNodes(allMap);
    }
  };

  // Mở form chỉnh sửa
  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setFormQuantity(formatInputDisplayVN(item.quantity));
    // A1: Khai mới (chưa có giá trị): ô đơn vị trống "". Sửa hạng mục đã có giá trị: điền sẵn đơn vị hiện tại.
    setFormUnit(item.unit || "");
    setFormUnitPrice(formatInputDisplayVN(item.unit_price));
    setFormErrors({});
    setServerWarning("");
    setDialogOpen(true);
  };

  // A3: Giá trị dự kiến chỉ tính khi cả khối lượng và đơn giá đều hợp lệ; còn lại trả về null (hiển thị "—")
  const estimatedContractValue = useMemo(() => {
    if (!formQuantity || !formUnitPrice) return null;
    const normQ = normalizeDecimalInput(formQuantity, { maxIntDigits: 11, maxScale: 3 });
    const normP = normalizeDecimalInput(formUnitPrice, { maxIntDigits: 14, maxScale: 2 });
    if (!normQ.ok || !normP.ok) return null;
    return multiplyAndRoundVND(normQ.value, normP.value);
  }, [formQuantity, formUnitPrice]);

  // Lưu form cập nhật
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setServerWarning("");
    const errors = {};

    // Validate Khối lượng
    const normQ = normalizeDecimalInput(formQuantity, {
      maxIntDigits: 11,
      maxScale: 3,
      fieldName: "Khối lượng",
    });
    if (!normQ.ok) {
      errors.quantity = normQ.error;
    }

    // A1: Validate Đơn vị: để trống thì báo lỗi "Vui lòng chọn đơn vị"
    if (!formUnit || !formUnit.trim()) {
      errors.unit = "Vui lòng chọn đơn vị";
    }

    // Validate Đơn giá
    const normP = normalizeDecimalInput(formUnitPrice, {
      maxIntDigits: 14,
      maxScale: 2,
      fieldName: "Đơn giá",
    });
    if (!normP.ok) {
      errors.unit_price = normP.error;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    setFormErrors({});

    try {
      await api.put(
        `/projects/${projectId}/work-items/${editingItem.id}/contract-quantity`,
        {
          quantity: normQ.value,
          unit: formUnit.trim(),
          unit_price: normP.value,
        }
      );

      toast.success("Đã lưu khối lượng hợp đồng");
      setDialogOpen(false);
      // Gọi lại GET để lấy tổng hợp đồng mới từ server
      fetchContractQuantities();
    } catch (err) {
      const status = err?.response?.status;
      const respData = err?.response?.data;

      if (status === 400 && respData?.errors) {
        setFormErrors(respData.errors);
      } else if (status === 422) {
        setServerWarning(
          respData?.message ||
            "Hạng mục cha không khai khối lượng hợp đồng trực tiếp; hãy khai ở các hạng mục lá bên dưới."
        );
        fetchContractQuantities();
      } else if (status === 403) {
        toast.error("Bạn không có quyền thực hiện thao tác này");
        fetchMembership();
      } else {
        toast.error(respData?.message || "Lỗi khi lưu khối lượng hợp đồng, vui lòng thử lại");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Mở hộp thoại xác nhận xoá
  const handleOpenDelete = (item) => {
    setDeletingItem(item);
    setDeleteDialogOpen(true);
  };

  // Thực hiện xoá khối lượng
  const handleConfirmDelete = async () => {
    if (!deletingItem || deleting) return;

    setDeleting(true);
    try {
      await api.delete(
        `/projects/${projectId}/work-items/${deletingItem.id}/contract-quantity`
      );
      toast.success("Đã xoá khối lượng hợp đồng");
      setDeleteDialogOpen(false);
      fetchContractQuantities();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Không thể xoá khối lượng hợp đồng");
    } finally {
      setDeleting(false);
      setDeletingItem(null);
    }
  };

  // Đệ quy duyệt cây để render từng hàng
  const renderTreeRows = (nodes, level = 0) => {
    const rows = [];

    nodes.forEach((node) => {
      const isLeaf = node.is_leaf;
      const isCollapsed = collapsedNodes[node.id];
      const hasContractInBranch = branchHasContract(node);
      const canViewPrices = data?.can_view_prices;

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
                  aria-expanded={!isCollapsed}
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

              <span className={`break-words ${!isLeaf ? "font-bold text-foreground" : "text-foreground font-normal"}`}>
                {node.name}
              </span>

              {!isLeaf && (
                <span className="text-[11px] text-muted-foreground font-normal ml-2 italic">
                  (Tự cộng từ các hạng mục lá bên dưới)
                </span>
              )}
            </div>
          </td>

          {/* Cột Khối lượng */}
          <td className="p-3 text-sm text-right font-mono tabular-nums">
            {isLeaf ? (
              node.quantity !== null && node.quantity !== undefined ? (
                formatQuantityVN(node.quantity)
              ) : (
                <Badge variant="outline" className="text-xs font-normal text-amber-600 bg-amber-50 dark:bg-amber-950/30">
                  Chưa khai
                </Badge>
              )
            ) : (
              "—"
            )}
          </td>

          {/* Cột Đơn vị */}
          <td className="p-3 text-sm text-center">
            {isLeaf ? node.unit || "—" : "—"}
          </td>

          {/* Cột Đơn giá (chỉ khi can_view_prices là true) */}
          {canViewPrices && (
            <td className="p-3 text-sm text-right font-mono tabular-nums">
              {isLeaf ? (
                node.unit_price !== null && node.unit_price !== undefined ? (
                  formatMoneyVND(node.unit_price)
                ) : (
                  "—"
                )
              ) : (
                "—"
              )}
            </td>
          )}

          {/* Cột Giá trị (contract_total) */}
          {canViewPrices && (
            <td
              className={`p-3 text-sm text-right font-mono tabular-nums ${
                !isLeaf ? "font-bold text-foreground" : "text-foreground"
              }`}
            >
              {hasContractInBranch ? formatMoneyVND(node.contract_total) : "—"}
            </td>
          )}

          {/* Cột Thao tác */}
          {canEdit && (
            <td className="p-3 text-sm text-right whitespace-nowrap">
              {isLeaf && (
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenEdit(node)}
                    className="h-10 px-3 cursor-pointer text-xs flex items-center gap-1"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Khai/Sửa
                  </Button>

                  {node.quantity !== null && node.quantity !== undefined && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenDelete(node)}
                      className="h-10 px-2 text-destructive hover:bg-destructive/10 cursor-pointer text-xs"
                      title="Xoá khối lượng hợp đồng"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </td>
          )}
        </tr>
      );

      // Render các node con nếu không bị thu gọn
      if (!isCollapsed && node.children && node.children.length > 0) {
        rows.push(...renderTreeRows(node.children, level + 1));
      }
    });

    return rows;
  };



  // 1. Trạng thái Đang tải (Skeleton)
  if (loading && !data) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-36" />
        </div>
        <Skeleton className="h-96 w-full rounded-md" />
      </div>
    );
  }

  // 2. Trạng thái 403 Forbidden (Không có quyền)
  if (forbidden) {
    return (
      <div className="p-6 sm:p-8 max-w-3xl mx-auto text-center space-y-4 my-12">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold">Truy cập bị từ chối</h2>
        <p className="text-muted-foreground text-sm">
          Bạn không có quyền xem khối lượng hợp đồng của dự án này. Vui lòng liên hệ ban quản lý nếu bạn cần quyền truy cập.
        </p>
      </div>
    );
  }

  // 3. Trạng thái Lỗi mạng hoặc lỗi máy chủ
  if (error) {
    return (
      <div className="p-6 sm:p-8 max-w-xl mx-auto text-center space-y-4 my-12 border rounded-lg bg-card shadow-sm">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
        <h3 className="text-lg font-semibold">Đã xảy ra lỗi tải dữ liệu</h3>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={fetchContractQuantities} className="h-10 px-4 cursor-pointer gap-2">
          <RefreshCw className="w-4 h-4" />
          Thử lại
        </Button>
      </div>
    );
  }

  const items = data?.items || [];
  const canViewPrices = data?.can_view_prices;

  return (
    <div className="p-3.5 sm:p-6 pb-28 md:pb-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header trang */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-2 border-b">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Coins className="w-5 sm:w-6 h-5 sm:h-6 text-primary" />
            Khối lượng và đơn giá hợp đồng
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Quản lý khối lượng, đơn giá hợp đồng cho các hạng mục lá. Hạng mục cha tự động cộng dồn.
          </p>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllCollapse}
              className="h-9 sm:h-10 px-3 cursor-pointer text-xs flex items-center gap-1.5"
            >
              <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />
              Mở rộng / Thu gọn
            </Button>
          </div>
        )}
      </div>

      {/* Trạng thái rỗng: Dự án chưa có hạng mục */}
      {items.length === 0 ? (
        <div className="p-8 sm:p-12 text-center border rounded-lg bg-card space-y-4">
          <FolderTree className="w-12 h-12 text-muted-foreground mx-auto stroke-1" />
          <h3 className="text-base font-semibold">Dự án chưa có hạng mục công việc nào</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Hãy bắt đầu tạo cơ cấu phân chia công việc (WBS) cho dự án trước khi khai báo khối lượng hợp đồng.
          </p>
          <Button asChild className="h-10 px-4 mt-2">
            <Link to="/wbs">Chuyển sang trang WBS</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Bảng hiển thị khối lượng cây */}
          <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b bg-muted/60 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="p-3 w-28">Mã hạng mục</th>
                    <th className="p-3 min-w-[280px]">Hạng mục</th>
                    <th className="p-3 text-right w-36">Khối lượng</th>
                    <th className="p-3 text-center w-28">Đơn vị</th>
                    {canViewPrices && <th className="p-3 text-right w-44">Đơn giá</th>}
                    {canViewPrices && <th className="p-3 text-right w-48">Thành tiền (₫)</th>}
                    {canEdit && <th className="p-3 text-right w-32">Thao tác</th>}
                  </tr>
                </thead>
                <tbody>{renderTreeRows(treeRoots)}</tbody>

                {/* Dòng tổng dự án cuối bảng */}
                {canViewPrices && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/40 font-bold">
                      <td colSpan={5} className="p-4 text-sm text-right text-foreground uppercase tracking-wider">
                        Tổng giá trị hợp đồng:
                      </td>
                      <td className="p-4 text-base text-right font-mono tabular-nums text-primary">
                        {formatMoneyVND(data?.project_total)}
                      </td>
                      {canEdit && <td />}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* Dialog Nhập/Sửa Khối Lượng Hợp Đồng */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Khai báo Khối lượng Hợp đồng
            </DialogTitle>
          </DialogHeader>

          {editingItem && (
            <form onSubmit={handleSubmitForm} className="space-y-4 py-2">
              <div className="p-3 rounded-md bg-muted/50 border text-sm space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-2">
                  {/* A2: ẩn dấu '–' khi hạng mục không có mã; chỉ hiện mã khi có */}
                  {editingItem.code ? (
                    <span className="font-mono text-xs text-muted-foreground">{editingItem.code}</span>
                  ) : null}
                  <span>{editingItem.name}</span>
                </div>
              </div>

              {/* Cảnh báo server (e.g. 422 hạng mục cha) */}
              {serverWarning && (
                <div className="p-3 text-sm rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{serverWarning}</span>
                </div>
              )}

              {/* Input Khối lượng */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="field-quantity" className="text-sm font-medium">
                    Khối lượng <span className="text-destructive">*</span>
                  </Label>
                  {/* A4: Khi đã chọn đơn vị, hiện tên đơn vị cạnh ô khối lượng */}
                  {formUnit && (
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                      Đơn vị: {formUnit}
                    </span>
                  )}
                </div>
                <Input
                  id="field-quantity"
                  inputMode="decimal"
                  placeholder="Ví dụ: 1234,567"
                  value={formQuantity}
                  onChange={(e) => {
                    setFormQuantity(e.target.value);
                    if (formErrors.quantity) {
                      setFormErrors((prev) => ({ ...prev, quantity: null }));
                    }
                  }}
                  aria-describedby={formErrors.quantity ? "error-quantity" : undefined}
                  className={`h-10 ${formErrors.quantity ? "border-destructive" : ""}`}
                  autoFocus
                />
                {formErrors.quantity && (
                  <p id="error-quantity" className="text-xs text-destructive">
                    {formErrors.quantity}
                  </p>
                )}
                {/* A5: Tăng cỡ chữ các dòng gợi ý lên 13-14px (text-sm hoặc text-[13px]) */}
                <p className="text-[13px] text-muted-foreground">
                  Tối đa 11 chữ số nguyên và 3 chữ số thập phân. Dùng dấu phẩy hoặc dấu chấm.
                </p>
              </div>

              {/* Select Đơn vị tính */}
              <div className="space-y-1.5">
                <Label htmlFor="field-unit" className="text-sm font-medium">
                  Đơn vị tính <span className="text-destructive">*</span>
                </Label>
                <Select value={formUnit} onValueChange={(val) => {
                  setFormUnit(val);
                  if (formErrors.unit) {
                    setFormErrors((prev) => ({ ...prev, unit: null }));
                  }
                }}>
                  <SelectTrigger id="field-unit" className="h-10 cursor-pointer">
                    {/* A1: Ô đơn vị trống, hiện chữ gợi ý 'Chọn đơn vị' */}
                    <SelectValue placeholder="Chọn đơn vị" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.units || []).map((u) => (
                      <SelectItem key={u} value={u} className="cursor-pointer">
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.unit && (
                  <p className="text-xs text-destructive">{formErrors.unit}</p>
                )}
              </div>

              {/* Input Đơn giá */}
              <div className="space-y-1.5">
                <Label htmlFor="field-unit-price" className="text-sm font-medium">
                  Đơn giá hợp đồng (₫) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="field-unit-price"
                  inputMode="decimal"
                  placeholder="Ví dụ: 89000,50"
                  value={formUnitPrice}
                  onChange={(e) => {
                    setFormUnitPrice(e.target.value);
                    if (formErrors.unit_price) {
                      setFormErrors((prev) => ({ ...prev, unit_price: null }));
                    }
                  }}
                  aria-describedby={formErrors.unit_price ? "error-unit-price" : undefined}
                  className={`h-10 ${formErrors.unit_price ? "border-destructive" : ""}`}
                />
                {formErrors.unit_price && (
                  <p id="error-unit-price" className="text-xs text-destructive">
                    {formErrors.unit_price}
                  </p>
                )}
                {/* A5: Tăng cỡ chữ các dòng gợi ý lên 13-14px */}
                <p className="text-[13px] text-muted-foreground">
                  Tối đa 14 chữ số nguyên và 2 chữ số thập phân.
                </p>
              </div>

              {/* A3 & B6: Thành tiền dự kiến: hiện "—" cho đến khi khối lượng và đơn giá đều hợp lệ */}
              <div className="p-3 bg-muted/30 border rounded-md space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Thành tiền dự kiến:</span>
                  <span className="font-mono font-bold text-base text-primary tabular-nums">
                    {estimatedContractValue !== null ? formatMoneyVND(estimatedContractValue) : "—"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground text-right italic">
                  = Khối lượng × Đơn giá
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
                  className="h-10 px-4 cursor-pointer"
                >
                  Huỷ
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="h-10 px-4 cursor-pointer min-w-24"
                >
                  {submitting ? "Đang lưu..." : "Lưu khối lượng"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog Xoá Khối Lượng */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Xoá khối lượng hợp đồng?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Bạn có chắc chắn muốn xoá toàn bộ khối lượng, đơn vị và đơn giá hợp đồng của hạng mục "
              <strong>{deletingItem?.name}</strong>"? Hành động này sẽ đưa các giá trị về trạng thái chưa khai.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="h-10 px-4 cursor-pointer">
              Huỷ
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="h-10 px-4 bg-destructive hover:bg-destructive/90 cursor-pointer"
            >
              {deleting ? "Đang xoá..." : "Xác nhận xoá"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
