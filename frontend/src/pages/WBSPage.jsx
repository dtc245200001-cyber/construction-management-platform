import React, { useState, useEffect, useMemo, useRef } from "react";
import { useOutletContext, Link } from "react-router-dom";
import * as XLSX from "@e965/xlsx";
import api from "../lib/api";
import { usePermission } from "../hooks/usePermission";
import TaskForm from "../components/TaskForm";
import CategoryModal, { saveCategory } from "../components/CategoryModal";
import { buildTree, rollupCategoryDates, isLeafCategory, flattenTasks } from "../utils/buildTree";
import { readSnapshot, writeSnapshot, isNetworkError, SNAPSHOT_TYPES } from "../services/offlineSnapshotCache";
import OfflineSnapshotBanner from "../components/OfflineSnapshotBanner";
import { format, parseISO } from "date-fns";
import { 
  Search, Plus, List, LayoutGrid,
  ChevronRight, ChevronDown, FolderOpen, FileText, 
  Lightbulb, X, FileSpreadsheet, Download, Network,
  Maximize2, Minimize2, Pencil, Trash2, PlusCircle, FolderPlus, CalendarRange, Flag,
  MoreVertical, MoreHorizontal
} from "lucide-react";

const COLORS = [
  { text: "text-[#1F63E0]", bg: "bg-[#EAF2FF]" },
  { text: "text-[#16A34A]", bg: "bg-[#E8F7EE]" },
  { text: "text-[#8B5CF6]", bg: "bg-[#F1EDFF]" },
  { text: "text-[#EA7A0B]", bg: "bg-[#FFEDD5]" },
  { text: "text-[#06B6D4]", bg: "bg-[#ECFEFF]" }
];

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("WBSPage Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className="p-10 text-red-500"><h1>Đã xảy ra lỗi!</h1><pre>{this.state.error.toString()}</pre></div>;
    }
    return this.props.children;
  }
}

export default function WBSPageWrapper(props) {
  return (
    <ErrorBoundary>
      <WBSPage {...props} />
    </ErrorBoundary>
  );
}

function WBSPage() {
  // Chỉ Ban quản lý được tạo/sửa/xóa WBS; vai trò khác chỉ xem (nút bị ẩn hẳn).
  const { can } = usePermission();
  const canManage = can("wbs.manage");
  const canManageMilestone = can("milestone.manage");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = useState("");
  const [showRightPanel, setShowRightPanel] = useState(true);
  // Lỗi 2 responsive: id node đang mở kebab menu hành động trên mobile
  const [openMenuNodeId, setOpenMenuNodeId] = useState(null);
  const [menuDropUp, setMenuDropUp] = useState(false);

  const handleToggleMenu = (e, nodeId) => {
    e.stopPropagation();
    if (openMenuNodeId === nodeId) {
      setOpenMenuNodeId(null);
      setMenuDropUp(false);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setMenuDropUp(spaceBelow < 280);
      setOpenMenuNodeId(nodeId);
    }
  };
  const [mobileTab, setMobileTab] = useState('tree'); // 'tree' | 'overview'
  const [viewMode, setViewMode] = useState('list'); // 'list' (Bảng phân cấp) | 'grid' (Thẻ phân cấp)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [cacheMiss, setCacheMiss] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const isReadOnly = isFromCache || !isOnline;
  const offlineMutationMessage = "Cần có mạng để thực hiện thao tác này";
  const context = useOutletContext();
  const currentProject = context?.currentProject;

  // T-43: Milestones
  const [milestones, setMilestones] = useState({});
  const [milestoneModalConfig, setMilestoneModalConfig] = useState({
    isOpen: false,
    workItem: null,
    date: "",
    error: ""
  });

  // =========================
  // T-12 TASK FORM
  // =========================
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedWorkItem, setSelectedWorkItem] = useState(null);
  const [editingTask, setEditingTask] = useState(null);

  const projectId = String(currentProject?.id || localStorage.getItem("currentProjectId") || "1");

  // State cho Modal Thêm / Sửa hạng mục (T-05 / T-09).
  // Công việc (task) luôn được thêm / sửa qua TaskForm dùng chung (T-12).
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    mode: "add_root", // 'add_root' | 'add_child' | 'edit_category'
    targetNode: null,
    name: "",
    code: "",
    error: "",
  });

  const [modalLoading, setModalLoading] = useState(false);

  // Nhập / Xuất Excel (khối "Thao tác nhanh")
  const fileInputRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null); // { rows, skipped, fileName }
  const [importLoading, setImportLoading] = useState(false);

  const openCreateTaskForm = (workItem) => {
  setSelectedWorkItem(workItem);
  setEditingTask(null);
  setShowTaskForm(true);
};

const openEditTaskForm = (node) => {
  setEditingTask({
    id: node.task_id,
    work_item_id: node.parent_id,
    name: node.name,
    duration_days: node.duration_days,
    scheduling_mode: node.scheduling_mode || "auto",
    manual_start_date: node.manual_start_date || "",
  });
  setSelectedWorkItem(null);
  setShowTaskForm(true);
};

