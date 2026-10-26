import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useOutletContext } from "react-router-dom";
import PageHeroBanner from "../components/PageHeroBanner";
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
  FolderOpen,
  FileText,
  Search,
  X,
  TrendingUp,
  Layers,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { readSnapshot, writeSnapshot, isNetworkError, SNAPSHOT_TYPES } from "../services/offlineSnapshotCache";
import OfflineSnapshotBanner from "../components/OfflineSnapshotBanner";
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
  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const projectId = String(currentProject?.id || localStorage.getItem("currentProjectId") || "1");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [data, setData] = useState(null);
  const [projectRole, setProjectRole] = useState(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [cacheMiss, setCacheMiss] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false);
  const [search, setSearch] = useState("");
  const isReadOnly = isFromCache || !isOnline;
  const offlineMutationMessage = "Cần có mạng để thực hiện thao tác này";

  // Trạng thái thu gọn/mở rộng cây
  const [collapsedNodes, setCollapsedNodes] = useState({});

  // Dialog nhập/sửa
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formQuantity, setFormQuantity] = useState("");
  const [formUnit, setFormUnit] = useState("");
  const [formUnitPrice, setFormUnitPrice] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverWarning, setServerWarning] = useState("");

  // Dialog xoá
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Phân quyền sửa: dùng quyền fine-grained `contract_quantity.edit`
  const canEdit = useMemo(() => {
    return can(projectRole, "contract_quantity.edit");
  }, [projectRole]);

  const fetchSeqRef = React.useRef(0);

  // Lấy vai trò thành viên trong dự án
  const fetchMembership = useCallback(async () => {
    try {
      const res = await api.get(`/projects/${projectId}`);
      setProjectRole(res.data?.membership || null);
    } catch (_err) {
      setProjectRole(null);
    }
  }, [projectId]);

  // Tải dữ liệu cây khối lượng hợp đồng
  const fetchContractQuantities = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const isStale = () => seq !== fetchSeqRef.current;
    const myProjectId = projectId;
    setLoading(true);
    setError(null);
    setForbidden(false);

    // SWR: Nạp nhanh snapshot từ offline cache nếu có dữ liệu sẵn
    try {
      const localSnapshot = await readSnapshot(myProjectId, SNAPSHOT_TYPES.CONTRACT_QUANTITIES);
      if (!isStale() && localSnapshot?.payload !== undefined) {
        setData(localSnapshot.payload);
        setLoading(false);
      }
    } catch {
      /* ignore cache read error */
    }

    try {
      const res = await api.get(`/projects/${myProjectId}/contract-quantities`);
      if (isStale()) return;
      setData(res.data);
      setIsFromCache(false);
      setCachedAt(null);
      setIsOnline(true);
      await writeSnapshot(myProjectId, SNAPSHOT_TYPES.CONTRACT_QUANTITIES, res.data);
    } catch (err) {
      if (isStale()) return;
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else if (isNetworkError(err)) {
        setIsOnline(false);
        const snapshot = await readSnapshot(myProjectId, SNAPSHOT_TYPES.CONTRACT_QUANTITIES);
        if (isStale()) return;
        if (snapshot?.payload !== undefined) {
          setData(snapshot.payload);
          setIsFromCache(true);
          setCachedAt(snapshot.cachedAt);
        } else {
          setCacheMiss(true);
        }
      } else {
        setError(err?.response?.data?.message || "Không thể tải khối lượng hợp đồng");
      }
    } finally {
      if (!isStale()) {
        setLoading(false);
      }
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

  // Thống kê nhanh hạng mục lá
  const leafItems = useMemo(() => {
    return (data?.items || []).filter((i) => i.is_leaf);
  }, [data?.items]);

  const assignedLeaves = useMemo(() => {
    return leafItems.filter((i) => i.quantity !== null && i.quantity !== undefined);
  }, [leafItems]);

  const unassignedLeaves = useMemo(() => {
    return leafItems.filter((i) => i.quantity === null || i.quantity === undefined);
  }, [leafItems]);

  const assignedPercent = leafItems.length
    ? ((assignedLeaves.length * 100) / leafItems.length) | 0
    : 0;

  // Lọc cây theo từ khoá tìm kiếm
  const visibleTreeRoots = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return treeRoots;

    const filterNode = (n) => {
      const match =
        (n.name && n.name.toLowerCase().includes(q)) ||
        (n.code && n.code.toLowerCase().includes(q)) ||
        (n.unit && n.unit.toLowerCase().includes(q));
      if (match) return n;
      const kids = (n.children || []).map(filterNode).filter(Boolean);
      return kids.length ? { ...n, children: kids } : null;
    };

    return treeRoots.map(filterNode).filter(Boolean);
  }, [treeRoots, search]);

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
    if (isReadOnly) { toast.info(offlineMutationMessage); return; }
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
    if (isReadOnly) { toast.info(offlineMutationMessage); return; }
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
    if (isReadOnly) { toast.info(offlineMutationMessage); return; }
    setDeletingItem(item);
    setDeleteDialogOpen(true);
  };

  // Thực hiện xoá khối lượng
  const handleConfirmDelete = async () => {
    if (isReadOnly) { toast.info(offlineMutationMessage); return; }
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
          className={`border-b transition-colors ${
            !isLeaf
              ? "bg-slate-50/90 hover:bg-slate-100/80 font-semibold border-slate-200/90 text-[#0F1B3D]"
              : "bg-white hover:bg-blue-50/40 border-slate-100 text-slate-700"
          }`}
        >
          {/* Cột Mã */}
          <td className="p-3.5 text-sm font-mono whitespace-nowrap">
            {node.code ? (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border shadow-2xs ${
                  !isLeaf
                    ? "bg-blue-50/90 text-blue-700 border-blue-200"
                    : "bg-slate-100/90 text-slate-700 border-slate-200"
                }`}
              >
                {node.code}
              </span>
            ) : (
              <span className="text-slate-300 font-mono pl-1">—</span>
            )}
          </td>

          {/* Cột Hạng mục (thụt lề theo cấp) */}
          <td className="p-3.5 text-sm">
            <div
              className="flex items-center gap-2"
              style={{ paddingLeft: `${level * 24}px` }}
            >
              {!isLeaf ? (
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleCollapse(node.id)}
                  className="size-6 rounded-md hover:bg-slate-200/90 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title={isCollapsed ? "Mở rộng nhánh" : "Thu gọn nhánh"}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-blue-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-blue-600" />
                  )}
                </button>
              ) : (
                <span className="w-6 inline-block shrink-0" />
              )}

              {!isLeaf ? (
                <div className="size-6 rounded-md bg-blue-100/80 text-blue-700 flex items-center justify-center shrink-0">
                  <FolderOpen className="size-3.5" />
                </div>
              ) : (
                <div className="size-6 rounded-md bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                  <FileText className="size-3.5" />
                </div>
              )}

              <span className={`break-words ${!isLeaf ? "font-semibold text-slate-900 text-[14px]" : "text-slate-700 font-normal text-[13.5px]"}`}>
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
          <td className="p-3.5 text-sm text-right font-mono tabular-nums">
            {isLeaf ? (
              node.quantity !== null && node.quantity !== undefined ? (
                <span className="font-normal text-slate-700 text-sm">
                  {formatQuantityVN(node.quantity)}
                </span>
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
          <td className="p-3.5 text-sm text-center">
            {isLeaf ? (
              node.unit ? (
                <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-normal bg-slate-100 text-slate-700 border border-slate-200/80">
                  {node.unit}
                </span>
              ) : (
                "—"
              )
            ) : (
              "—"
            )}
          </td>

          {/* Cột Đơn giá (chỉ khi can_view_prices là true) */}
          {canViewPrices && (
            <td className="p-3.5 text-sm text-right font-mono tabular-nums text-slate-700">
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
              className={`p-3.5 text-sm text-right font-mono tabular-nums ${
                !isLeaf ? "font-semibold text-blue-700 text-[14px]" : "font-normal text-slate-700 text-sm"
              }`}
            >
              {hasContractInBranch ? formatMoneyVND(node.contract_total) : "—"}
            </td>
          )}

          {/* Cột Thao tác */}
          {canEdit && (
            <td className="p-3.5 text-sm text-right whitespace-nowrap">
              {isLeaf && (
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenEdit(node)}
                    className="h-8 px-2.5 rounded-lg text-blue-700 bg-blue-50/90 hover:bg-blue-600 hover:text-white border border-blue-200/90 font-semibold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer group"
                  >
                    <Pencil className="w-3.5 h-3.5 text-blue-600 group-hover:text-white transition-colors" />
                    <span>Khai/Sửa</span>
                  </Button>

                  {node.quantity !== null && node.quantity !== undefined && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenDelete(node)}
                      className="size-8 p-0 rounded-lg text-red-600 bg-red-50/80 hover:bg-red-600 hover:text-white border border-red-200/80 flex items-center justify-center transition-all shadow-2xs cursor-pointer group"
                      title="Xoá khối lượng hợp đồng"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600 group-hover:text-white transition-colors" />
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
      <div className="p-4 sm:p-6 space-y-4 max-w-[1672px] mx-auto w-full">
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
    <div className="flex-1 min-h-0 bg-[#F3F6FB] text-[#0F1B3D] flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 gap-5 sm:gap-6 max-w-[1672px] mx-auto w-full pb-28 md:pb-6">
        {/* Header trang dạng Hero Banner màu xanh đồng bộ */}
        <PageHeroBanner
          icon={<Coins className="size-6 sm:size-8" />}
          title="Khối lượng và đơn giá hợp đồng"
          subtitle={
            currentProject
              ? `Dự án: ${currentProject.name} · Quản lý khối lượng và đơn giá hợp đồng`
              : "Quản lý khối lượng, đơn giá hợp đồng cho các hạng mục lá. Hạng mục cha tự động cộng dồn."
          }
        >
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllCollapse}
              className="h-9 px-3.5 bg-white/15 hover:bg-white/25 text-white border-white/30 hover:border-white/50 backdrop-blur-md font-semibold cursor-pointer text-xs flex items-center gap-1.5 transition-all shadow-2xs rounded-xl"
            >
              <ChevronsUpDown className="w-4 h-4 text-white" />
              <span>Mở rộng / Thu gọn</span>
            </Button>
          )}
        </PageHeroBanner>

        <OfflineSnapshotBanner isFromCache={isFromCache} cachedAt={cachedAt} cacheMiss={cacheMiss} pageName="khối lượng hợp đồng" />

        {/* Trạng thái rỗng: Dự án chưa có hạng mục */}
        {items.length === 0 ? (
          <div className="p-8 sm:p-12 text-center rounded-2xl border border-slate-200/90 bg-white space-y-4 shadow-2xs">
            <FolderTree className="w-12 h-12 text-slate-400 mx-auto stroke-1" />
            <h3 className="text-base font-semibold text-[#0F1B3D]">Dự án chưa có hạng mục công việc nào</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Hãy bắt đầu tạo cơ cấu phân chia công việc (WBS) cho dự án trước khi khai báo khối lượng hợp đồng.
            </p>
            <Button asChild className="h-10 px-4 mt-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              <Link to="/wbs">Chuyển sang trang WBS</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* ── Các Thẻ KPI Thống Kê Nổi Bật Phía Trên Bảng ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {/* Thẻ 1: Tổng giá trị (chỉ render nếu canViewPrices để đảm bảo test ẩn giá) */}
              {canViewPrices && (
                <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Giá trị hợp đồng tổng thể
                      </span>
                      <div className="size-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Coins className="size-4.5" />
                      </div>
                    </div>
                    <div className="mt-2.5 text-2xl sm:text-[28px] font-black font-mono tracking-tight text-[#0F1B3D]">
                      {formatMoneyVND(data?.project_total || "0.00")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                    <TrendingUp className="size-3.5 text-blue-600 shrink-0" />
                    <span>Cộng dồn tự động từ các hạng mục lá</span>
                  </div>
                </div>
              )}

              {/* Thẻ 2: Tiến độ khai báo khối lượng */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Tiến độ khai báo khối lượng
                    </span>
                    <div className="size-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-2xs group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <CheckCircle2 className="size-4.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-[28px] font-black font-mono tracking-tight text-[#0F1B3D]">
                      {assignedLeaves.length} / {leafItems.length}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {assignedPercent}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 mt-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${assignedPercent}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  <span>hạng mục lá đã được khai báo</span>
                </div>
              </div>

              {/* Thẻ 3: Hạng mục chưa khai */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Chưa khai báo khối lượng
                    </span>
                    <div className="size-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-2xs group-hover:bg-amber-600 group-hover:text-white transition-colors">
                      <AlertCircle className="size-4.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 text-2xl sm:text-[28px] font-black font-mono tracking-tight text-[#0F1B3D]">
                    {unassignedLeaves.length}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  {unassignedLeaves.length === 0 ? "Toàn bộ hạng mục lá đã hoàn tất" : "Cần bổ sung khối lượng & đơn giá"}
                </div>
              </div>

              {/* Thẻ 4: Quyền hạn đơn giá */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-600 to-purple-500" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Chế độ xem đơn giá
                    </span>
                    <div className="size-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shadow-2xs group-hover:bg-violet-600 group-hover:text-white transition-colors">
                      <ShieldCheck className="size-4.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 text-base sm:text-lg font-bold text-[#0F1B3D]">
                    {canViewPrices ? "Toàn quyền quản lý giá" : "Chế độ ẩn đơn giá"}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 truncate">
                  {canEdit ? "Có quyền khai báo & chỉnh sửa" : "Chỉ có quyền xem thông tin"}
                </div>
              </div>
            </div>

            {/* Bảng hiển thị khối lượng cây */}
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden flex flex-col">
              {/* Toolbar của bảng */}
              <div className="p-4 sm:px-6 border-b border-slate-200/80 bg-white flex flex-wrap items-center justify-between gap-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                    <FolderTree className="size-4.5" />
                  </div>
                  <div>
                    <span className="font-bold text-[#0F1B3D] text-[15px] sm:text-[16px] leading-tight block">
                      Bảng cơ cấu khối lượng & đơn giá theo cây WBS
                    </span>
                    <span className="text-xs text-slate-400 font-normal">
                      * Nhấn "Khai/Sửa" ở từng hạng mục lá để cập nhật khối lượng và đơn giá hợp đồng
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 ml-auto">
                  {/* Ô tìm kiếm nhanh */}
                  <div className="relative min-w-[200px] sm:min-w-[260px]">
                    <Search className="size-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm kiếm hạng mục..."
                      className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200/90 bg-[#F8FAFC] text-[11px] font-medium text-slate-500 uppercase tracking-normal">
                      <th className="p-3.5 w-28 whitespace-nowrap">Mã hạng mục</th>
                      <th className="p-3.5 min-w-[280px]">Hạng mục</th>
                      <th className="p-3.5 text-right w-36 whitespace-nowrap">Khối lượng</th>
                      <th className="p-3.5 text-center w-28 whitespace-nowrap">Đơn vị</th>
                      {canViewPrices && <th className="p-3.5 text-right w-44 whitespace-nowrap">Đơn giá</th>}
                      {canViewPrices && <th className="p-3.5 text-right w-48 whitespace-nowrap">Thành tiền (₫)</th>}
                      {canEdit && <th className="p-3.5 text-right w-36 whitespace-nowrap">Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">{renderTreeRows(visibleTreeRoots)}</tbody>

                  {/* Dòng tổng dự án cuối bảng */}
                  {canViewPrices && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50/95 text-slate-800">
                        <td colSpan={5} className="p-4 text-sm text-right text-slate-700 font-semibold uppercase tracking-normal">
                          Tổng giá trị hợp đồng:
                        </td>
                        <td className="p-4 text-base text-right font-mono tabular-nums font-semibold text-blue-700">
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
          <DialogContent className="sm:max-w-lg rounded-2xl border border-slate-200/90 shadow-2xl p-6 bg-white">
            <DialogHeader className="pb-3 border-b border-slate-100">
              <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-[#0F1B3D]">
                <div className="size-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                  <Pencil className="size-4" />
                </div>
                <span>Khai báo Khối lượng Hợp đồng</span>
              </DialogTitle>
            </DialogHeader>

            {editingItem && (
              <form onSubmit={handleSubmitForm} className="space-y-4 py-2">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-sm space-y-1">
                  <div className="font-semibold text-[#0F1B3D] flex items-center gap-2">
                    {/* A2: ẩn dấu '–' khi hạng mục không có mã; chỉ hiện mã khi có */}
                    {editingItem.code ? (
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/70">{editingItem.code}</span>
                    ) : null}
                    <span className="font-bold">{editingItem.name}</span>
                  </div>
                </div>

                {/* Cảnh báo server (e.g. 422 hạng mục cha) */}
                {serverWarning && (
                  <div className="p-3 text-sm rounded-xl bg-amber-50 text-amber-900 border border-amber-200 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <span>{serverWarning}</span>
                  </div>
                )}

                {/* Input Khối lượng */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="field-quantity" className="text-xs font-semibold text-slate-700">
                      Khối lượng <span className="text-destructive">*</span>
                    </Label>
                    {/* A4: Khi đã chọn đơn vị, hiện tên đơn vị cạnh ô khối lượng */}
                    {formUnit && (
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-md">
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
                    className={`h-11 rounded-xl font-mono text-base font-bold ${formErrors.quantity ? "border-destructive" : ""}`}
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
                  <Label htmlFor="field-unit" className="text-xs font-semibold text-slate-700">
                    Đơn vị tính <span className="text-destructive">*</span>
                  </Label>
                  <Select value={formUnit} onValueChange={(val) => {
                    setFormUnit(val);
                    if (formErrors.unit) {
                      setFormErrors((prev) => ({ ...prev, unit: null }));
                    }
                  }}>
                    <SelectTrigger id="field-unit" className="h-10 rounded-xl cursor-pointer">
                      {/* A1: Ô đơn vị trống, hiện chữ gợi ý 'Chọn đơn vị' */}
                      <SelectValue placeholder="Chọn đơn vị" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-slate-200 shadow-xl bg-white">
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
                  <Label htmlFor="field-unit-price" className="text-xs font-semibold text-slate-700">
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
                    className={`h-11 rounded-xl font-mono text-base font-bold ${formErrors.unit_price ? "border-destructive" : ""}`}
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
                <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 font-medium">Thành tiền dự kiến:</span>
                    <span className="font-mono font-bold text-base text-blue-700 tabular-nums">
                      {estimatedContractValue !== null ? formatMoneyVND(estimatedContractValue) : "—"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 text-right italic">
                    = Khối lượng × Đơn giá
                  </p>
                </div>

                <DialogFooter className="pt-2 border-t border-slate-100 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={submitting}
                    className="h-9 px-4 rounded-xl cursor-pointer text-xs font-semibold"
                  >
                    Huỷ
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="h-9 px-4 rounded-xl cursor-pointer min-w-24 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs"
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
          <AlertDialogContent className="rounded-2xl border border-slate-200/90 shadow-2xl p-6 bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-bold text-[#0F1B3D]">
                Xoá khối lượng hợp đồng?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-slate-600">
                Bạn có chắc chắn muốn xoá toàn bộ khối lượng, đơn vị và đơn giá hợp đồng của hạng mục "
                <strong className="text-slate-900">{deletingItem?.name}</strong>"? Hành động này sẽ đưa các giá trị về trạng thái chưa khai.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={deleting} className="h-9 px-4 rounded-xl cursor-pointer text-xs font-semibold">
                Huỷ
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                {deleting ? "Đang xoá..." : "Xác nhận xoá"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
