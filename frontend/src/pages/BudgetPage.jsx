import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import PageHeroBanner from "../components/PageHeroBanner";
import ActualCostsPanel from "./ActualCostsPanel";
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
  Search,
  Maximize2,
  Minimize2,
  FolderOpen,
  FileText,
  X,
  DollarSign,
  Sparkles,
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
  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const projectId = String(currentProject?.id || localStorage.getItem("currentProjectId") || "1");

  // Tab: "entry" (S-46 Khai báo dự toán) | "summary" (S-48 Tổng hợp Thực chi & Cảnh báo)
  const [activeTab, setActiveTab] = useState("entry");

  // State cho Tab 1 (Khai báo dự toán)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState("latest");
  const [collapsedNodes, setCollapsedNodes] = useState({});
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // 'all' | 'unallocated' | 'allocated'

  // State cho Tab 2 (Tổng hợp Thực chi & Cảnh báo - T-122 / T-123)
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryThreshold, setSummaryThreshold] = useState("80");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "warning" | "resolved" | "normal" | "nobudget"
  const [summaryCollapsedNodes, setSummaryCollapsedNodes] = useState({});

  // Dialog nhập dự toán cho từng lá (Tab 1)
  const [editingItem, setEditingItem] = useState(null);
  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchSeqRef = useRef(0);

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
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const url =
        versionNum && versionNum !== "latest"
          ? `/projects/${projectId}/budgets/tree?version=${versionNum}`
          : `/projects/${projectId}/budgets/tree`;

      const res = await api.get(url);
      if (seq !== fetchSeqRef.current) return;
      setData(res.data);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(err?.response?.data?.message || "Không thể tải dữ liệu dự toán dự án");
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
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

  // Thống kê nhanh hạng mục lá
  const leafItems = useMemo(() => {
    return (data?.items || []).filter((i) => i.is_leaf);
  }, [data?.items]);

  const allocatedLeaves = useMemo(() => {
    return leafItems.filter((i) => i.amount !== null && i.amount !== undefined);
  }, [leafItems]);

  const unallocatedLeaves = useMemo(() => {
    return leafItems.filter((i) => i.amount === null || i.amount === undefined);
  }, [leafItems]);

  const allocationPercent = leafItems.length
    ? Math.round((allocatedLeaves.length / leafItems.length) * 100)
    : 0;

  // Lọc cây theo từ khoá tìm kiếm và bộ lọc trạng thái (Tab 1)
  const visibleTreeRoots = useMemo(() => {
    const q = (search || "").trim().toLowerCase();

    const matchesFilter = (n) => {
      if (filterMode === "unallocated") {
        return n.is_leaf ? (n.amount === null || n.amount === undefined) : true;
      }
      if (filterMode === "allocated") {
        return n.is_leaf ? (n.amount !== null && n.amount !== undefined) : true;
      }
      return true;
    };

    const matchesSearch = (n) => {
      if (!q) return true;
      return (
        (n.name && n.name.toLowerCase().includes(q)) ||
        (n.code && n.code.toLowerCase().includes(q)) ||
        (n.note && n.note.toLowerCase().includes(q))
      );
    };

    const filterNode = (n) => {
      const matchSelf = matchesSearch(n) && (n.is_leaf ? matchesFilter(n) : true);
      const kids = (n.children || []).map(filterNode).filter(Boolean);

      if (matchSelf && (!n.is_leaf ? kids.length > 0 || matchesSearch(n) : true)) {
        return { ...n, children: kids };
      }
      if (kids.length > 0) {
        return { ...n, children: kids };
      }
      return null;
    };

    return treeRoots.map(filterNode).filter(Boolean);
  }, [treeRoots, search, filterMode]);

  const hasAnyCollapsed = useMemo(() => {
    return Object.values(collapsedNodes).some(Boolean);
  }, [collapsedNodes]);

  const toggleAllCollapse = () => {
    if (hasAnyCollapsed) {
      setCollapsedNodes({});
    } else {
      const allIds = {};
      const walk = (nodes) => {
        nodes.forEach((n) => {
          if (n.children && n.children.length > 0) {
            allIds[n.id] = true;
            walk(n.children);
          }
        });
      };
      walk(treeRoots);
      setCollapsedNodes(allIds);
    }
  };

  // Mở dialog sửa một hạng mục lá
  const handleOpenEdit = (item) => {
    if (!item.is_leaf) {
      toast.warning(
        "Hạng mục cha không cho phép nhập dự toán trực tiếp. Hệ thống sẽ tự động cộng tổng từ các hạng mục lá con."
      );
      return;
    }
    setEditingItem(item);
    setFormAmount(item.amount ? formatInputDisplayVN(item.amount) : "");
    setFormNote(item.note || "");
    setFormError("");
  };

  // Hỗ trợ cộng nhanh số tiền trong modal
  const handleAddPreset = (amountToAdd) => {
    const raw = (formAmount || "").replace(/\./g, "").replace(/,/g, ".");
    const currentVal = parseFloat(raw) || 0;
    const nextVal = currentVal + amountToAdd;
    setFormAmount(formatInputDisplayVN(nextVal));
    setFormError("");
  };

  // Preview số tiền định dạng trực quan khi người dùng gõ
  const previewFormattedAmount = useMemo(() => {
    if (!formAmount || !formAmount.trim()) return null;
    const norm = normalizeDecimalInput(formAmount, {
      maxIntDigits: 14,
      maxScale: 2,
      fieldName: "Số tiền dự toán",
    });
    if (norm.ok && norm.value !== null && norm.value !== "") {
      return formatMoneyVND(norm.value);
    }
    return null;
  }, [formAmount]);

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
      const msg =
        err?.response?.data?.message || "Không thể lưu dự toán, vui lòng thử lại";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Đệ quy render các hàng trong cây WBS (Tab 1)
  const renderTreeRows = (nodes, level = 0) => {
    const rows = [];

    nodes.forEach((node) => {
      const isLeaf = node.is_leaf;
      const isCollapsed = collapsedNodes[node.id];

      rows.push(
        <tr
          key={node.id}
          className={`border-b transition-colors group ${
            !isLeaf
              ? "bg-slate-50/90 hover:bg-slate-100/80 font-semibold border-slate-200/90"
              : "bg-white hover:bg-blue-50/40 border-slate-100"
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
                  onClick={() => toggleCollapse(node.id)}
                  className="size-6 rounded-md hover:bg-slate-200/90 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title={isCollapsed ? "Mở rộng" : "Thu gọn"}
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

              <span
                className={`break-words ${
                  !isLeaf
                    ? "font-semibold text-slate-900 text-[14px]"
                    : "text-slate-700 font-normal text-[13.5px]"
                }`}
              >
                {node.name}
              </span>

              {!isLeaf && (
                <span className="text-[11px] text-blue-600/70 font-medium ml-1.5 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100/60 hidden sm:inline-block">
                  Tổng cộng từ cây
                </span>
              )}
            </div>
          </td>

          {/* Cột Phân loại */}
          <td className="p-3.5 text-sm text-center whitespace-nowrap">
            {isLeaf ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/90 shadow-2xs">
                <span className="size-1.5 rounded-full bg-emerald-500"></span>
                <span>Hạng mục lá</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/90 shadow-2xs">
                <span className="size-1.5 rounded-full bg-indigo-500"></span>
                <span>Hạng mục cha</span>
              </span>
            )}
          </td>

          {/* Cột Dự toán lá (VND) */}
          <td className="p-3.5 text-sm text-right font-mono tabular-nums">
            {isLeaf ? (
              node.amount !== null && node.amount !== undefined ? (
                <span className="font-normal text-slate-700 text-sm">
                  {formatMoneyVND(node.amount)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/90 shadow-2xs">
                  <AlertTriangle className="size-3 text-amber-600" />
                  <span>Chưa nhập</span>
                </span>
              )
            ) : (
              <span className="text-slate-400 italic text-xs font-normal">
                Không nhập ở cha
              </span>
            )}
          </td>

          {/* Cột Tổng cộng dồn (VND) */}
          <td className="p-3.5 text-sm text-right font-mono tabular-nums">
            <span
              className={`font-mono tabular-nums ${
                !isLeaf
                  ? "font-semibold text-blue-700 text-[14px]"
                  : "font-normal text-slate-700 text-sm"
              }`}
            >
              {formatMoneyVND(node.total_budget || "0.00")}
            </span>
          </td>

          {/* Cột Ghi chú */}
          <td className="p-3.5 text-sm text-slate-500 max-w-[200px] truncate">
            {node.note ? (
              <span title={node.note} className="text-slate-600 text-xs">
                {node.note}
              </span>
            ) : (
              <span className="text-slate-300 font-mono">—</span>
            )}
          </td>

          {/* Cột Thao tác */}
          <td className="p-3.5 text-sm text-center whitespace-nowrap">
            {isLeaf ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenEdit(node)}
                className="h-8 px-3 rounded-lg text-blue-700 bg-blue-50/90 hover:bg-blue-600 hover:text-white border border-blue-200/90 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs mx-auto cursor-pointer group"
                title="Nhập / Sửa dự toán cho hạng mục này"
              >
                <Pencil className="w-3.5 h-3.5 text-blue-600 group-hover:text-white transition-colors" />
                <span>Nhập dự toán</span>
              </Button>
            ) : (
              <span className="text-xs text-slate-300 font-mono">—</span>
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
            className={`border-b transition-colors hover:bg-slate-50/60 ${
              !isLeaf
                ? "bg-slate-50/90 hover:bg-slate-100/80 font-semibold border-slate-200/90"
                : "bg-white hover:bg-blue-50/40 border-slate-100"
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
                    onClick={() => toggleSummaryCollapse(node.id)}
                    className="size-6 rounded-md hover:bg-slate-200/90 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    title={isCollapsed ? "Mở rộng" : "Thu gọn"}
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

                <span
                  className={`break-words ${
                    !isLeaf
                      ? "font-semibold text-slate-900 text-[14px]"
                      : "text-slate-700 font-normal text-[13.5px]"
                  }`}
                >
                  {node.name}
                </span>

                {!isLeaf && (
                  <span className="text-[11px] text-blue-600/70 font-medium ml-1.5 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100/60 hidden sm:inline-block">
                    Tổng cộng từ cây
                  </span>
                )}
              </div>
            </td>

            {/* Cột Phân loại */}
            <td className="p-3.5 text-sm text-center whitespace-nowrap">
              {isLeaf ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/90 shadow-2xs">
                  <span className="size-1.5 rounded-full bg-emerald-500"></span>
                  <span>Hạng mục lá</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/90 shadow-2xs">
                  <span className="size-1.5 rounded-full bg-indigo-500"></span>
                  <span>Hạng mục cha</span>
                </span>
              )}
            </td>

            {/* Cột Khối lượng HĐ & Nghiệm thu */}
            <td className="p-3.5 text-sm text-center font-mono">
              {isLeaf ? (
                node.contract_quantity ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs font-semibold text-slate-700">
                      {node.approved_quantity ? Number(node.approved_quantity).toLocaleString("vi-VN") : "0"} / {Number(node.contract_quantity).toLocaleString("vi-VN")}
                    </span>
                    {node.acceptance_percent !== null && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal bg-blue-50 text-blue-700 border-blue-200">
                        NT: {node.acceptance_percent}%
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 italic">Không có HĐ</span>
                )
              ) : (
                <span className="text-xs text-slate-300 italic">—</span>
              )}
            </td>

            {/* Cột Dự toán (VND) */}
            <td className="p-3.5 text-sm text-right font-mono tabular-nums">
              {node.has_budget || Number(node.total_budget) > 0 ? (
                <span className={`font-mono tabular-nums ${!isLeaf ? "font-semibold text-blue-700 text-[14px]" : "font-normal text-slate-700 text-sm"}`}>
                  {formatMoneyVND(node.total_budget || "0.00")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/90 shadow-2xs">
                  Chưa có dự toán
                </span>
              )}
            </td>

            {/* Cột Thực chi (VND) */}
            <td className="p-3.5 text-sm text-right font-mono tabular-nums font-semibold text-slate-800">
              {formatMoneyVND(node.total_actual_cost || "0.00")}
            </td>

            {/* Cột Tỷ lệ sử dụng (%) */}
            <td className="p-3.5 text-sm text-center">
              {node.utilization_percent !== null ? (
                <div className="w-full max-w-[130px] mx-auto space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono font-medium">
                    <span className={isOverThreshold ? "text-rose-600 font-bold" : "text-slate-700"}>
                      {node.utilization_percent}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOverThreshold ? "bg-rose-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(utilNum || 0, 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <span className="text-xs text-slate-300 italic">—</span>
              )}
            </td>

            {/* Cột Trạng thái & Cảnh báo */}
            <td className="p-3.5 text-sm text-center whitespace-nowrap">
              {node.alert_status === "WARNING" ? (
                <Badge variant="destructive" className="gap-1 text-xs py-0.5 px-2 font-medium bg-red-500 text-white shadow-2xs" title={node.alert_message}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Cảnh báo vượt ngưỡng</span>
                  {node.alert_count > 0 && !isLeaf && (
                    <span className="ml-1 text-[10px]">({node.alert_count})</span>
                  )}
                </Badge>
              ) : node.alert_status === "RESOLVED" ? (
                <Badge variant="outline" className="gap-1 text-xs py-0.5 px-2 bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs font-medium" title={node.alert_message}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Đã hết cảnh báo</span>
                </Badge>
              ) : node.alert_status === "NORMAL" ? (
                <Badge variant="outline" className="gap-1 text-xs py-0.5 px-2 text-slate-600 bg-slate-50 border-slate-200" title={node.alert_message}>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>An toàn</span>
                </Badge>
              ) : (
                <span className="text-xs text-slate-400 italic">Chưa lập dự toán</span>
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

  // Thống kê Tab 2
  const summaryRootItems = (summaryData?.items || []).filter((i) => !i.parent_id);
  const summaryTotalBudget = summaryRootItems.reduce((acc, i) => acc + (parseFloat(i.total_budget) || 0), 0);
  const summaryTotalActual = summaryRootItems.reduce((acc, i) => acc + (parseFloat(i.total_actual_cost) || 0), 0);
  const summaryOverallUtilization = summaryTotalBudget > 0 ? ((summaryTotalActual / summaryTotalBudget) * 100).toFixed(2) : null;
  const summaryWarningCount = (summaryData?.items || []).filter((i) => i.is_leaf && i.has_alert).length;
  const summaryResolvedCount = (summaryData?.items || []).filter((i) => i.is_leaf && i.alert_status === "RESOLVED").length;

  return (
    <div className="flex-1 min-h-0 bg-[#F3F6FB] text-[#0F1B3D] flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 gap-5 sm:gap-6 max-w-[1672px] mx-auto w-full">
        {/* ── Tiêu đề Hero Banner màu xanh nổi bật ── */}
        <PageHeroBanner
          icon={<Coins className="size-6 sm:size-8" />}
          title="Dự toán chi phí theo hạng mục"
          badge={
            <Badge
              variant="outline"
              className="hidden sm:inline-flex font-semibold text-xs bg-emerald-500/25 text-white border-emerald-300/40 backdrop-blur-md px-2.5 py-0.5 rounded-full ml-2"
            >
              {activeTab === "entry" ? "Khai báo dự toán (S-46)" : "Tổng hợp & Cảnh báo (S-48)"}
            </Badge>
          }
          subtitle={
            activeTab === "entry"
              ? (currentProject
                ? `Dự án: ${currentProject.name} · Quản lý dự toán chi tiết theo cây WBS`
                : "Quản lý dự toán cho từng hạng mục lá và tự động cộng tổng lũy kế lên các hạng mục cha theo cây WBS.")
              : "Tổng hợp dự toán hiện hành, đối chiếu chi phí thực tế theo cây WBS và phát hiện cảnh báo vượt ngưỡng chi phí so với tiến độ nghiệm thu."
          }
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Nút chuyển Tab */}
            <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl border border-white/20 backdrop-blur-md">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab("entry")}
                className={`h-8 gap-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  activeTab === "entry"
                    ? "bg-white text-blue-700 shadow-2xs hover:bg-white hover:text-blue-700"
                    : "text-white/90 hover:bg-white/15 hover:text-white"
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>Khai báo dự toán (S-46)</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab("actual")}
                className={`h-8 gap-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  activeTab === "actual"
                    ? "bg-white text-blue-700 shadow-2xs hover:bg-white hover:text-blue-700"
                    : "text-white/90 hover:bg-white/15 hover:text-white"
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Ghi nhận thực chi (S-47)</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab("summary")}
                className={`h-8 gap-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  activeTab === "summary"
                    ? "bg-white text-blue-700 shadow-2xs hover:bg-white hover:text-blue-700"
                    : "text-white/90 hover:bg-white/15 hover:text-white"
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Tổng hợp Thực chi & Cảnh báo</span>
                <Badge
                  variant="secondary"
                  className={`ml-1 text-[10px] px-1 py-0 font-bold ${
                    activeTab === "summary" ? "bg-blue-100 text-blue-700" : "bg-white/20 text-white"
                  }`}
                >
                  S-48
                </Badge>
              </Button>
            </div>

            {/* Dropdown xem phiên bản cũ / mới (cho Tab 1) */}
            {activeTab === "entry" && (
              <div className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/25 rounded-xl px-2.5 py-1 backdrop-blur-md text-white transition-all shadow-2xs">
                <History className="w-4 h-4 text-white/90 shrink-0" />
                <Select value={selectedVersion} onValueChange={handleVersionChange}>
                  <SelectTrigger className="w-[160px] sm:w-[190px] h-8 bg-transparent border-0 text-white font-semibold text-xs focus:ring-0 shadow-none cursor-pointer">
                    <SelectValue placeholder="Chọn phiên bản" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-slate-200 shadow-xl bg-white text-slate-800">
                    <SelectItem
                      value="latest"
                      className="cursor-pointer font-bold text-blue-600"
                    >
                      Phiên bản mới nhất
                    </SelectItem>
                    {versions.map((v) => (
                      <SelectItem
                        key={v.id}
                        value={String(v.version_number)}
                        className="cursor-pointer text-xs"
                      >
                        v{v.version_number} ({new Date(v.created_at).toLocaleDateString("vi-VN")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Nút Làm mới */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (activeTab === "entry") {
                  fetchVersions();
                  fetchBudgetTree(selectedVersion === "latest" ? null : selectedVersion);
                } else {
                  fetchBudgetSummary(summaryThreshold);
                }
              }}
              className="h-8.5 px-3.5 bg-white/15 hover:bg-white/25 text-white border-white/30 hover:border-white/50 backdrop-blur-md font-semibold cursor-pointer text-xs flex items-center gap-1.5 transition-all shadow-2xs rounded-xl"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className="w-3.5 h-3.5 text-white" />
              <span>Làm mới</span>
            </Button>
          </div>
        </PageHeroBanner>

        {/* ======================================================== */}
        {/* TAB 1: KHAI BÁO DỰ TOÁN (S-46 / T-119)                   */}
        {/* ======================================================== */}
        {activeTab === "entry" && (
          <>
            {/* Cảnh báo khi dự án đã phát sinh thực chi */}
            {data?.has_actual_costs && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50/95 p-4 sm:p-4.5 flex items-start gap-3.5 shadow-sm animate-in fade-in duration-200">
                <div className="size-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <AlertTriangle className="size-5" />
                </div>
                <div className="text-sm text-amber-900 flex-1">
                  <p className="font-bold text-[14.5px]">
                    Dự án đã phát sinh chi phí thực tế (Actual Costs)
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800/95 leading-relaxed">
                    Theo quy tắc quản lý ngân sách, mọi thay đổi dự toán từ thời điểm này sẽ được bảo lưu và{" "}
                    <strong>tự động tạo thành một phiên bản dự toán mới</strong> để không ghi đè làm mất lịch sử các mốc ban đầu.
                  </p>
                </div>
              </div>
            )}

            {/* 4 Thẻ KPI thống kê nổi bật */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {/* Card 1: Tổng dự toán */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Tổng dự toán dự án
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
                  <span>Cộng dồn từ toàn bộ các hạng mục lá</span>
                </div>
              </div>

              {/* Card 2: Phiên bản */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-600 to-purple-500" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Phiên bản hiện tại
                    </span>
                    <div className="size-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shadow-2xs group-hover:bg-violet-600 group-hover:text-white transition-colors">
                      <Layers className="size-4.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-[28px] font-black font-mono tracking-tight text-[#0F1B3D]">
                      {data?.version ? `v${data.version.version_number}` : "Chưa lập"}
                    </span>
                    {data?.version && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                        Bản chuẩn
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 truncate">
                  {data?.version?.description || "Chưa có mô tả"}
                </div>
              </div>

              {/* Card 3: Tiến độ phân bổ */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Tiến độ phân bổ
                    </span>
                    <div className="size-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-2xs group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <FolderTree className="size-4.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="text-2xl sm:text-[28px] font-black font-mono tracking-tight text-[#0F1B3D]">
                      {allocatedLeaves.length} / {leafItems.length}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {allocationPercent}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 mt-2.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${allocationPercent}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  <span>hạng mục lá đã được định mức</span>
                </div>
              </div>

              {/* Card 4: Thực chi đối chiếu */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div
                  className={`absolute top-0 left-0 right-0 h-1.5 ${
                    data?.has_actual_costs
                      ? "bg-gradient-to-r from-amber-500 to-orange-500"
                      : "bg-gradient-to-r from-slate-400 to-slate-500"
                  }`}
                />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Thực chi đối chiếu
                    </span>
                    <div
                      className={`size-9 rounded-xl flex items-center justify-center shadow-2xs transition-colors ${
                        data?.has_actual_costs
                          ? "bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white"
                          : "bg-slate-100 text-slate-500 group-hover:bg-slate-600 group-hover:text-white"
                      }`}
                    >
                      <DollarSign className="size-4.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 text-lg font-bold text-[#0F1B3D]">
                    {data?.has_actual_costs ? "Đã phát sinh thực chi" : "Chưa có thực chi"}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  {data?.has_actual_costs
                    ? "Khóa ghi đè lịch sử (tự sinh bản mới)"
                    : "Có thể cập nhật trực tiếp"}
                </div>
              </div>
            </div>

            {/* Bảng cây dự toán Tab 1 */}
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden flex flex-col">
              {/* Toolbar của bảng */}
              <div className="p-4 sm:px-6 border-b border-slate-200/80 bg-white flex flex-wrap items-center justify-between gap-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                    <FolderTree className="size-4.5" />
                  </div>
                  <div>
                    <span className="font-bold text-[#0F1B3D] text-[15px] sm:text-[16px] leading-tight block">
                      Cây cơ cấu công việc & dự toán chi phí
                    </span>
                    <span className="text-xs text-slate-400 font-normal">
                      * Nhấp vào nút "Nhập dự toán" ở hạng mục lá để khai báo chi phí
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 ml-auto">
                  {/* Bộ lọc nhanh trạng thái */}
                  <div className="hidden md:flex items-center bg-slate-100/90 p-1 rounded-xl text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setFilterMode("all")}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        filterMode === "all"
                          ? "bg-white text-blue-700 shadow-2xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Tất cả ({leafItems.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode("allocated")}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        filterMode === "allocated"
                          ? "bg-white text-emerald-700 shadow-2xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Đã nhập ({allocatedLeaves.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode("unallocated")}
                      className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                        filterMode === "unallocated"
                          ? "bg-white text-amber-700 shadow-2xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Chưa nhập ({unallocatedLeaves.length})
                    </button>
                  </div>

                  {/* Ô tìm kiếm nhanh */}
                  <div className="relative min-w-[200px] sm:min-w-[240px]">
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

                  {/* Nút Thu gọn / Mở rộng tất cả */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleAllCollapse}
                    className="h-8.5 px-3 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs flex items-center gap-1.5"
                    title={hasAnyCollapsed ? "Mở rộng tất cả các nhánh" : "Thu gọn tất cả về gốc"}
                  >
                    {hasAnyCollapsed ? (
                      <>
                        <Maximize2 className="size-3.5 text-blue-600" />
                        <span>Mở rộng</span>
                      </>
                    ) : (
                      <>
                        <Minimize2 className="size-3.5 text-slate-500" />
                        <span>Thu gọn</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="p-8 space-y-3">
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              ) : error ? (
                <div className="p-8 text-center text-sm text-red-600 bg-red-50/50">
                  {error}
                </div>
              ) : treeRoots.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  Dự án chưa có hạng mục công việc (WBS). Vui lòng thêm hạng mục tại màn hình WBS trước.
                </div>
              ) : visibleTreeRoots.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">
                  Không tìm thấy hạng mục nào phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/90 bg-[#F8FAFC] text-[11px] font-medium uppercase tracking-normal text-slate-500">
                        <th className="p-3.5 w-28 whitespace-nowrap">Mã</th>
                        <th className="p-3.5 min-w-[280px]">Hạng mục công việc (WBS)</th>
                        <th className="p-3.5 w-32 text-center whitespace-nowrap">Phân loại</th>
                        <th className="p-3.5 w-44 text-right whitespace-nowrap">Dự toán lá (VND)</th>
                        <th className="p-3.5 w-48 text-right whitespace-nowrap">Tổng cộng dồn (VND)</th>
                        <th className="p-3.5 min-w-[140px]">Ghi chú</th>
                        <th className="p-3.5 w-36 text-center whitespace-nowrap">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {renderTreeRows(visibleTreeRoots)}
                    </tbody>
                    {/* Tổng cộng chân bảng */}
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50/95 text-slate-800">
                        <td colSpan={4} className="p-3.5 text-right text-xs uppercase tracking-normal text-slate-600 font-semibold">
                          Tổng dự toán toàn bộ dự án:
                        </td>
                        <td className="p-3.5 text-right font-mono text-base font-semibold text-blue-700">
                          {formatMoneyVND(data?.project_total || "0.00")}
                        </td>
                        <td colSpan={2} className="p-3.5 text-left text-xs text-slate-500 font-normal">
                          (Cộng dồn từ {allocatedLeaves.length}/{leafItems.length} hạng mục lá đã nhập)
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ======================================================== */}
        {/* TAB 2: TỔNG HỢP DỰ TOÁN, THỰC CHI & CẢNH BÁO (S-48)     */}
        {/* ======================================================== */}
        
        {/* S-47: Ghi nhan chi phi thuc te */}
        {activeTab === "actual" && (
          <ActualCostsPanel projectId={projectId} />
        )}

        {activeTab === "summary" && (
          <>
            {/* Thanh công cụ cấu hình ngưỡng & bộ lọc trạng thái */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:px-5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Chọn ngưỡng cảnh báo */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Ngưỡng cảnh báo:</span>
                  <Select
                    value={summaryThreshold}
                    onValueChange={(val) => {
                      setSummaryThreshold(val);
                      fetchBudgetSummary(val);
                    }}
                  >
                    <SelectTrigger className="w-[125px] h-8 text-xs font-semibold border-slate-200 rounded-xl bg-slate-50/70">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-slate-200 shadow-xl bg-white text-slate-800">
                      <SelectItem value="70">70%</SelectItem>
                      <SelectItem value="80">80% (Chuẩn)</SelectItem>
                      <SelectItem value="85">85%</SelectItem>
                      <SelectItem value="90">90%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Bộ lọc trạng thái */}
                <div className="flex items-center gap-2">
                  <Filter className="size-3.5 text-slate-400" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[165px] h-8 text-xs font-semibold border-slate-200 rounded-xl bg-slate-50/70">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-slate-200 shadow-xl bg-white text-slate-800">
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
                className="h-8 px-3 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs flex items-center gap-1.5 ml-auto"
                title="Làm mới dữ liệu tổng hợp"
              >
                <RefreshCw className="size-3.5 text-slate-600" />
                <span>Làm mới</span>
              </Button>
            </div>

            {/* Cảnh báo tổng quan nếu có mục vi phạm */}
            {summaryWarningCount > 0 && (
              <div className="rounded-2xl border border-red-300 bg-red-50/95 p-4 sm:p-4.5 flex items-start gap-3.5 shadow-sm animate-in fade-in duration-200">
                <div className="size-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-2xs">
                  <AlertTriangle className="size-5" />
                </div>
                <div className="text-sm text-red-900 flex-1">
                  <p className="font-bold text-[14.5px]">
                    Phát hiện {summaryWarningCount} hạng mục vượt ngưỡng chi phí thực tế ({summaryThreshold}%) so với tiến độ nghiệm thu!
                  </p>
                  <p className="mt-0.5 text-xs text-red-800/90 leading-relaxed">
                    Các hạng mục này có chi phí thực chi vượt quá {summaryThreshold}% dự toán trong khi tỷ lệ khối lượng nghiệm thu chưa đạt {summaryThreshold}%. Vui lòng kiểm tra tiến độ hiện trường và đối chiếu hồ sơ nghiệm thu.
                  </p>
                </div>
              </div>
            )}

            {/* 4 Thẻ KPI thống kê Tab 2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {/* Card 1: Tổng dự toán */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 to-indigo-600" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Tổng dự toán
                    </span>
                    <div className="size-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Coins className="size-4.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 text-2xl sm:text-[28px] font-black font-mono tracking-tight text-[#0F1B3D]">
                    {formatMoneyVND(summaryTotalBudget)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  <FolderTree className="size-3.5 text-blue-600 shrink-0" />
                  <span>Cộng dồn toàn bộ cây WBS</span>
                </div>
              </div>

              {/* Card 2: Tổng thực chi */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Tổng thực chi
                    </span>
                    <div className="size-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-2xs group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <TrendingUp className="size-4.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 text-2xl sm:text-[28px] font-black font-mono tracking-tight text-[#0F1B3D]">
                    {formatMoneyVND(summaryTotalActual)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                  <DollarSign className="size-3.5 text-emerald-600 shrink-0" />
                  <span>Chi phí thực tế đã ghi nhận</span>
                </div>
              </div>

              {/* Card 3: Tỷ lệ sử dụng */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-600 to-purple-500" />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Tỷ lệ sử dụng
                    </span>
                    <div className="size-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shadow-2xs group-hover:bg-violet-600 group-hover:text-white transition-colors">
                      <BarChart3 className="size-4.5" />
                    </div>
                  </div>
                  <div className="mt-2.5 text-2xl sm:text-[28px] font-black font-mono tracking-tight text-[#0F1B3D]">
                    {summaryOverallUtilization ? `${summaryOverallUtilization}%` : "—"}
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 truncate">
                  {summaryTotalBudget > 0 ? "So với tổng ngân sách dự án" : "Chưa có dự toán"}
                </div>
              </div>

              {/* Card 4: Cảnh báo chi phí */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between group">
                <div
                  className={`absolute top-0 left-0 right-0 h-1.5 ${
                    summaryWarningCount > 0
                      ? "bg-gradient-to-r from-red-500 to-rose-600"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500"
                  }`}
                />
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Cảnh báo chi phí
                    </span>
                    <div
                      className={`size-9 rounded-xl flex items-center justify-center shadow-2xs transition-colors ${
                        summaryWarningCount > 0
                          ? "bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white"
                          : "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white"
                      }`}
                    >
                      <AlertTriangle className="size-4.5" />
                    </div>
                  </div>
                  <div className={`mt-2.5 text-2xl sm:text-[28px] font-black font-mono tracking-tight ${summaryWarningCount > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {summaryWarningCount} <span className="text-xs font-normal text-slate-400">hạng mục</span>
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 truncate">
                  {summaryResolvedCount > 0 ? `${summaryResolvedCount} hạng mục đã hết cảnh báo` : `Ngưỡng giám sát: ${summaryThreshold}%`}
                </div>
              </div>
            </div>

            {/* Bảng cây tổng hợp dự toán, thực chi & cảnh báo */}
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden flex flex-col">
              <div className="p-4 sm:px-6 border-b border-slate-200/80 bg-white flex flex-wrap items-center justify-between gap-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="size-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                    <BarChart3 className="size-4.5" />
                  </div>
                  <div>
                    <span className="font-bold text-[#0F1B3D] text-[15px] sm:text-[16px] leading-tight block">
                      Bảng tổng hợp dự toán, chi phí thực tế & cảnh báo vượt ngưỡng
                    </span>
                    <span className="text-xs text-slate-400 font-normal">
                      * Tỷ lệ sử dụng và trạng thái cảnh báo được tổng hợp theo thời gian thực
                    </span>
                  </div>
                </div>
              </div>

              {summaryLoading ? (
                <div className="p-8 space-y-3">
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <Skeleton className="h-10 w-full rounded-xl" />
                </div>
              ) : summaryError ? (
                <div className="p-8 text-center text-sm text-red-600 bg-red-50/50">
                  {summaryError}
                </div>
              ) : summaryTreeRoots.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  Chưa có dữ liệu tổng hợp dự toán & thực chi.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/90 bg-[#F8FAFC] text-[11px] font-medium uppercase tracking-normal text-slate-500">
                        <th className="p-3.5 w-28 whitespace-nowrap">Mã</th>
                        <th className="p-3.5 min-w-[260px]">Hạng mục công việc (WBS)</th>
                        <th className="p-3.5 w-28 text-center whitespace-nowrap">Phân loại</th>
                        <th className="p-3.5 w-40 text-center whitespace-nowrap">HĐ & Nghiệm thu</th>
                        <th className="p-3.5 w-44 text-right whitespace-nowrap">Dự toán (VND)</th>
                        <th className="p-3.5 w-44 text-right whitespace-nowrap">Thực chi (VND)</th>
                        <th className="p-3.5 w-36 text-center whitespace-nowrap">Tỷ lệ sử dụng</th>
                        <th className="p-3.5 w-48 text-center whitespace-nowrap">Trạng thái & Cảnh báo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {renderSummaryTreeRows(summaryTreeRoots)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Dialog nhập dự toán cho hạng mục lá (Tab 1) ─────── */}
        <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl border border-slate-200/90 shadow-2xl p-6 bg-white">
            <DialogHeader className="pb-3 border-b border-slate-100">
              <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-[#0F1B3D]">
                <div className="size-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                  <Pencil className="size-4" />
                </div>
                <span>Nhập dự toán cho hạng mục lá</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/80 text-sm">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
                  Hạng mục:
                </span>
                <span className="font-bold text-[#0F1B3D] text-[15px] mt-0.5 block">
                  [{editingItem?.code || "—"}] {editingItem?.name}
                </span>
              </div>

              {data?.has_actual_costs && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                  <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    Dự án đã có thực chi. Thay đổi này sẽ được lưu thành{" "}
                    <strong>phiên bản mới v{(data?.version?.version_number || 1) + 1}</strong>.
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="budget-amount" className="text-xs font-semibold text-slate-700">
                  Số tiền dự toán (VND) <span className="text-red-500">*</span>
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
                  className="font-mono text-base font-bold h-11 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  autoFocus
                />

                {/* Live formatted display */}
                {previewFormattedAmount && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-mono font-bold border border-blue-100">
                    <Sparkles className="size-3.5 text-blue-600" />
                    <span>Xem trước: {previewFormattedAmount}</span>
                  </div>
                )}

                {/* Quick add buttons */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 font-medium mr-1">Cộng nhanh:</span>
                  <button
                    type="button"
                    onClick={() => handleAddPreset(10000000)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    +10 Tr
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddPreset(50000000)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    +50 Tr
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddPreset(100000000)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    +100 Tr
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddPreset(500000000)}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    +500 Tr
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormAmount("")}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer ml-auto"
                  >
                    Xóa trắng
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="budget-note" className="text-xs font-semibold text-slate-700">
                  Ghi chú dự toán
                </Label>
                <Input
                  id="budget-note"
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Ghi chú chi tiết căn cứ lập định mức (nếu có)"
                  className="h-10 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm"
                />
              </div>

              {formError && (
                <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-200 font-medium">
                  {formError}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingItem(null)}
                disabled={submitting}
                className="rounded-xl h-9 text-xs font-semibold cursor-pointer border-slate-200"
              >
                Hủy
              </Button>
              <Button
                type="button"
                onClick={handleSaveItemBudget}
                disabled={submitting}
                className="gap-1.5 rounded-xl h-9 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? "Đang lưu..." : "Lưu dự toán"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
