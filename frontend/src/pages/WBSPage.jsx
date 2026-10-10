import React, { useState, useEffect, useMemo, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import * as XLSX from "xlsx";
import api from "../lib/api";
import TaskForm from "../components/TaskForm";
import { format, parseISO } from "date-fns";
import { 
  Search, Plus, List, LayoutGrid,
  ChevronRight, ChevronDown, FolderOpen, FileText, 
  Lightbulb, X, FileSpreadsheet, Download, Network,
  Maximize2, Minimize2, Pencil, Trash2, PlusCircle, FolderPlus, CalendarRange, Flag
} from "lucide-react";

function buildTree(data) {
  const map = {};
  const roots = [];
  data.forEach(item => {
    map[item.id] = { ...item, children: [], hasChildren: false };
  });
  data.forEach(item => {
    if (item.parent_id != null && map[item.parent_id]) {
      map[item.parent_id].children.push(map[item.id]);
      map[item.parent_id].hasChildren = true;
    } else {
      roots.push(map[item.id]);
    }
  });
  return roots;
}

const toTime = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * T-09: Ngày của hạng mục được tổng hợp hoàn toàn ở frontend (không lưu DB):
 * - Bắt đầu = ngày bắt đầu sớm nhất (min ES) của mọi con cháu
 * - Kết thúc = ngày kết thúc muộn nhất (max EF) của mọi con cháu
 * Hạng mục chưa có công việc nào được tính lịch thì để null.
 * Trả về cây mới, không thay đổi cây đầu vào.
 */
export function rollupCategoryDates(nodes) {
  return (nodes || []).map((node) => {
    if (node.type !== "category") return node;

    const children = rollupCategoryDates(node.children);
    let start = null;
    let end = null;
    let startTime = Infinity;
    let endTime = -Infinity;

    for (const child of children) {
      const s = toTime(child.start_date);
      if (s !== null && s < startTime) {
        startTime = s;
        start = child.start_date;
      }
      const e = toTime(child.end_date);
      if (e !== null && e > endTime) {
        endTime = e;
        end = child.end_date;
      }
    }

    return { ...node, children, start_date: start, end_date: end };
  });
}

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = useState("");
  const [showRightPanel, setShowRightPanel] = useState(true);
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

  const projectId = currentProject?.id || localStorage.getItem("currentProjectId") || 1;

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

  // NFR T-12: Kiểm tra hạng mục lá (không có work_item con nào)
  const isLeafCategory = (node) => {
    if (!node) return false;

    if (!node.children || node.children.length === 0) {
      return true;
    }

    return node.children.every((child) => child.type === "task");
  };

  const flattenTasks = (nodes) =>
  nodes.flatMap((n) => [
    ...(n.type === "task" ? [n] : []),
    ...flattenTasks(n.children || []),
  ]);

  const openCreateTaskForm = (workItem) => {
  setSelectedWorkItem(workItem);
  setEditingTask(null);
  setShowTaskForm(true);
};

const openEditTaskForm = (node) => {
  setEditingTask({
    id: node.task_id,
    name: node.name,
    duration_days: node.duration_days,
  });
  setSelectedWorkItem(null);
  setShowTaskForm(true);
};

const closeTaskForm = () => {
  setShowTaskForm(false);
  setSelectedWorkItem(null);
  setEditingTask(null);
};
  const fetchWBS = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/categories/${projectId}/tree/all`);
      const roots = buildTree(res.data);
      setItems(roots);
      
      try {
        const msRes = await api.get(`/projects/${projectId}/milestones`);
        const msMap = {};
        msRes.data.forEach(m => msMap[m.work_item_id] = m);
        setMilestones(msMap);
      } catch (err) {
        console.error("Failed to load milestones:", err);
      }
      
      const initExpanded = new Set();
      const traverse = (node, level) => {
        // T-09: Mặc định mở rộng tầng 1 và tầng 2, thu gọn từ tầng 3 trở xuống
        if (level < 3) {
          initExpanded.add(node.id);
          node.children.forEach(c => traverse(c, level + 1));
        }
      };
      roots.forEach(r => traverse(r, 1));
      setExpanded(initExpanded);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
    setMilestoneModalConfig({
      isOpen: true,
      workItem: node,
      date: milestones[node.id] ? milestones[node.id].required_date.split('T')[0] : "",
      error: ""
    });
  };

  const handleMilestoneSubmit = async (e) => {
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
    e.preventDefault();
    const trimmedName = modalConfig.name.trim();
    if (!trimmedName) {
      setModalConfig(prev => ({ ...prev, error: "Vui lòng nhập tên hạng mục" }));
      return;
    }

    try {
      setModalLoading(true);
      setModalConfig(prev => ({ ...prev, error: "" }));

      if (modalConfig.mode === "add_root") {
        await api.post(`/categories/${projectId}`, {
          name: trimmedName,
          code: modalConfig.code.trim() || undefined,
          parent_id: null,
        });
      } else if (modalConfig.mode === "add_child") {
        await api.post(`/categories/${projectId}`, {
          name: trimmedName,
          code: modalConfig.code.trim() || undefined,
          parent_id: modalConfig.targetNode.id,
        });
        // Tự động mở rộng node cha để thấy con mới tạo
        setExpanded(prev => new Set([...prev, modalConfig.targetNode.id]));
      } else if (modalConfig.mode === "edit_category") {
        await api.put(`/categories/${projectId}/${modalConfig.targetNode.id}`, {
          name: trimmedName,
        });
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
  // Ràng buộc chỉ áp dụng giữa các công việc NẰM TRONG CHÍNH FILE này (tham chiếu ra
  // ngoài file bị bỏ qua, vì STT đó không tồn tại trong lần nhập này).
  // Ngày bắt đầu trong file KHÔNG được dùng lại — hệ thống luôn tự tính lại theo lịch CPM
  // của dự án đích sau khi tạo xong tất cả công việc.
  const parseSttDepth = (sttRaw) => {
    const stt = String(sttRaw ?? "").trim();
    if (!stt) return null;
    return stt.split(".").length;
  };

  const handleImportFileChange = async (e) => {
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

      const nodes = []; // { stt, depth, name, type, code, durationDays, constraintRaw, rowNum }
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

        nodes.push({
          stt: String(sttRaw).trim(),
          depth,
          name,
          type: isTask ? "task" : "category",
          code: String(r["Mã"] ?? r["code"] ?? "").trim(),
          durationDays,
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
        const res = await api.post(`/projects/${projectId}/tasks`, {
          work_item_id: workItemId,
          name: node.name,
          duration_days: node.durationDays,
        });
        node.realId = res.data.id;
        sttToTaskId.set(node.stt, res.data.id);
        taskCount++;
      } catch (err) {
        failed.push(`[Công việc] ${node.name}: ${err.response?.data?.message || err.message}`);
      }
    }

    // 3) Tạo lại ràng buộc GIỮA CÁC CÔNG VIỆC TRONG CHÍNH FILE NÀY (bỏ qua tham chiếu ra ngoài file).
    let dependencyCount = 0;
    for (const node of importPreview.rows) {
      if (node.type !== "task" || !node.realId || !node.constraintRaw) continue;

      for (const part of node.constraintRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
        const m = part.match(/^([\d.]+)\s*(FS|SS|FF|SF)?$/i);
        if (!m) continue;
        const predecessorStt = m[1];
        const dependencyType = (m[2] || "FS").toUpperCase();
        const predecessorId = sttToTaskId.get(predecessorStt);
        if (!predecessorId) continue; // tham chiếu ra ngoài file nhập này -> bỏ qua

        try {
          await api.post(`/projects/${projectId}/dependencies`, {
            predecessor_id: predecessorId,
            successor_id: node.realId,
            dependency_type: dependencyType,
          });
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
                <button onClick={() => toggleExpand(node.id)} className="p-1 hover:bg-black/5 rounded">
                  {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
                <div className={`flex size-6 items-center justify-center rounded-md font-semibold text-xs bg-white/50 ${color.text}`}>
                  {indexStr}
                </div>
                {isExpanded ? <FolderOpen className={`size-4 ${color.text}`} /> : <FolderOpen className={`size-4 ${color.text}`} />}
                <span className="text-[14px]">{node.name}</span>
                {milestones[node.id] && (
                  <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-100 text-red-600" title="Mốc bàn giao bắt buộc">
                    <Flag className="size-3" />
                    {renderDate(milestones[node.id].required_date)}
                  </span>
                )}
              </div>
            </td>
            <td className="px-4">
              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-[#EEF2FF] text-[#4F46E5]">Hạng mục</span>
            </td>
            <td className="px-4"></td>
            <td className="px-4 text-sm text-[#475569]">{renderDate(node.start_date)}</td>
            <td className="px-4 text-sm text-[#475569]">{renderDate(node.end_date)}</td>
            <td className={`px-4 text-right sticky right-0 z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.05)] transition-colors ${color.bg}`}>
 <div className="flex items-center justify-end gap-1">
  {/* T-43: Đặt mốc */}
  <button
    type="button"
    onClick={() => openMilestoneModal(node)}
    title="Đặt mốc bàn giao"
    className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
  >
    <Flag className="size-4" />
  </button>

  {/* T-12: Thêm công việc — chỉ hạng mục lá mới được chứa công việc */}
  {isLeafCategory(node) && (
  <button
    type="button"
    onClick={() => openCreateTaskForm(node)}
    title="Thêm công việc"
    className="p-1.5 text-[#1F63E0] hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
  >
    <Plus className="size-4" />
  </button>
  )}

  {/* Main: Thêm hạng mục con */}
  <button
    type="button"
    onClick={() => openAddChildModal(node)}
    title="Thêm mục con"
    className="p-1.5 text-[#1F63E0] hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
  >
    <PlusCircle className="size-4" />
  </button>

  {/* Main: Sửa hạng mục */}
  <button
    type="button"
    onClick={() => openEditCategoryModal(node)}
    title="Sửa tên hạng mục"
    className="p-1.5 text-[#475569] hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
  >
    <Pencil className="size-4" />
  </button>

  {/* Main: Xóa hạng mục */}
  <button
    type="button"
    onClick={() => handleDeleteCategory(node)}
    title="Xóa hạng mục"
    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
  >
    <Trash2 className="size-4" />
  </button>
</div>
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
          <td className="px-4">
            <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-[#DCFCE7] text-[#15803D]">Công việc</span>
          </td>
          <td className="px-4 text-sm text-[#475569]">
            {node.predecessors?.length > 0 ? (
              <div className="flex flex-wrap gap-1 max-w-[150px]">
                {node.predecessors.map((p, idx) => {
                  const refIdx = taskIdToIndexMap[p.id] || p.id;
                  const type = p.type !== 'FS' ? p.type : '';
                  return (
                    <span key={idx} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[11px] font-mono border border-slate-200" title={`Ràng buộc: ${p.type}`}>
                      {refIdx}{type}
                    </span>
                  );
                })}
              </div>
            ) : (
              <span className="text-slate-300">-</span>
            )}
          </td>
          <td className="px-4 text-sm text-[#475569]">{renderDate(node.start_date)}</td>
          <td className="px-4 text-sm text-[#475569]">{renderDate(node.end_date)}</td>
          <td className="px-4 text-right sticky right-0 bg-white group-hover:bg-[#F5F8FF] z-10 shadow-[-4px_0_12px_rgba(0,0,0,0.05)] transition-colors">
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => openEditTaskForm (node)}
                title="Sửa công việc"
                className="p-1.5 text-[#475569] hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
              >
                <Pencil className="size-4" />
              </button>
              <button
                onClick={() => handleDeleteTask(node)}
                title="Xóa công việc"
                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </td>
        </tr>
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
        <div className="flex-1 flex flex-col gap-6 overflow-hidden min-w-0">
          
          {/* Hero Banner */}
          <div className="relative h-[115px] rounded-2xl overflow-hidden shrink-0 flex items-center p-6 shadow-sm">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1541888086425-d81bb19240f5?auto=format&fit=crop&q=80')" }}></div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B3FA8] to-transparent opacity-95"></div>
            <div className="relative z-10 flex items-center gap-5">
              <div className="size-[60px] bg-[#1F63E0] rounded-xl flex items-center justify-center shadow-lg">
                <Network className="size-8 text-white" />
              </div>
              <div>
                <h1 className="text-white text-[30px] font-bold leading-tight">Cơ cấu công việc (WBS)</h1>
                <p className="text-white/90 text-[18px] font-medium mt-1.5">{currentProject ? `Dự án: ${currentProject.name}` : 'Quản lý cấu trúc hạng mục phân cấp của dự án'}</p>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="relative w-full sm:w-[290px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#64748B]" />
              <input 
                type="text" 
                placeholder="Tìm kiếm công việc, hạng mục…"
                className="w-full h-11 pl-10 pr-4 rounded-[10px] border border-[#E6EBF3] bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1F63E0]/20 focus:border-[#1F63E0]"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="h-11 px-4 rounded-[10px] border border-[#E6EBF3] bg-white text-[14px] outline-none">
              <option>Tất cả thời gian</option>
            </select>
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#E6EBF3]">
              <button className="size-9 flex items-center justify-center rounded-lg bg-[#1F63E0] text-white"><List className="size-4" /></button>
              <button className="size-9 flex items-center justify-center rounded-lg text-[#64748B] hover:bg-black/5"><LayoutGrid className="size-4" /></button>
            </div>
            <div className="flex-1"></div>
            <button 
              onClick={() => setShowRightPanel(!showRightPanel)}
              className="h-11 px-4 flex items-center gap-2 bg-white border border-[#E6EBF3] hover:bg-black/5 text-[#475569] rounded-[10px] text-[14px] transition-colors shadow-sm"
              title={showRightPanel ? "Ẩn bảng phụ" : "Hiện bảng phụ"}
            >
              {showRightPanel ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            <button 
              onClick={openAddRootModal}
              className="h-11 px-5 flex items-center gap-2 bg-[#1F63E0] hover:bg-[#1A54C2] text-white rounded-[10px] text-[14px] font-medium shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="size-4" /> Thêm hạng mục gốc
            </button>
          </div>

          {/* WBS Table Card */}
          <div className="flex-1 bg-white rounded-2xl border border-[#E6EBF3] shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_12px_rgba(16,24,40,.04)] flex flex-col overflow-hidden min-w-0">
            <div className="overflow-x-auto overflow-y-auto flex-1 min-w-0">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="bg-white sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] min-w-[360px] whitespace-nowrap">STT / Tên công việc / Hạng mục</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[110px] whitespace-nowrap">Loại</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[120px] whitespace-nowrap">Ràng buộc</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[120px] whitespace-nowrap">Bắt đầu</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[120px] whitespace-nowrap">Kết thúc</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[50px] sticky right-0 bg-white z-20 shadow-[-4px_0_12px_rgba(0,0,0,0.05)]"></th>
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
          </div>
        </div>

        {/* Right Panel */}
        {showRightPanel && (
        <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-5 lg:overflow-y-auto pr-1 pb-4">
          
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
              <button
                type="button"
                onClick={openAddRootModal}
                className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#1F63E0] border border-transparent transition-all cursor-pointer"
              >
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#1F63E0] shadow-sm"><Plus className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Thêm hạng mục</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
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
              <button
                type="button"
                onClick={handleExportExcel}
                className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#8B5CF6] border border-transparent transition-all cursor-pointer"
              >
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#8B5CF6] shadow-sm"><Download className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Xuất báo cáo</span>
              </button>
              <button
                type="button"
                disabled
                title="Sơ đồ WBS dạng cây/sơ đồ chưa có trong hệ thống — sẽ bổ sung sau"
                className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 border border-transparent opacity-50 cursor-not-allowed"
              >
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#1F63E0] shadow-sm"><Network className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Sơ đồ WBS</span>
              </button>
            </div>
          </div>

          {/* Mẹo nhỏ */}
          <div className="bg-[#F0F6FF] rounded-xl border border-[#D6E6FF] p-4 relative">
            <button className="absolute top-3 right-3 text-[#1F63E0]/50 hover:text-[#1F63E0]"><X className="size-4" /></button>
            <div className="flex gap-3">
              <div className="mt-0.5 text-[#1F63E0]"><Lightbulb className="size-4 fill-current" /></div>
              <div>
                <h4 className="font-bold text-[13px] text-[#0F1B3D] mb-1">Mẹo nhỏ</h4>
                <p className="text-[12px] text-[#64748B] leading-relaxed">Bạn có thể thêm hạng mục con, sửa tên hoặc xóa trực tiếp tại mỗi dòng hạng mục.</p>
              </div>
            </div>
          </div>
        </div>
        )}

{showTaskForm && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs overflow-y-auto">
    <TaskForm
      projectId={projectId}
      workItem={selectedWorkItem}
      task={editingTask}
      allTasks={flattenTasks(items)}
      onClose={closeTaskForm}
      onSuccess={() => {
        if (selectedWorkItem?.id) {
          setExpanded(prev => new Set([...prev, selectedWorkItem.id]));
        }
        closeTaskForm();
        fetchWBS();
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
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-[#E6EBF3] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#EEF2F7]">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-blue-50 text-[#1F63E0] flex items-center justify-center">
                  {modalConfig.mode === "edit_category" || modalConfig.mode === "edit_task" ? (
                    <Pencil className="size-5" />
                  ) : modalConfig.entryType === "task" ? (
                    <FileText className="size-5 text-[#15803D]" />
                  ) : (
                    <FolderPlus className="size-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-[#0F1B3D] text-[16px]">
                    {modalConfig.mode === "add_root" && "Thêm hạng mục gốc"}
                    {modalConfig.mode === "add_child" && (
                      modalConfig.entryType === "task" ? "Thêm công việc thi công" : "Thêm hạng mục con"
                    )}
                    {modalConfig.mode === "edit_category" && "Đổi tên hạng mục"}
                    {modalConfig.mode === "edit_task" && "Chỉnh sửa công việc"}
                  </h3>
                  {modalConfig.mode === "add_child" && modalConfig.targetNode && (
                    <p className="text-xs text-[#64748B]">Trực thuộc: <span className="font-semibold text-[#0F1B3D]">{modalConfig.targetNode.name}</span></p>
                  )}
                </div>
              </div>
              <button 
                onClick={closeModal}
                className="size-8 rounded-lg text-[#64748B] hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* NFR T-12: Chỉ hiển thị chọn loại nếu là hạng mục LÁ (không có work_item con). Nếu đã có hạng mục con, ẩn hẳn tab Công việc */}
            {modalConfig.mode === "add_child" && isLeafCategory(modalConfig.targetNode) && (
              <div className="flex p-1 bg-slate-100 rounded-xl mt-4">
                <button
                  type="button"
                  onClick={switchToTaskForm}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 text-[#64748B] hover:text-[#0F1B3D] hover:bg-white"
                >
                  <FileText className="size-3.5" /> Công việc thi công
                </button>
                <button
                  type="button"
                  onClick={() => setModalConfig(prev => ({ ...prev, entryType: "category", error: "" }))}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    modalConfig.entryType === "category" ? "bg-white text-[#1F63E0] shadow-sm" : "text-[#64748B] hover:text-[#0F1B3D]"
                  }`}
                >
                  <FolderOpen className="size-3.5" /> Hạng mục con
                </button>
              </div>
            )}

            {modalConfig.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                {modalConfig.error}
              </div>
            )}

            <form onSubmit={handleModalSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F1B3D] mb-1.5">
                  {modalConfig.entryType === "task" ? "Tên công việc" : "Tên hạng mục"} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder={modalConfig.entryType === "task" ? "Ví dụ: Đào móng bằng máy, Đổ bê tông..." : "Nhập tên hạng mục..."}
                  value={modalConfig.name}
                  onChange={(e) => setModalConfig(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full h-11 px-3.5 rounded-xl border border-[#E6EBF3] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F63E0]/20 focus:border-[#1F63E0]"
                  disabled={modalLoading}
                />
              </div>

              {/* Nếu là Công việc: ô nhập Thời lượng thi công với validation > 0 tức thì */}
              {modalConfig.entryType === "task" && (
                <div>
                  <label className="block text-xs font-semibold text-[#0F1B3D] mb-1.5">
                    Thời lượng thi công (số ngày) <span className="text-red-500">*</span>
                  </label>
                  {(() => {
                    const days = Number(modalConfig.duration_days);
                    const isInvalid = !modalConfig.duration_days || !Number.isInteger(days) || days <= 0;
                    return (
                      <>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Ví dụ: 3, 5, 10..."
                          value={modalConfig.duration_days}
                          onChange={(e) => setModalConfig(prev => ({ ...prev, duration_days: e.target.value }))}
                          className={`w-full h-11 px-3.5 rounded-xl border text-sm focus:outline-none transition-colors ${
                            isInvalid
                              ? "border-red-500 ring-2 ring-red-100 focus:border-red-500"
                              : "border-[#E6EBF3] focus:ring-2 focus:ring-[#1F63E0]/20 focus:border-[#1F63E0]"
                          }`}
                          disabled={modalLoading}
                        />
                        {isInvalid && (
                          <p className="text-xs text-red-500 mt-1">
                            Thời lượng phải là số nguyên dương lớn hơn 0
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Nếu là Hạng mục và không phải edit: mã hạng mục */}
              {modalConfig.entryType === "category" && modalConfig.mode !== "edit_category" && (
                <div>
                  <label className="block text-xs font-semibold text-[#0F1B3D] mb-1.5">
                    Mã hạng mục (tùy chọn)
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: HM-01, KET-CAU..."
                    value={modalConfig.code}
                    onChange={(e) => setModalConfig(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full h-11 px-3.5 rounded-xl border border-[#E6EBF3] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F63E0]/20 focus:border-[#1F63E0]"
                    disabled={modalLoading}
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EEF2F7]">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={modalLoading}
                  className="h-10 px-4 rounded-xl text-sm font-medium text-[#475569] hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={
                    modalLoading ||
                    !modalConfig.name.trim() ||
                    (modalConfig.entryType === "task" &&
                      (!modalConfig.duration_days ||
                        !Number.isInteger(Number(modalConfig.duration_days)) ||
                        Number(modalConfig.duration_days) <= 0))
                  }
                  className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-[#1F63E0] hover:bg-[#1A54C2] transition-colors shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {modalLoading
                    ? "Đang lưu..."
                    : modalConfig.mode === "edit_category" || modalConfig.mode === "edit_task"
                    ? "Cập nhật"
                    : "Thêm mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}