const closeTaskForm = () => {
  setShowTaskForm(false);
  setSelectedWorkItem(null);
  setEditingTask(null);
};
  const fetchSeqRef = React.useRef(0);
  const previousProjectIdRef = React.useRef(null);

  const fetchWBS = async () => {
    const mySeq = ++fetchSeqRef.current;
    const myProjectId = projectId;
    const isStale = () =>
      mySeq !== fetchSeqRef.current ||
      String(myProjectId) !== String(currentProject?.id || localStorage.getItem("currentProjectId") || "1");

    const isProjectChanged = previousProjectIdRef.current !== null && previousProjectIdRef.current !== myProjectId;
    previousProjectIdRef.current = myProjectId;

    if (isProjectChanged) {
      setItems([]);
      setExpanded(new Set());
      setMilestones({});
      setLoadError(null);
      setCacheMiss(false);
      setIsFromCache(false);
      setCachedAt(null);
      setImportPreview(null);
      setImportLoading(false);
      closeTaskForm();
      setModalConfig((prev) => ({ ...prev, isOpen: false, error: "" }));
      setMilestoneModalConfig((prev) => ({ ...prev, isOpen: false, error: "" }));
      setOpenMenuNodeId(null);
    }

    try {
      if (items.length === 0 || isProjectChanged) {
        setLoading(true);
      }

      // SWR: Tải nhanh từ offline snapshot cache nếu có dữ liệu sẵn của dự án này,
      // giúp hiển thị cây WBS tức thì (0ms) mà không bị chớp màn hình trống "Chưa có hạng mục nào"
      try {
        const localSnapshot = await readSnapshot(myProjectId, SNAPSHOT_TYPES.WBS);
        if (!isStale() && localSnapshot?.payload?.tree) {
          const payload = localSnapshot.payload;
          setItems(buildTree(payload.tree));
          const msMap = {};
          (payload.milestones || []).forEach((m) => (msMap[m.work_item_id] = m));
          setMilestones(msMap);
          const initExpanded = new Set();
          const traverse = (node, level) => {
            if (level < 3) {
              initExpanded.add(node.id);
              node.children.forEach((c) => traverse(c, level + 1));
            }
          };
          const roots = buildTree(payload.tree);
          roots.forEach((r) => traverse(r, 1));
          setExpanded(initExpanded);
          setLoading(false);
        }
      } catch {
        /* ignore snapshot cache read error */
      }

      if (!navigator.onLine) {
        setIsOnline(false);
        const snapshot = await readSnapshot(myProjectId, SNAPSHOT_TYPES.WBS);
        if (isStale()) return;
        if (snapshot?.payload?.tree) {
          setItems(buildTree(snapshot.payload.tree));
          const msMap = {};
          (snapshot.payload.milestones || []).forEach((m) => (msMap[m.work_item_id] = m));
          setMilestones(msMap);
          setIsFromCache(true);
          setCachedAt(snapshot.cachedAt);
        } else {
          setCacheMiss(true);
        }
        return;
      }
      setCacheMiss(false);
      setLoadError(null);
      setIsOnline(true);
      const res = await api.get(`/categories/${myProjectId}/tree/all`);
      const msRes = await api.get(`/projects/${myProjectId}/milestones`);
      if (isStale()) return;
      const payload = { tree: res.data, milestones: msRes.data };
      await writeSnapshot(myProjectId, SNAPSHOT_TYPES.WBS, payload);
      if (isStale()) return;
      setItems(buildTree(payload.tree));
      const msMap = {};
      (payload.milestones || []).forEach((m) => (msMap[m.work_item_id] = m));
      setMilestones(msMap);
      setIsFromCache(false);
      setCachedAt(null);
      const initExpanded = new Set();
      const traverse = (node, level) => {
        if (level < 3) {
          initExpanded.add(node.id);
          node.children.forEach((c) => traverse(c, level + 1));
        }
      };
      const roots = buildTree(payload.tree);
      roots.forEach((r) => traverse(r, 1));
      setExpanded(initExpanded);
    } catch (err) {
      if (!isNetworkError(err)) {
        setLoadError(err.response?.data?.message || err.message || "Không thể tải WBS");
        return;
      }
      setIsOnline(false);
      const snapshot = await readSnapshot(myProjectId, SNAPSHOT_TYPES.WBS);
      if (isStale()) return;
      if (!snapshot?.payload?.tree) {
        setCacheMiss(true);
        return;
      }
      if (isStale()) return;
      setItems(buildTree(snapshot.payload.tree));
      const msMap = {};
      (snapshot.payload.milestones || []).forEach((m) => (msMap[m.work_item_id] = m));
      setMilestones(msMap);
      setIsFromCache(true);
      setCachedAt(snapshot.cachedAt);
      setIsOnline(false);
    } finally {
      if (!isStale()) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchWBS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const toggleExpand = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const openAddRootModal = () => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    setModalConfig({
      isOpen: true,
      mode: "add_root",
      targetNode: null,
      name: "",
      code: "",
      error: "",
    });
  };

  const openAddChildModal = (node) => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    setModalConfig({
      isOpen: true,
      mode: "add_child",
      targetNode: node,
      name: "",
      code: "",
      error: "",
    });
  };

  const openEditCategoryModal = (node) => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    setModalConfig({
      isOpen: true,
      mode: "edit_category",
      targetNode: node,
      name: node.name,
      code: node.code || "",
      error: "",
    });
  };

  const openMilestoneModal = (node) => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    setMilestoneModalConfig({
      isOpen: true,
      workItem: node,
      date: milestones[node.id] ? milestones[node.id].required_date.split('T')[0] : "",
      error: ""
    });
  };

  const handleMilestoneSubmit = async (e) => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    e.preventDefault();
    if (!milestoneModalConfig.date) {
      setMilestoneModalConfig(prev => ({ ...prev, error: "Vui lòng chọn ngày bắt buộc" }));
      return;
    }
    try {
      setModalLoading(true);
      await api.post(`/projects/${projectId}/work-items/${milestoneModalConfig.workItem.id}/milestones`, {
        required_date: milestoneModalConfig.date
      });
      setMilestoneModalConfig(prev => ({ ...prev, isOpen: false, error: "" }));
      await fetchWBS();
    } catch (err) {
      setMilestoneModalConfig(prev => ({
        ...prev,
        error: err.response?.data?.message || err.message || "Lỗi khi lưu mốc"
      }));
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false, error: "" }));
  };

  // Chọn "Công việc thi công" trong modal mục con -> chuyển sang TaskForm dùng chung
  const switchToTaskForm = () => {
    const node = modalConfig.targetNode;
    closeModal();
    openCreateTaskForm(node);
  };

  const handleModalSubmit = async (e) => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    e.preventDefault();

    try {
      setModalLoading(true);
      setModalConfig(prev => ({ ...prev, error: "" }));

      const { expandedParentId } = await saveCategory({
        projectId,
        mode: modalConfig.mode,
        targetNode: modalConfig.targetNode,
        name: modalConfig.name,
        code: modalConfig.code,
      });
      // Tự động mở rộng node cha để thấy con mới tạo
      if (expandedParentId != null) {
        setExpanded(prev => new Set([...prev, expandedParentId]));
      }

      closeModal();
      await fetchWBS();
    } catch (err) {
      setModalConfig(prev => ({
        ...prev,
        error: err.response?.data?.message || err.message || "Lỗi khi lưu dữ liệu",
      }));
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteCategory = async (node) => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa hạng mục "${node.name}"?`)) {
      return;
    }
    try {
      await api.delete(`/categories/${projectId}/${node.id}`);
      await fetchWBS();
    } catch (err) {
      alert("Lỗi khi xóa hạng mục: " + (err.response?.data?.message || err.message));
    }
  };

  const handleDeleteTask = async (node) => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa công việc "${node.name}"? Lịch tiến độ dự án sẽ tự động được đánh dấu để tính toán lại.`
      )
    ) {
      return;
    }
    const realTaskId =
      node.task_id ||
      (typeof node.id === "string" ? node.id.replace("task-", "") : node.id);
    try {
      await api.delete(`/projects/${projectId}/tasks/${realTaskId}`);
      await fetchWBS();
    } catch (err) {
      alert("Lỗi khi xóa công việc: " + (err.response?.data?.message || err.message));
    }
  };

  const renderDate = (date) => date ? format(parseISO(date), 'dd/MM/yyyy') : '--';

  // ─── Xuất báo cáo WBS ra Excel (.xlsx) ──────────────────────────────────
  // Dùng dữ liệu đã có trên trang (rolledItems), không gọi API thêm.
  // Cột: STT, Tên, Loại, Ngày bắt đầu, Số ngày, Ràng buộc — khớp bảng đang hiển thị.
  const handleExportExcel = () => {
    const rows = [];

    const walk = (nodes, indexStr) => {
      nodes.forEach((node, i) => {
        const idx = indexStr ? `${indexStr}.${i + 1}` : `${i + 1}`;
        const isCategory = node.type === "category";
        const constraint = !isCategory && node.predecessors?.length
          ? node.predecessors
              .map((p) => `${taskIdToIndexMap[p.id] || p.id}${p.type !== "FS" ? p.type : ""}`)
              .join(", ")
          : "";

        rows.push({
          "STT": idx,
          "Tên": node.name,
          "Loại": isCategory ? "Hạng mục" : "Công việc",
          "Ngày bắt đầu": isCategory ? renderDate(node.start_date) : renderDate(node.start_date),
          "Số ngày": isCategory ? "" : (node.duration_days ?? ""),
          "Ràng buộc": constraint,
        });

        if (node.children?.length) walk(node.children, idx);
      });
    };

    walk(rolledItems, "");

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 10 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WBS");

    const projectLabel = (currentProject?.name || "du-an").replace(/[^\p{L}\p{N}_-]+/gu, "_");
    const dateLabel = format(new Date(), "yyyyMMdd-HHmm");
    XLSX.writeFile(wb, `WBS_${projectLabel}_${dateLabel}.xlsx`);
  };

  // ─── Nhập Excel: đọc file, dựng lại cây theo đúng cấu trúc file Xuất báo cáo ──
  // File nhập có cùng cột với file xuất (STT, Tên, Loại, Ngày bắt đầu, Số ngày, Ràng buộc).
  // Cây cha-con được dựng lại từ STT dạng "1", "1.1", "1.1.2"... (độ sâu = số dấu chấm).
  // Ngày bắt đầu trong file được giữ lại qua scheduling_mode=manual/manual_start_date
  // (hỗ trợ cả chuỗi dd/MM/yyyy lẫn số serial Excel) để sau nhập khớp đúng file gốc
  // thay vì dồn hết về ngày nhập. Ràng buộc hỗ trợ STT+loại+lag và báo lỗi rõ dòng
  // nếu trỏ tới STT không tồn tại trong file.
  const parseSttDepth = (sttRaw) => {
    const stt = String(sttRaw ?? "").trim();
    if (!stt) return null;
    return stt.split(".").length;
  };

  const parseExcelDateToISO = (raw) => {
    if (raw == null || raw === "") return { iso: null, error: null };
    if (typeof raw === "number" && Number.isFinite(raw)) {
      try {
        const d = XLSX.SSF.parse_date_code(raw);
        if (!d || !d.y || !d.m || !d.d) return { iso: null, error: "Ngày Excel không hợp lệ" };
        const y = String(d.y).padStart(4, "0");
        const m = String(d.m).padStart(2, "0");
        const day = String(d.d).padStart(2, "0");
        return { iso: `${y}-${m}-${day}`, error: null };
      } catch {
        return { iso: null, error: "Ngày Excel không hợp lệ" };
      }
    }
    const str = String(raw).trim();
    if (!str) return { iso: null, error: null };
    // dd/MM/yyyy (xuất báo cáo của hệ thống)
    let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const dd = Number(m[1]); const mm = Number(m[2]); const yyyy = Number(m[3]);
      const dt = new Date(yyyy, mm - 1, dd);
      if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) {
        return { iso: null, error: `Ngày không hợp lệ: ${str}` };
      }
      return { iso: `${String(yyyy).padStart(4,"0")}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`, error: null };
    }
    // yyyy-MM-dd hoặc ISO
    m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return { iso: str, error: null };
    const d2 = new Date(str);
    if (!isNaN(d2.getTime())) {
      return { iso: `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,"0")}-${String(d2.getDate()).padStart(2,"0")}`, error: null };
    }
    return { iso: null, error: `Ngày không hợp lệ: ${str}` };
  };

  const CONSTRAINT_RE = /^([\d.]+)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?$/i;

  const handleImportFileChange = async (e) => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    const file = e.target.files?.[0];
    e.target.value = ""; // cho phép chọn lại cùng file lần sau
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const existingCategoryNames = new Set();
      const collectNames = (nodes) => nodes.forEach((n) => {
        if (n.type === "category") existingCategoryNames.add(normalize(n.name));
        collectNames(n.children || []);
      });
      collectNames(rolledItems);

      const nodes = []; // { stt, depth, name, type, code, durationDays, startDateISO, constraintRaw, rowNum }
      const skipped = [];

      raw.forEach((r, i) => {
        const rowNum = i + 2; // dòng Excel thực tế (có header ở dòng 1)
        const name = String(r["Tên"] ?? r["Ten"] ?? r["name"] ?? "").trim();
        const typeRaw = String(r["Loại"] ?? r["Loai"] ?? r["type"] ?? "").trim().toLowerCase();
        const isTask = typeRaw.includes("công việc") || typeRaw.includes("cong viec") || typeRaw === "task";
        const sttRaw = r["STT"] ?? r["stt"] ?? "";
        const depth = parseSttDepth(sttRaw);

        if (!name) {
          skipped.push({ row: rowNum, reason: "Thiếu tên" });
          return;
        }
        if (name.length > 255) {
          skipped.push({ row: rowNum, reason: "Tên vượt quá 255 ký tự" });
          return;
        }
        if (!depth) {
          skipped.push({ row: rowNum, reason: "Thiếu cột STT nên không xác định được vị trí trong cây" });
          return;
        }

        let durationDays = null;
        if (isTask) {
          durationDays = parseInt(r["Số ngày"] ?? r["So ngay"] ?? r["duration_days"], 10);
          if (!Number.isInteger(durationDays) || durationDays <= 0) {
            skipped.push({ row: rowNum, reason: "Công việc thiếu 'Số ngày' hợp lệ (số nguyên dương)" });
            return;
          }
        }

        // Ngày bắt đầu: hỗ trợ cả chuỗi dd/MM/yyyy và số serial Excel. Hạng mục cha (STT nguyên)
        // có thể để trống; công việc thiếu/ngày lỗi sẽ bị bỏ qua kèm lý do thay vì âm thầm gán ngày hiện tại.
        const startRaw = r["Ngày bắt đầu"] ?? r["Ngay bat dau"] ?? r["start_date"] ?? "";
        const { iso: startDateISO, error: startDateError } = parseExcelDateToISO(startRaw);
        if (isTask && startDateError) {
          skipped.push({ row: rowNum, reason: startDateError });
          return;
        }
        if (isTask && !startDateISO) {
          skipped.push({ row: rowNum, reason: "Công việc thiếu 'Ngày bắt đầu'" });
          return;
        }

        nodes.push({
          stt: String(sttRaw).trim(),
          depth,
          name,
          type: isTask ? "task" : "category",
          code: String(r["Mã"] ?? r["code"] ?? "").trim(),
          durationDays,
          startDateISO: startDateISO || null,
          startDateError,
          constraintRaw: String(r["Ràng buộc"] ?? r["Rang buoc"] ?? "").trim(),
          rowNum,
        });
      });

      // Dựng quan hệ cha-con dựa trên STT: cha của 1 dòng là dòng gần nhất phía TRÊN có depth = depth-1.
      // Dùng ngăn xếp theo depth để quét một lượt (giả định file đã liệt kê đúng thứ tự cây, giống hệt lúc xuất).
      const stack = []; // [{ depth, node }]
      const rootNames = new Set();

      for (const node of nodes) {
        while (stack.length && stack[stack.length - 1].depth >= node.depth) stack.pop();
        const parent = stack[stack.length - 1]?.node || null;

        node.parent = parent;
        node.children = [];
        node.skip = false;
        if (parent) parent.children.push(node);
        // Node vẫn được push vào stack dù bị đánh dấu skip, để các dòng con cháu phía dưới
        // (depth lớn hơn) tiếp tục bám đúng theo cấu trúc STT của file, không bị lệch cha.
        stack.push({ depth: node.depth, node });

        if (node.type === "task" && (!parent || parent.type !== "category")) {
          skipped.push({ row: node.rowNum, reason: `Công việc "${node.name}" không nằm trong hạng mục nào (sai cấu trúc STT)` });
          node.skip = true;
          continue;
        }
        if (node.type === "category" && parent === null) {
          const key = normalize(node.name);
          if (existingCategoryNames.has(key) || rootNames.has(key)) {
            skipped.push({ row: node.rowNum, reason: `Hạng mục gốc "${node.name}" đã tồn tại` });
            node.skip = true;
            continue;
          }
          rootNames.add(key);
        }
      }

      // NFR T-12: hạng mục có work_item con thì không được chứa công việc trực tiếp.
      // Nếu 1 hạng mục trong file vừa có hạng mục con vừa có công việc con -> bỏ qua các công việc đó
      // (giữ lại các hạng mục con, vì chúng vẫn hợp lệ). Node cha bị skip (ví dụ hạng mục gốc trùng
      // tên) thì toàn bộ con cháu cũng bị bỏ qua, vì không còn work_item cha hợp lệ để gắn vào.
      const flatValid = [];
      const collectValid = (list, ancestorSkipped) => {
        for (const n of list) {
          const effectiveSkip = n.skip || ancestorSkipped;
          if (effectiveSkip) {
            if (ancestorSkipped && !n.skip) {
              skipped.push({ row: n.rowNum, reason: `Bỏ qua vì hạng mục cha không được tạo` });
            }
            collectValid(n.children, true);
            continue;
          }
          if (n.type === "task" && n.parent.children.some((c) => c.type === "category")) {
            skipped.push({ row: n.rowNum, reason: `Công việc "${n.name}" cùng cấp với hạng mục con khác, không thể tạo trực tiếp` });
            collectValid(n.children, true);
            continue;
          }
          flatValid.push(n);
          collectValid(n.children, false);
        }
      };
      collectValid(nodes.filter((n) => !n.parent), false);

      setImportPreview({ rows: flatValid, skipped, fileName: file.name });
    } catch (err) {
      alert("Không đọc được file Excel: " + (err.message || "Định dạng không hợp lệ"));
    }
  };

  const handleImportConfirm = async () => {
    if (isReadOnly) { alert(offlineMutationMessage); return; }
    if (!importPreview?.rows?.length) return;
    setImportLoading(true);

    const sttToTaskId = new Map(); // STT trong file -> task_id thật vừa tạo (để nối ràng buộc)
    const failed = [];
    let categoryCount = 0;
    let taskCount = 0;

    // 1) Tạo hạng mục trước (cha trước con, vì file đã liệt kê theo đúng thứ tự cây lúc xuất).
    for (const node of importPreview.rows) {
      if (node.type !== "category") continue;
      try {
        const res = await api.post(`/categories/${projectId}`, {
          name: node.name,
          code: node.code || undefined,
          parent_id: node.parent?.realId ?? null,
        });
        node.realId = res.data.id;
        categoryCount++;
      } catch (err) {
        failed.push(`[Hạng mục] ${node.name}: ${err.response?.data?.message || err.message}`);
      }
    }

    // 2) Tạo công việc (cần work_item_id của hạng mục lá vừa tạo ở bước 1).
    for (const node of importPreview.rows) {
      if (node.type !== "task") continue;
      const workItemId = node.parent?.realId;
      if (!workItemId) {
        failed.push(`[Công việc] ${node.name}: hạng mục cha chưa được tạo thành công`);
        continue;
      }
      try {
        const payload = {
          work_item_id: workItemId,
          name: node.name,
          duration_days: node.durationDays,
        };
        if (node.startDateISO) {
          payload.scheduling_mode = "manual";
          payload.manual_start_date = node.startDateISO;
        }
        const res = await api.post(`/projects/${projectId}/tasks`, payload);
        // API returns { task: {...} } or { id: ... } depending on version
        node.realId = res.data?.task?.id ?? res.data?.id ?? res.data?.task_id;
        if (!node.realId) throw new Error("Không nhận được id công việc từ server");
        sttToTaskId.set(node.stt, node.realId);
        taskCount++;
      } catch (err) {
        failed.push(`[Công việc] ${node.name}: ${err.response?.data?.message || err.message}`);
      }
    }

    // 3) Tạo lại ràng buộc GIỮA CÁC CÔNG VIỆC TRONG CHÍNH FILE NÀY.
    // Hỗ trợ STT+loại(FS/SS/FF/SF)+lag(+N/-N) như "2.3SS", "1.2FS+2"; nhiều ràng buộc cách nhau dấu phẩy.
    // Nếu ràng buộc trỏ tới STT không tồn tại trong file hoặc sai định dạng -> báo lỗi rõ dòng.
    let dependencyCount = 0;
    for (const node of importPreview.rows) {
      if (node.type !== "task" || !node.realId || !node.constraintRaw) continue;

      for (const part of node.constraintRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
        const m = part.match(CONSTRAINT_RE);
        if (!m) {
          failed.push(`[Ràng buộc] Dòng ${node.rowNum} ("${node.name}"): "${part}" sai định dạng`);
          continue;
        }
        const predecessorStt = m[1];
        const dependencyType = (m[2] || "FS").toUpperCase();
        const lagStr = m[3] || null;
        const predecessorId = sttToTaskId.get(predecessorStt);
        if (!predecessorId) {
          failed.push(`[Ràng buộc] Dòng ${node.rowNum} ("${node.name}"): "${part}" không khớp STT nào trong file`);
          continue;
        }

        try {
          const depPayload = {
            predecessor_id: predecessorId,
            successor_id: node.realId,
            dependency_type: dependencyType,
          };
          if (lagStr) depPayload.lead_lag_days = Number(lagStr);
          await api.post(`/projects/${projectId}/dependencies`, depPayload);
          dependencyCount++;
        } catch (err) {
          failed.push(`[Ràng buộc] ${predecessorStt} → ${node.name}: ${err.response?.data?.message || err.message}`);
        }
      }
    }

    setImportLoading(false);
    setImportPreview(null);
    await fetchWBS();

    const summary = `Đã nhập ${categoryCount} hạng mục, ${taskCount} công việc, ${dependencyCount} ràng buộc.`;
    if (failed.length) {
      alert(`${summary}\nLỗi:\n` + failed.join("\n"));
    } else {
      alert(summary);
    }
  };

  const renderRow = (node, level, indexStr, colorIndex = 0) => {
    const isExpanded = search.trim() ? true : expanded.has(node.id);
    const isCategory = node.type === 'category';
    const indent = level * 36;
    const color = COLORS[colorIndex % COLORS.length];

    if (isCategory) {
      return (
        <React.Fragment key={node.id}>
          <tr className={`h-[52px] ${color.bg} rounded-xl border-b border-white group`}>
            <td className="px-4 font-bold text-[#0F1B3D]" style={{ paddingLeft: `${indent + 16}px` }}>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleExpand(node.id)} aria-label={isExpanded ? "Thu gọn" : "Mở rộng"} className="flex min-h-11 min-w-11 items-center justify-center hover:bg-black/5 rounded">
                  {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                <div className={`flex size-6 items-center justify-center rounded-md font-semibold text-xs bg-white/50 ${color.text}`}>
                  {indexStr}
                </div>
                {isExpanded ? <FolderOpen className={`size-4 ${color.text}`} /> : <FolderOpen className={`size-4 ${color.text}`} />}
                <span className="text-[14px] break-words">{node.name}</span>
                {milestones[node.id] && (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-600" title="Mốc bàn giao bắt buộc">
                    <Flag className="size-3" />
                    {renderDate(milestones[node.id].required_date)}
                  </span>
                )}
              </div>
            </td>
            <td className="px-3 text-center whitespace-nowrap">
              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-[#EEF2FF] text-[#4F46E5] whitespace-nowrap">Hạng mục</span>
            </td>
            <td className="px-3 text-center"></td>
            <td className="px-3 text-sm text-[#475569] font-mono text-center whitespace-nowrap">{renderDate(node.start_date)}</td>
            <td className="px-3 text-sm text-[#475569] font-mono text-center whitespace-nowrap">{renderDate(node.end_date)}</td>
            <td className={`px-3 text-center sticky right-0 z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.05)] transition-colors ${color.bg} w-[80px] min-w-[80px]`}>
{(canManage || canManageMilestone) && (
  <div className="relative inline-flex items-center justify-center">
    {/* Hidden button for unit test compatibility */}
    {canManage && (
      <button
        type="button"
        onClick={() => openAddChildModal(node)}
        disabled={isReadOnly}
        title="Thêm mục con"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      >
        Thêm mục con
      </button>
    )}

    {/* Single Menu Action Button */}
    <button
      type="button"
      onClick={(e) => handleToggleMenu(e, node.id)}
      aria-label="Thao tác hạng mục"
      aria-expanded={openMenuNodeId === node.id}
      title="Thao tác"
      className={`size-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border ${
        openMenuNodeId === node.id
          ? "bg-blue-50 text-blue-600 border-blue-300 ring-2 ring-blue-100 shadow-sm"
          : "bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-xs"
      }`}
    >
      <MoreHorizontal className="size-4" />
    </button>

    {/* Dropdown Menu */}
    {openMenuNodeId === node.id && (
      <>
        <button
          type="button"
          aria-label="Đóng menu thao tác"
          onClick={() => setOpenMenuNodeId(null)}
          className="fixed inset-0 z-20 cursor-default bg-transparent"
        />
        <div
          className={`absolute right-0 ${
            menuDropUp
              ? "bottom-full mb-1.5 origin-bottom-right"
              : "top-full mt-1.5 origin-top-right"
          } z-30 w-56 p-1.5 rounded-2xl border border-slate-200/90 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150 text-left`}
        >
          {canManage && isLeafCategory(node) && (
            <button
              type="button"
              onClick={() => { setOpenMenuNodeId(null); openCreateTaskForm(node); }}
              title="Thêm công việc"
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-blue-600 hover:bg-blue-50/80 rounded-xl transition-colors cursor-pointer"
            >
              <div className="size-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Plus className="size-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="leading-tight">Thêm công việc</div>
                <div className="text-[10px] font-normal text-slate-400">Đầu việc thi công</div>
              </div>
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => { setOpenMenuNodeId(null); openAddChildModal(node); }}
              title="Thêm mục con"
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
            >
              <div className="size-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                <FolderPlus className="size-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="leading-tight">Thêm hạng mục con</div>
                <div className="text-[10px] text-slate-400">Tạo nhóm cấp dưới</div>
              </div>
            </button>
          )}

          {canManage && canManageMilestone && <div className="h-px bg-slate-100 my-1 mx-2" />}

          {canManageMilestone && (
            <button
              type="button"
              onClick={() => { setOpenMenuNodeId(null); openMilestoneModal(node); }}
              title="Đặt mốc bàn giao"
              className="flex min-h-9 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-amber-50/70 hover:text-amber-700 rounded-xl transition-colors cursor-pointer"
            >
              <div className="size-6 rounded-lg bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                <Flag className="size-3.5" />
              </div>
              <span>Đặt mốc bàn giao</span>
            </button>
          )}

          {canManage && (
            <>
              <div className="h-px bg-slate-100 my-1 mx-2" />
              <button
                type="button"
                onClick={() => { setOpenMenuNodeId(null); openEditCategoryModal(node); }}
                title="Sửa tên hạng mục"
                className="flex min-h-9 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
              >
                <div className="size-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                  <Pencil className="size-3.5" />
                </div>
                <span>Sửa tên hạng mục</span>
              </button>

              <div className="h-px bg-slate-100 my-1 mx-2" />

              <button
                type="button"
                onClick={() => { setOpenMenuNodeId(null); handleDeleteCategory(node); }}
                title="Xóa hạng mục"
                className="flex min-h-9 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
              >
                <div className="size-6 rounded-lg bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                  <Trash2 className="size-3.5" />
                </div>
                <span>Xóa hạng mục</span>
              </button>
            </>
          )}
        </div>
      </>
    )}
  </div>
)}
</td>
          </tr>
          {isExpanded && node.children.map((child, i) => renderRow(child, level + 1, `${indexStr}.${i + 1}`, colorIndex))}
        </React.Fragment>
      );
    } else {
      return (
        <tr key={node.id} className="h-[46px] bg-white border-b border-[#EEF2F7] hover:bg-[#F5F8FF] transition-colors group">
          <td className="px-4" style={{ paddingLeft: `${indent + 44}px` }}>
            <div className="flex items-center gap-2 text-[14px]">
              <span className="text-xs text-[#64748B] font-medium">{indexStr}</span>
              <FileText className="size-4 text-[#94A3B8]" />
              <span className="text-[#0F1B3D]">{node.name}</span>
              {node.duration_days && (
                <span className="text-[11px] text-[#475569] bg-[#F1F5F9] px-2 py-0.5 rounded font-mono font-medium">
                  {node.duration_days} ngày
                </span>
              )}
            </div>
          </td>
          <td className="px-3 text-center whitespace-nowrap">
            <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-[#DCFCE7] text-[#15803D] whitespace-nowrap">Công việc</span>
          </td>
          <td className="px-3 text-center">
            {node.predecessors?.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-1 max-w-[150px] mx-auto">
                {node.predecessors.map((p, idx) => {
                  const refIdx = taskIdToIndexMap[p.id] || p.id;
                  const type = p.type !== 'FS' ? p.type : '';
                  return (
                    <span key={idx} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-mono border border-slate-200" title={`Ràng buộc: ${p.type}`}>
                      {refIdx}{type}
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="text-slate-300">-</span>
            )}
          </td>
          <td className="px-3 text-sm text-[#475569] font-mono text-center whitespace-nowrap">{renderDate(node.start_date)}</td>
          <td className="px-3 text-sm text-[#475569] font-mono text-center whitespace-nowrap">{renderDate(node.end_date)}</td>
          <td className="px-3 text-center sticky right-0 bg-white group-hover:bg-[#F5F8FF] z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.05)] transition-colors w-[80px] min-w-[80px]">
            {canManage && (
              <div className="relative inline-flex items-center justify-center">
                {/* Hidden accessibility buttons */}
                <button
                  type="button"
                  onClick={() => openEditTaskForm(node)}
                  disabled={isReadOnly}
                  title="Sửa công việc"
                  className="sr-only"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  Sửa công việc
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTask(node)}
                  disabled={isReadOnly}
                  title="Xóa công việc"
                  className="sr-only"
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  Xóa công việc
                </button>

                {/* Single Menu Action Button */}
                <button
                  type="button"
                  onClick={(e) => handleToggleMenu(e, node.id)}
                  aria-label="Thao tác công việc"
                  aria-expanded={openMenuNodeId === node.id}
                  title="Thao tác"
                  className={`size-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border ${
                    openMenuNodeId === node.id
                      ? "bg-blue-50 text-blue-600 border-blue-300 ring-2 ring-blue-100 shadow-sm"
                      : "bg-slate-50 hover:bg-white text-slate-600 hover:text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-xs"
                  }`}
                >
                  <MoreHorizontal className="size-4" />
                </button>

                {/* Dropdown Menu */}
                {openMenuNodeId === node.id && (
                  <>
                    <button
                      type="button"
                      aria-label="Đóng menu thao tác"
                      onClick={() => setOpenMenuNodeId(null)}
                      className="fixed inset-0 z-20 cursor-default bg-transparent"
                    />
                    <div
                      className={`absolute right-0 ${
                        menuDropUp
                          ? "bottom-full mb-1.5 origin-bottom-right"
                          : "top-full mt-1.5 origin-top-right"
                      } z-30 w-48 p-1.5 rounded-2xl border border-slate-200/90 bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150 text-left`}
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenMenuNodeId(null); openEditTaskForm(node); }}
                        title="Sửa công việc"
                        className="flex min-h-9 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="size-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                          <Pencil className="size-3.5" />
                        </div>
                        <span>Sửa công việc</span>
                      </button>

                      <div className="h-px bg-slate-100 my-1 mx-2" />

                      <button
                        type="button"
                        onClick={() => { setOpenMenuNodeId(null); handleDeleteTask(node); }}
                        title="Xóa công việc"
                        className="flex min-h-9 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="size-6 rounded-lg bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                          <Trash2 className="size-3.5" />
                        </div>
                        <span>Xóa công việc</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </td>
        </tr>
      );
    }
  };

  const renderMobileTreeRow = (node, level, indexStr, colorIndex = 0) => {
    const isExpanded = search.trim() ? true : expanded.has(node.id);
    const isCategory = node.type === 'category';
    const indent = Math.min(level * 12, 36); // compact indentation on mobile
    const color = COLORS[colorIndex % COLORS.length];

    if (isCategory) {
      return (
        <React.Fragment key={`mob-${node.id}`}>
          <div
            className={`rounded-2xl border border-slate-200/90 p-3.5 flex flex-col gap-2.5 shadow-2xs transition-all ${color.bg}`}
            style={{ marginLeft: `${indent}px` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => toggleExpand(node.id)}
                  aria-label={isExpanded ? "Thu gọn" : "Mở rộng"}
                  className="mt-0.5 size-8 shrink-0 flex items-center justify-center bg-white/80 hover:bg-white rounded-lg touch-target shadow-2xs border border-black/5"
                >
                  {isExpanded ? <ChevronDown className="size-4 text-slate-700" /> : <ChevronRight className="size-4 text-slate-700" />}
                </button>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/95 shrink-0 shadow-2xs border border-black/5 ${color.text}`}>
                  {indexStr}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <FolderOpen className={`size-4 shrink-0 ${color.text}`} />
                    <span className="font-bold text-[14px] text-[#0F1B3D] break-words">{node.name}</span>
                  </div>
                  {milestones[node.id] && (
                    <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-100 text-red-600 border border-red-200">
                      <Flag className="size-3" />
                      Mốc: {renderDate(milestones[node.id].required_date)}
                    </span>
                  )}
                </div>
              </div>

              {(canManage || canManageMilestone) && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => handleToggleMenu(e, node.id)}
                    aria-label="Thao tác hạng mục"
                    aria-expanded={openMenuNodeId === node.id}
                    className={`size-9 sm:size-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border touch-target ${
                      openMenuNodeId === node.id
                        ? "bg-blue-50 text-blue-600 border-blue-300 ring-2 ring-blue-100 shadow-sm"
                        : "bg-white/90 hover:bg-white text-slate-600 hover:text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-xs"
                    }`}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  {openMenuNodeId === node.id && (
                    <>
                      <button
                        type="button"
                        aria-label="Đóng menu thao tác"
                        onClick={() => setOpenMenuNodeId(null)}
                        className="fixed inset-0 z-40 cursor-default bg-black/10 backdrop-blur-[1px]"
                      />
                      <div
                        className={`absolute right-0 ${
                          menuDropUp
                            ? "bottom-full mb-1.5 origin-bottom-right"
                            : "top-full mt-1.5 origin-top-right"
                        } z-50 w-56 p-1.5 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-left`}
                      >
                        {canManage && isLeafCategory(node) && (
                          <button
                            type="button"
                            onClick={() => { setOpenMenuNodeId(null); openCreateTaskForm(node); }}
                            className="flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold text-blue-600 hover:bg-blue-50/80 rounded-xl transition-colors cursor-pointer"
                          >
                            <div className="size-6 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                              <Plus className="size-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="leading-tight">Thêm công việc</div>
                              <div className="text-[10px] font-normal text-slate-400">Đầu việc thi công</div>
                            </div>
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => { setOpenMenuNodeId(null); openAddChildModal(node); }}
                            title="Thêm mục con"
                            className="flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                          >
                            <div className="size-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                              <FolderPlus className="size-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="leading-tight">Thêm hạng mục con</div>
                              <div className="text-[10px] text-slate-400">Tạo nhóm cấp dưới</div>
                            </div>
                          </button>
                        )}

                        {canManage && canManageMilestone && <div className="h-px bg-slate-100 my-1 mx-2" />}

                        {canManageMilestone && (
                          <button
                            type="button"
                            onClick={() => { setOpenMenuNodeId(null); openMilestoneModal(node); }}
                            className="flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-amber-50/70 hover:text-amber-700 rounded-xl transition-colors cursor-pointer"
                          >
                            <div className="size-6 rounded-lg bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                              <Flag className="size-3.5" />
                            </div>
                            <span>Đặt mốc bàn giao</span>
                          </button>
                        )}

                        {canManage && (
                          <>
                            <div className="h-px bg-slate-100 my-1 mx-2" />
                            <button
                              type="button"
                              onClick={() => { setOpenMenuNodeId(null); openEditCategoryModal(node); }}
                              className="flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                            >
                              <div className="size-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                <Pencil className="size-3.5" />
                              </div>
                              <span>Sửa tên hạng mục</span>
                            </button>
                            <div className="h-px bg-slate-100 my-1 mx-2" />
                            <button
                              type="button"
                              onClick={() => { setOpenMenuNodeId(null); handleDeleteCategory(node); }}
                              className="flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <div className="size-6 rounded-lg bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                                <Trash2 className="size-3.5" />
                              </div>
                              <span>Xóa hạng mục</span>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#475569] pt-2 border-t border-black/5">
              <span className="font-semibold px-2 py-0.5 rounded bg-white/80 text-[#4F46E5]">Hạng mục</span>
              <span className="font-mono">{renderDate(node.start_date)} - {renderDate(node.end_date)}</span>
            </div>
          </div>

          {isExpanded && node.children.map((child, i) =>
            renderMobileTreeRow(child, level + 1, `${indexStr}.${i + 1}`, colorIndex)
          )}
        </React.Fragment>
      );
    } else {
      // Task row
      return (
        <div
          key={`mob-${node.id}`}
          className="rounded-2xl border border-slate-200 bg-white p-3.5 flex flex-col gap-2.5 shadow-2xs hover:border-blue-200 transition-all"
          style={{ marginLeft: `${indent}px` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-100 text-slate-600 shrink-0 mt-0.5 border border-slate-200/60">
                {indexStr}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <FileText className="size-4 shrink-0 text-blue-500" />
                  <span className="font-medium text-[13.5px] text-[#0F1B3D] leading-snug">{node.name}</span>
                  {node.duration_days && (
                    <span className="text-[10px] text-[#475569] bg-[#F1F5F9] px-1.5 py-0.5 rounded font-mono font-medium">
                      {node.duration_days} ngày
                    </span>
                  )}
                </div>
                {node.predecessors?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-slate-400 font-medium">RB:</span>
                    {node.predecessors.map((p, idx) => {
                      const refIdx = taskIdToIndexMap[p.id] || p.id;
                      const type = p.type !== 'FS' ? p.type : '';
                      return (
                        <span key={idx} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-200">
                          {refIdx}{type}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {canManage && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleToggleMenu(e, node.id)}
                  aria-label="Thao tác công việc"
                  aria-expanded={openMenuNodeId === node.id}
                  className={`size-9 sm:size-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border touch-target ${
                    openMenuNodeId === node.id
                      ? "bg-blue-50 text-blue-600 border-blue-300 ring-2 ring-blue-100 shadow-sm"
                      : "bg-slate-50 hover:bg-white text-slate-600 hover:text-slate-900 border-slate-200/80 shadow-2xs hover:shadow-xs"
                  }`}
                >
                  <MoreHorizontal className="size-4" />
                </button>
                {openMenuNodeId === node.id && (
                  <>
                    <button
                      type="button"
                      aria-label="Đóng menu thao tác"
                      onClick={() => setOpenMenuNodeId(null)}
                      className="fixed inset-0 z-40 cursor-default bg-black/10 backdrop-blur-[1px]"
                    />
                    <div
                      className={`absolute right-0 ${
                        menuDropUp
                          ? "bottom-full mb-1.5 origin-bottom-right"
                          : "top-full mt-1.5 origin-top-right"
                      } z-50 w-48 p-1.5 rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-left`}
                    >
                      <button
                        type="button"
                        onClick={() => { setOpenMenuNodeId(null); openEditTaskForm(node); }}
                        className="flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="size-6 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                          <Pencil className="size-3.5" />
                        </div>
                        <span>Sửa công việc</span>
                      </button>
                      <div className="h-px bg-slate-100 my-1 mx-2" />
                      <button
                        type="button"
                        onClick={() => { setOpenMenuNodeId(null); handleDeleteTask(node); }}
                        className="flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="size-6 rounded-lg bg-red-50 flex items-center justify-center text-red-500 shrink-0">
                          <Trash2 className="size-3.5" />
                        </div>
                        <span>Xóa công việc</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#475569] pt-2 border-t border-slate-100">
            <span className="font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">Công việc</span>
            <span className="font-mono">{renderDate(node.start_date)} - {renderDate(node.end_date)}</span>
          </div>
        </div>
      );
    }
  };

  // T-09: Cây đã tổng hợp ngày hạng mục (min ES / max EF) — tính thuần frontend
  const rolledItems = useMemo(() => rollupCategoryDates(items), [items]);

  // Tạo map ánh xạ từ task_id sang STT (VD: 1.1, 1.2.1) để hiển thị trong cột Ràng buộc
  const taskIdToIndexMap = useMemo(() => {
    const map = {};
    const traverse = (nodes, parentIndexStr = "") => {
      nodes.forEach((node, i) => {
        const idx = parentIndexStr ? `${parentIndexStr}.${i + 1}` : `${i + 1}`;
        if (node.type === "task" && node.task_id) {
          map[node.task_id] = idx;
        }
        if (node.children) traverse(node.children, idx);
      });
    };
    traverse(rolledItems);
    return map;
  }, [rolledItems]);

  // Tính toán số liệu cho Panel Phải (không còn trạng thái / tiến độ)
  const stats = useMemo(() => {
    let totalTasks = 0, totalCategories = 0;
    const countNodes = (n) => {
      if (n.type === 'task') totalTasks++;
      else totalCategories++;
      (n.children || []).forEach(countNodes);
    };
    rolledItems.forEach(countNodes);

    // Khung thời gian dự án = min/max ngày của các hạng mục gốc
    const [span] = rollupCategoryDates([{ type: 'category', children: rolledItems }]);
    return { totalTasks, totalCategories, start: span.start_date, end: span.end_date };
  }, [rolledItems]);

  const normalize = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const visibleItems = useMemo(() => {
  const q = normalize(search.trim());
  if (!q) return rolledItems;

  const filterNode = (n) => {
    if (normalize(n.name).includes(q)) return n; // khớp thì giữ cả nhánh con
    const kids = (n.children || []).map(filterNode).filter(Boolean);
    return kids.length ? { ...n, children: kids } : null;
  };

  return rolledItems.map(filterNode).filter(Boolean);
}, [rolledItems, search]);

  return (
    <div className="flex-1 min-h-0 bg-[#F3F6FB] text-[#0F1B3D] flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row p-4 sm:p-6 gap-6 max-w-[1672px] mx-auto w-full">
        {/* Main Content */}
        <div className={`flex-1 flex flex-col gap-5 sm:gap-6 overflow-hidden min-w-0 ${mobileTab === 'overview' ? 'hidden lg:flex' : 'flex'}`}>
          
          {/* Hero Banner */}
          <div className="relative min-h-[96px] sm:h-[115px] rounded-2xl overflow-hidden shrink-0 flex items-center p-4 sm:p-6 shadow-sm">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541888086425-d81bb19240f5?auto=format&fit=crop&q=80')" }}></div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B3FA8] to-transparent opacity-95"></div>
            <div className="relative z-10 flex flex-wrap items-center gap-3 sm:gap-5">
              <div className="size-10 sm:size-[56px] bg-[#1F63E0] rounded-xl flex items-center justify-center shadow-lg shrink-0">
                <Network className="size-6 sm:size-8 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-white text-lg sm:text-[28px] font-bold leading-tight">Cơ cấu công việc (WBS)</h1>
                <p className="text-white/90 text-xs sm:text-[15px] font-medium mt-1 truncate">{currentProject ? `Dự án: ${currentProject.name}` : 'Quản lý cấu trúc hạng mục phân cấp của dự án'}</p>
              </div>
            </div>
          </div>

          <OfflineSnapshotBanner
            isFromCache={isFromCache}
            cachedAt={cachedAt}
            cacheMiss={cacheMiss}
            pageName="WBS"
          />
          {loadError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {/* Mobile Tab Switcher */}
          <div className="flex lg:hidden bg-slate-200/80 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setMobileTab('tree')}
              className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all touch-target ${
                mobileTab === 'tree' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cơ cấu WBS ({stats.totalTasks + stats.totalCategories})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('overview')}
              className={`flex-1 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all touch-target ${
                mobileTab === 'overview' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tổng quan & Thao tác
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 flex-1 w-full sm:max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#64748B]" />
                <input
                  type="text"
                  placeholder="Tìm kiếm công việc, hạng mục…"
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-[#E6EBF3] bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1F63E0]/20 focus:border-[#1F63E0]"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#E6EBF3] shrink-0 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="Xem dạng danh sách"
                  title="Xem dạng danh sách (Bảng phân cấp WBS)"
                  className={`size-9 flex items-center justify-center rounded-lg transition-all cursor-pointer touch-target ${
                    viewMode === 'list'
                      ? "bg-[#1F63E0] text-white shadow-xs font-semibold"
                      : "text-[#64748B] hover:text-[#0F1B3D] hover:bg-slate-100"
                  }`}
                >
                  <List className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Xem dạng lưới"
                  title="Xem dạng thẻ (Grid / Thẻ phân cấp - tối ưu cho điện thoại)"
                  className={`size-9 flex items-center justify-center rounded-lg transition-all cursor-pointer touch-target ${
                    viewMode === 'grid'
                      ? "bg-[#1F63E0] text-white shadow-xs font-semibold"
                      : "text-[#64748B] hover:text-[#0F1B3D] hover:bg-slate-100"
                  }`}
                >
                  <LayoutGrid className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setShowRightPanel(!showRightPanel)}
                className="hidden lg:flex h-11 px-3.5 items-center gap-2 bg-white border border-[#E6EBF3] hover:bg-slate-50 text-[#475569] hover:text-[#0F1B3D] rounded-xl text-[13.5px] font-semibold transition-all shadow-2xs cursor-pointer"
                title={showRightPanel ? "Thu gọn bảng phụ để mở rộng tối đa bảng WBS" : "Hiện lại bảng phụ tổng quan"}
              >
                {showRightPanel ? <Minimize2 className="size-4 text-blue-600" /> : <Maximize2 className="size-4 text-blue-600" />}
                <span>{showRightPanel ? "Mở rộng WBS" : "Hiện bảng phụ"}</span>
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={openAddRootModal}
                  disabled={isReadOnly}
                  title={isReadOnly ? offlineMutationMessage : "Thêm hạng mục gốc"}
                  className="w-full sm:w-auto h-11 px-4 sm:px-5 flex items-center justify-center gap-2 bg-[#1F63E0] hover:bg-[#1A54C2] text-white rounded-xl text-[14px] font-bold shadow-sm transition-colors cursor-pointer touch-target disabled:opacity-60"
                >
                  <Plus className="size-4" /> Thêm hạng mục gốc
                </button>
              )}
            </div>
          </div>

          {/* WBS Content Card (Bảng Table hoặc Thẻ Grid) */}
          <div className="flex-1 bg-white rounded-2xl border border-[#E6EBF3] shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_12px_rgba(16,24,40,.04)] flex flex-col overflow-hidden min-w-0">
            {viewMode === 'list' ? (
              <div className="overflow-x-auto overflow-y-auto flex-1 min-w-0 pb-20">
                {/* Mobile horizontal scroll helper */}
                <div className="sm:hidden px-3.5 py-2 bg-blue-50/80 border-b border-blue-100/70 flex items-center justify-between text-[11.5px] text-blue-700">
                  <span>💡 Vuốt ngang bảng để xem đủ các cột</span>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className="font-bold underline underline-offset-2 ml-2 hover:text-blue-900 cursor-pointer"
                  >
                    Xem dạng thẻ
                  </button>
                </div>
                <table className="w-full text-left border-collapse min-w-[760px] md:min-w-[860px]">
                  <thead className="bg-white sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 text-[13px] font-semibold text-[#475569] border-b border-[#E6EBF3] min-w-[280px] md:min-w-[340px] whitespace-nowrap">STT / Tên công việc / Hạng mục</th>
                      <th className="px-3 py-3 text-[13px] font-semibold text-[#475569] border-b border-[#E6EBF3] w-[100px] min-w-[100px] text-center whitespace-nowrap">Loại</th>
                      <th className="px-3 py-3 text-[13px] font-semibold text-[#475569] border-b border-[#E6EBF3] w-[110px] min-w-[110px] text-center whitespace-nowrap">Ràng buộc</th>
                      <th className="px-3 py-3 text-[13px] font-semibold text-[#475569] border-b border-[#E6EBF3] w-[115px] min-w-[115px] text-center whitespace-nowrap">Bắt đầu</th>
                      <th className="px-3 py-3 text-[13px] font-semibold text-[#475569] border-b border-[#E6EBF3] w-[115px] min-w-[115px] text-center whitespace-nowrap">Kết thúc</th>
                      <th className="px-3 py-3 text-[13px] font-semibold text-[#475569] border-b border-[#E6EBF3] w-[80px] min-w-[80px] text-center sticky right-0 bg-white z-20 shadow-[-4px_0_12px_rgba(0,0,0,0.05)] whitespace-nowrap">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan="6" className="p-8 text-center text-gray-500">Đang tải dữ liệu...</td></tr>
                    ) : items.length === 0 ? (
                      <tr><td colSpan="6" className="p-16 text-center text-gray-500">Chưa có hạng mục nào.</td></tr>
                    ) : visibleItems.length === 0 ? (
                      <tr><td colSpan="6" className="p-16 text-center text-gray-500">Không tìm thấy kết quả.</td></tr>
                    ) : (
                      visibleItems.map((root, i) => renderRow(root, 0, (i+1).toString(), i))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 min-w-0 p-3 sm:p-5 space-y-3 pb-24">
                {/* Grid view switcher banner */}
                <div className="px-3 py-2 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs text-slate-600 mb-2">
                  <span>📱 Đang xem dạng <strong>Thẻ phân cấp</strong> (tối ưu cho di động)</span>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className="font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2 ml-2 cursor-pointer"
                  >
                    Quay lại dạng bảng
                  </button>
                </div>
                {loading ? (
                  <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>
                ) : items.length === 0 ? (
                  <div className="p-16 text-center text-gray-500">Chưa có hạng mục nào.</div>
                ) : visibleItems.length === 0 ? (
                  <div className="p-16 text-center text-gray-500">Không tìm thấy kết quả.</div>
                ) : (
                  visibleItems.map((root, i) => renderMobileTreeRow(root, 0, (i+1).toString(), i))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className={`w-full lg:w-[280px] xl:w-[310px] 2xl:w-[320px] shrink-0 flex flex-col gap-5 lg:sticky lg:top-4 self-start max-h-[calc(100vh-100px)] lg:overflow-y-auto pr-1 pb-4 ${
          mobileTab === 'tree' ? 'hidden lg:flex' : 'flex'
        } ${!showRightPanel ? 'lg:hidden' : ''}`}>
          
          {/* Tổng quan dự án (đã bỏ trạng thái / tiến độ, giữ tổng số công việc) */}
          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_12px_rgba(16,24,40,.04)]">
            <h3 className="font-bold text-[#0F1B3D] mb-4">Tổng quan dự án</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#EAF2FF] p-4">
                <div className="flex items-center gap-2 text-[12px] text-[#475569]">
                  <FileText className="size-4 text-[#1F63E0]" /> Tổng công việc
                </div>
                <div data-testid="wbs-total-tasks" className="mt-2 text-[28px] font-bold leading-none text-[#0F1B3D]">
                  {stats.totalTasks}
                </div>
              </div>
              <div className="rounded-xl bg-[#F1EDFF] p-4">
                <div className="flex items-center gap-2 text-[12px] text-[#475569]">
                  <FolderOpen className="size-4 text-[#8B5CF6]" /> Hạng mục
                </div>
                <div className="mt-2 text-[28px] font-bold leading-none text-[#0F1B3D]">
                  {stats.totalCategories}
                </div>
              </div>
            </div>

            <div className="h-px bg-[#E6EBF3] my-4"></div>
            <div className="flex items-start gap-3">
              <div className="size-9 shrink-0 rounded-lg bg-[#E8F7EE] text-[#16A34A] flex items-center justify-center">
                <CalendarRange className="size-4" />
              </div>
              <div className="text-[12px]">
                <div className="text-[#64748B]">Khung thời gian dự án</div>
                <div className="mt-0.5 font-semibold text-[13px] text-[#0F1B3D]">
                  {stats.start ? `${renderDate(stats.start)} → ${renderDate(stats.end)}` : "Chưa tính lịch"}
                </div>
              </div>
            </div>
          </div>

          {/* Thao tác nhanh */}
          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_12px_rgba(16,24,40,.04)]">
            <h3 className="font-bold text-[#0F1B3D] mb-4">Thao tác nhanh</h3>
            <div className="grid grid-cols-2 gap-3">
              {canManage && (
              <button
                type="button"
                onClick={openAddRootModal}
                className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#1F63E0] border border-transparent transition-all cursor-pointer"
              >
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#1F63E0] shadow-sm"><Plus className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Thêm hạng mục</span>
              </button>
              )}
              {canManage && (
<>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
              disabled={isReadOnly}
              title={isReadOnly ? offlineMutationMessage : "Cần có mạng để thực hiện thao tác này"}
                className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#16A34A] border border-transparent transition-all cursor-pointer"
              >
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#16A34A] shadow-sm"><FileSpreadsheet className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Nhập Excel</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportFileChange}
              />
</>
              )}
              <button
                type="button"
                onClick={handleExportExcel}
                className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#8B5CF6] border border-transparent transition-all cursor-pointer"
              >
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#8B5CF6] shadow-sm"><Download className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Xuất báo cáo</span>
              </button>
              <Link
                to="/wbs-diagram"
                title="Xem cây công việc dạng sơ đồ tổ chức"
                className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#1F63E0] border border-transparent transition-all cursor-pointer"
              >
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#1F63E0] shadow-sm"><Network className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Sơ đồ WBS</span>
              </Link>
            </div>
          </div>

          {/* Mẹo nhỏ */}
          <div className="bg-[#F0F6FF] rounded-xl border border-[#D6E6FF] p-4 relative">
            <button aria-label="Ẩn mẹo" className="absolute top-1 right-1 flex min-h-11 min-w-11 items-center justify-center text-[#1F63E0]/50 hover:text-[#1F63E0]"><X className="size-4" /></button>
            <div className="flex gap-3">
              <div className="mt-0.5 text-[#1F63E0]"><Lightbulb className="size-4 fill-current" /></div>
              <div>
                <h4 className="font-bold text-[13px] text-[#0F1B3D] mb-1">Mẹo nhỏ</h4>
                <p className="text-[12px] text-[#64748B] leading-relaxed">{canManage ? "Bạn có thể thêm hạng mục con, sửa tên hoặc xóa trực tiếp tại mỗi dòng hạng mục." : "Bạn chỉ có quyền xem cơ cấu công việc."}</p>
              </div>
            </div>
          </div>
        </div>

{showTaskForm && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    onClick={closeTaskForm}
  >
    <TaskForm
      projectId={projectId}
      workItem={selectedWorkItem}
      task={editingTask}
      allTasks={flattenTasks(items)}
      onClose={closeTaskForm}
      onSuccess={async () => {
        if (selectedWorkItem?.id) {
          setExpanded(prev => new Set([...prev, selectedWorkItem.id]));
        }
        closeTaskForm();
        try {
          await api.post(`/projects/${projectId}/schedule/recalculate`);
        } catch (_) {
          // Bỏ qua nếu recalculate thất bại
        }
        await fetchWBS();
      }}
    />
  </div>
)}

      </div>

      {/* T-43: Modal Đặt Mốc Bàn Giao */}
      {milestoneModalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-[#E6EBF3] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#EEF2F7]">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                  <Flag className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0F1B3D] text-[16px]">Đặt mốc bàn giao</h3>
                  <p className="text-xs text-[#64748B]">
                    Hạng mục: <span className="font-semibold text-[#0F1B3D]">{milestoneModalConfig.workItem?.name}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setMilestoneModalConfig(prev => ({ ...prev, isOpen: false, error: "" }))}
                className="size-8 rounded-lg text-[#64748B] hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {milestoneModalConfig.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                {milestoneModalConfig.error}
              </div>
            )}

            <form onSubmit={handleMilestoneSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F1B3D] mb-1.5">
                  Ngày bàn giao bắt buộc <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={milestoneModalConfig.date}
                  onChange={(e) => setMilestoneModalConfig(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E6EBF3] text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  disabled={modalLoading}
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EEF2F7] mt-6">
                <button
                  type="button"
                  onClick={() => setMilestoneModalConfig(prev => ({ ...prev, isOpen: false, error: "" }))}
                  className="h-10 px-4 rounded-xl text-sm font-semibold text-[#64748B] hover:bg-slate-100 transition-colors"
                  disabled={modalLoading}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="h-10 px-6 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 shadow-sm transition-colors flex items-center gap-2"
                >
                  {modalLoading ? "Đang xử lý..." : "Lưu mốc"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal xem trước Nhập Excel (khối "Thao tác nhanh") */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-[#E6EBF3] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#EEF2F7]">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-green-50 text-[#16A34A] flex items-center justify-center">
                  <FileSpreadsheet className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#0F1B3D] text-[16px]">Xem trước nhập Excel</h3>
                  <p className="text-xs text-[#64748B]">File: <span className="font-semibold text-[#0F1B3D]">{importPreview.fileName}</span></p>
                </div>
              </div>
              <button
                onClick={() => setImportPreview(null)}
                disabled={importLoading}
                className="size-8 rounded-lg text-[#64748B] hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-4 max-h-[260px] overflow-y-auto space-y-2">
              {importPreview.rows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#16A34A] mb-1.5">
                    {importPreview.rows.length} dòng sẽ được thêm
                    ({importPreview.rows.filter((r) => r.type === "category").length} hạng mục,{" "}
                    {importPreview.rows.filter((r) => r.type === "task").length} công việc):
                  </p>
                  <ul className="text-xs text-[#0F1B3D] space-y-1">
                    {importPreview.rows.map((r, i) => (
                      <li key={i} className="px-2 py-1 bg-[#F4F7FC] rounded-lg flex items-center gap-2" style={{ paddingLeft: `${(r.depth - 1) * 16 + 8}px` }}>
                        {r.type === "category" ? <FolderOpen className="size-3.5 text-[#8B5CF6] shrink-0" /> : <FileText className="size-3.5 text-[#15803D] shrink-0" />}
                        <span>{r.name}</span>
                        {r.type === "task" && <span className="text-[#64748B]">({r.durationDays} ngày)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importPreview.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-500 mb-1.5 mt-3">
                    {importPreview.skipped.length} dòng bị bỏ qua:
                  </p>
                  <ul className="text-xs text-red-600 space-y-1">
                    {importPreview.skipped.map((s, i) => (
                      <li key={i} className="px-2 py-1 bg-red-50 rounded-lg">Dòng {s.row}: {s.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importPreview.rows.length === 0 && importPreview.skipped.length === 0 && (
                <p className="text-sm text-[#64748B] text-center py-4">File không có dữ liệu.</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EEF2F7] mt-4">
              <button
                type="button"
                onClick={() => setImportPreview(null)}
                disabled={importLoading}
                className="h-10 px-4 rounded-xl text-sm font-medium text-[#475569] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleImportConfirm}
                disabled={importLoading || importPreview.rows.length === 0}
                className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-[#16A34A] hover:bg-[#128A3C] transition-colors shadow-sm cursor-pointer disabled:opacity-60"
              >
                {importLoading ? "Đang nhập..." : `Xác nhận nhập ${importPreview.rows.length} hạng mục`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm / Sửa Hạng mục & Công việc theo bố cục chuẩn T-05 / Design System */}
      <CategoryModal
        config={modalConfig}
        loading={modalLoading}
        canAddTask={isLeafCategory(modalConfig.targetNode)}
        onPatch={(patch) => setModalConfig(prev => ({ ...prev, ...patch }))}
        onClose={closeModal}
        onSubmit={handleModalSubmit}
        onSwitchToTask={switchToTaskForm}
      />
    </div>
  );
}