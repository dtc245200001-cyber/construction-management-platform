import React, { useState, useEffect, useMemo } from "react";
import api from "../lib/api";
import { format, parseISO } from "date-fns";
import { 
  Search, Plus, List, LayoutGrid, MoreHorizontal, 
  ChevronRight, ChevronDown, FolderOpen, FileText, 
  Check, Lightbulb, X, FileSpreadsheet, Download, Share2, Network,
  Maximize2, Minimize2, Pencil, Trash2, PlusCircle, FolderPlus
} from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";

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
  
  const projectId = localStorage.getItem('currentProjectId') || 13;

  // State cho Modal Thêm / Sửa theo chuẩn T-05 / T-09 / T-12
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    mode: "add_root", // 'add_root' | 'add_child' | 'edit_category' | 'edit_task'
    entryType: "category", // 'category' | 'task'
    targetNode: null,
    name: "",
    code: "",
    duration_days: 1,
    error: "",
  });
  const [modalLoading, setModalLoading] = useState(false);

  // NFR T-12: Kiểm tra hạng mục lá (không có work_item con nào)
  const isLeafCategory = (node) => {
    if (!node) return false;
    if (!node.children || node.children.length === 0) return true;
    return node.children.every((child) => child.type === "task");
  };

  const fetchWBS = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/categories/${projectId}/tree/all`);
      const roots = buildTree(res.data);
      setItems(roots);
      
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
      entryType: "category",
      targetNode: null,
      name: "",
      code: "",
      duration_days: 1,
      error: "",
    });
  };

  const openAddChildModal = (node) => {
    const isLeaf = isLeafCategory(node);
    setModalConfig({
      isOpen: true,
      mode: "add_child",
      // Nếu là hạng mục lá, mặc định có thể chọn Task hoặc Category; nếu không thì chỉ Category
      entryType: isLeaf ? "task" : "category",
      targetNode: node,
      name: "",
      code: "",
      duration_days: 1,
      error: "",
    });
  };

  const openEditCategoryModal = (node) => {
    setModalConfig({
      isOpen: true,
      mode: "edit_category",
      entryType: "category",
      targetNode: node,
      name: node.name,
      code: node.code || "",
      duration_days: 1,
      error: "",
    });
  };

  const openEditTaskModal = (node) => {
    setModalConfig({
      isOpen: true,
      mode: "edit_task",
      entryType: "task",
      targetNode: node,
      name: node.name,
      code: "",
      duration_days: node.duration_days || 1,
      error: "",
    });
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false, error: "" }));
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = modalConfig.name.trim();
    if (!trimmedName) {
      setModalConfig(prev => ({
        ...prev,
        error: modalConfig.entryType === "task" ? "Vui lòng nhập tên công việc" : "Vui lòng nhập tên hạng mục",
      }));
      return;
    }

    if (modalConfig.entryType === "task") {
      const days = Number(modalConfig.duration_days);
      if (!Number.isInteger(days) || days <= 0) {
        setModalConfig(prev => ({ ...prev, error: "Thời lượng thi công phải là số nguyên dương (> 0)" }));
        return;
      }
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
        if (modalConfig.entryType === "task") {
          await api.post(`/projects/${projectId}/tasks`, {
            work_item_id: modalConfig.targetNode.id,
            name: trimmedName,
            duration_days: Number(modalConfig.duration_days),
          });
        } else {
          await api.post(`/categories/${projectId}`, {
            name: trimmedName,
            code: modalConfig.code.trim() || undefined,
            parent_id: modalConfig.targetNode.id,
          });
        }
        // Tự động mở rộng node cha để thấy con mới tạo
        setExpanded(prev => new Set([...prev, modalConfig.targetNode.id]));
      } else if (modalConfig.mode === "edit_category") {
        await api.put(`/categories/${projectId}/${modalConfig.targetNode.id}`, {
          name: trimmedName,
        });
      } else if (modalConfig.mode === "edit_task") {
        const realTaskId =
          modalConfig.targetNode.task_id ||
          (typeof modalConfig.targetNode.id === "string"
            ? modalConfig.targetNode.id.replace("task-", "")
            : modalConfig.targetNode.id);
        await api.put(`/projects/${projectId}/tasks/${realTaskId}`, {
          name: trimmedName,
          duration_days: Number(modalConfig.duration_days),
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

  const updateStatus = async (id, newStatus) => {
    // Node loại [Công việc] từ bảng tasks không đi qua các endpoint sửa/xoá của categories
    if (typeof id === 'string' && id.startsWith('task-')) {
      return;
    }
    try {
      await api.put(`/categories/${projectId}/${id}`, { status: newStatus });
      fetchWBS();
    } catch (err) {
      alert("Lỗi cập nhật trạng thái: " + (err.response?.data?.message || err.message));
    }
  };

  const renderStatus = (node) => {
    const status = node.status;
    let colorClass = "bg-[#DBEAFE] text-[#1D4ED8]";
    let dotClass = "bg-current";
    let icon = <span className={`size-1.5 rounded-full ${dotClass}`}></span>;
    let label = "To Do";

    switch (status) {
      case 'Đang thực hiện': 
        colorClass = "bg-[#DCFCE7] text-[#15803D]"; label = "In Progress"; break;
      case 'Đang chờ': 
        colorClass = "bg-[#FFEDD5] text-[#EA7A0B]"; label = "Pending"; break;
      case 'Hoàn thành': 
        colorClass = "bg-[#DCFCE7] text-green-800"; icon = <Check className="size-3" />; label = "Done"; break;
      case 'Trễ hạn': 
        colorClass = "bg-[#FEE2E2] text-red-700"; label = "Overdue"; break;
    }

    return (
      <div className="relative group cursor-pointer">
        <select 
          value={status || 'Chưa bắt đầu'}
          onChange={(e) => updateStatus(node.id, e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        >
          <option value="Chưa bắt đầu">To Do</option>
          <option value="Đang thực hiện">In Progress</option>
          <option value="Đang chờ">Pending</option>
          <option value="Hoàn thành">Done</option>
          <option value="Trễ hạn">Overdue</option>
        </select>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass} whitespace-nowrap`}>
          {icon} {label}
        </span>
      </div>
    );
  };

  const renderDate = (date) => date ? format(parseISO(date), 'dd/MM/yyyy') : '--';

  const renderRow = (node, level, indexStr, colorIndex = 0) => {
    const isExpanded = expanded.has(node.id);
    const isCategory = node.type === 'category';
    const indent = level * 36;
    const color = COLORS[colorIndex % COLORS.length];

    if (isCategory) {
      return (
        <React.Fragment key={node.id}>
          <tr className={`h-[52px] ${color.bg} rounded-xl border-b border-white`}>
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
              </div>
            </td>
            <td className="px-4">
              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-[#EEF2FF] text-[#4F46E5]">Hạng mục</span>
            </td>
            <td className="px-4 text-sm text-[#475569]">{renderDate(node.start_date)}</td>
            <td className="px-4 text-sm text-[#475569]">{renderDate(node.end_date)}</td>
            <td className="px-4">{renderStatus(node)}</td>
            <td className="px-4">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-black/10 rounded-full overflow-hidden">
                  <div className={`h-full bg-current ${color.text}`} style={{ width: `${node.progress || 0}%` }}></div>
                </div>
                <span className={`text-xs font-bold ${color.text}`}>{node.progress || 0}%</span>
              </div>
            </td>
            <td className="px-4 text-right">
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => openAddChildModal(node)}
                  title="Thêm mục con"
                  className="p-1.5 text-[#1F63E0] hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                >
                  <PlusCircle className="size-4" />
                </button>
                <button
                  onClick={() => openEditCategoryModal(node)}
                  title="Sửa tên hạng mục"
                  className="p-1.5 text-[#475569] hover:bg-black/5 rounded-lg transition-colors cursor-pointer"
                >
                  <Pencil className="size-4" />
                </button>
                <button
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
        <tr key={node.id} className="h-[46px] bg-white border-b border-[#EEF2F7] hover:bg-[#F5F8FF] transition-colors">
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
          <td className="px-4 text-sm text-[#475569]">{renderDate(node.start_date)}</td>
          <td className="px-4 text-sm text-[#475569]">{renderDate(node.end_date)}</td>
          <td className="px-4">{renderStatus(node)}</td>
          <td className="px-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-[#E5EAF3] rounded-full overflow-hidden">
                <div className="h-full bg-[#1F63E0]" style={{ width: `${node.progress || 0}%` }}></div>
              </div>
              <span className="text-xs font-medium text-[#64748B]">{node.progress || 0}%</span>
            </div>
          </td>
          <td className="px-4 text-right">
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => openEditTaskModal(node)}
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

  // Tính toán số liệu cho Panel Phải
  const stats = useMemo(() => {
    let total = 0, doing = 0, waiting = 0, done = 0;
    const countNodes = (n) => {
      if (n.type === 'task') {
        total++;
        if (n.status === 'Đang thực hiện') doing++;
        else if (n.status === 'Chưa bắt đầu' || n.status === 'Đang chờ') waiting++;
        else if (n.status === 'Hoàn thành') done++;
      }
      n.children.forEach(countNodes);
    };
    items.forEach(countNodes);
    const overallProgress = total > 0 ? Math.round((done + doing*0.5) / total * 100) : 0;
    return { total, doing, waiting, done, overallProgress };
  }, [items]);

  const chartData = [
    { name: "Hoàn thành", value: stats.done, color: "#22C55E" },
    { name: "Còn lại", value: stats.total - stats.done, color: "#E8EDF5" }
  ];

  return (
    <div className="flex-1 min-h-screen bg-[#F3F6FB] text-[#0F1B3D] flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden p-6 gap-6 max-w-[1672px] mx-auto w-full">
        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          
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
                <p className="text-white/90 text-[15px] mt-1">Quản lý cấu trúc hạng mục phân cấp của dự án</p>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative w-[290px]">
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
              <option>Tất cả trạng thái</option>
            </select>
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
          <div className="flex-1 bg-white rounded-2xl border border-[#E6EBF3] shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_12px_rgba(16,24,40,.04)] flex flex-col overflow-hidden">
            <div className="overflow-auto flex-1">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="bg-white sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] min-w-[360px] whitespace-nowrap">STT / Tên công việc / Hạng mục</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[110px] whitespace-nowrap">Loại</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[120px] whitespace-nowrap">Bắt đầu</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[120px] whitespace-nowrap">Kết thúc</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[150px] whitespace-nowrap">Trạng thái</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[160px] whitespace-nowrap">Tiến độ</th>
                    <th className="px-4 py-3 text-[13px] font-medium text-[#475569] border-b border-[#E6EBF3] w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="7" className="p-8 text-center text-gray-500">Đang tải dữ liệu...</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan="7" className="p-16 text-center text-gray-500">Chưa có hạng mục nào.</td></tr>
                  ) : (
                    items.map((root, i) => renderRow(root, 0, (i+1).toString(), i))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Panel (320px) */}
        {showRightPanel && (
        <div className="w-[320px] shrink-0 flex flex-col gap-5 overflow-y-auto pr-1 pb-4">
          
          {/* Tổng quan dự án */}
          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_12px_rgba(16,24,40,.04)]">
            <h3 className="font-bold text-[#0F1B3D] mb-4">Tổng quan dự án</h3>
            <div className="flex items-center gap-4 mb-6">
              <div className="size-[130px] shrink-0 relative flex items-center justify-center">
                <PieChart width={130} height={130}>
                  <Pie data={chartData} innerRadius={50} outerRadius={65} dataKey="value" stroke="none" startAngle={90} endAngle={-270}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[28px] font-bold leading-none text-[#0F1B3D]">{stats.overallProgress}%</span>
                  <span className="text-[12px] text-[#64748B] mt-1">Hoàn thành</span>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 text-[12px]">
                <div className="flex items-center gap-2"><div className="size-2 rounded-full bg-[#93C5FD]"></div><span className="text-[#64748B]">Tổng cv</span><strong className="ml-auto">{stats.total}</strong></div>
                <div className="flex items-center gap-2"><div className="size-2 rounded-full bg-[#22C55E]"></div><span className="text-[#64748B]">Đang làm</span><strong className="ml-auto">{stats.doing}</strong></div>
                <div className="flex items-center gap-2"><div className="size-2 rounded-full bg-[#3B82F6]"></div><span className="text-[#64748B]">Chưa BĐ</span><strong className="ml-auto">{stats.waiting}</strong></div>
                <div className="flex items-center gap-2"><div className="size-2 rounded-full bg-[#166534]"></div><span className="text-[#64748B]">Hoàn thành</span><strong className="ml-auto">{stats.done}</strong></div>
              </div>
            </div>

            <div className="h-px bg-[#E6EBF3] my-4"></div>
            <h4 className="font-semibold text-[13px] text-[#0F1B3D] mb-3">Theo giai đoạn</h4>
            <div className="flex flex-col gap-3">
              {items.map((root, i) => {
                const c = COLORS[i % COLORS.length];
                return (
                  <div key={root.id}>
                    <div className="flex justify-between text-[12px] mb-1.5">
                      <span className="text-[#475569] truncate pr-2">{root.name}</span>
                      <strong className="text-[#0F1B3D]">{root.progress || 0}%</strong>
                    </div>
                    <div className="h-1.5 bg-[#E6EBF3] rounded-full overflow-hidden">
                      <div className={`h-full ${c.bg.replace('bg-', 'bg-').replace('10', '100')} bg-current ${c.text}`} style={{ width: `${root.progress || 0}%` }}></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Thao tác nhanh */}
          <div className="bg-white rounded-2xl border border-[#E6EBF3] p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_12px_rgba(16,24,40,.04)]">
            <h3 className="font-bold text-[#0F1B3D] mb-4">Thao tác nhanh</h3>
            <div className="grid grid-cols-2 gap-3">
              <div 
                onClick={openAddRootModal}
                className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#1F63E0] border border-transparent transition-all cursor-pointer"
              >
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#1F63E0] shadow-sm"><Plus className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Thêm hạng mục</span>
              </div>
              <div className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#16A34A] border border-transparent transition-all cursor-pointer">
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#16A34A] shadow-sm"><FileSpreadsheet className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Nhập Excel</span>
              </div>
              <div className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#8B5CF6] border border-transparent transition-all cursor-pointer">
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#8B5CF6] shadow-sm"><Download className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Xuất báo cáo</span>
              </div>
              <div className="bg-[#F4F7FC] p-3 rounded-xl flex flex-col items-center justify-center gap-2 hover:-translate-y-0.5 hover:border-[#1F63E0] border border-transparent transition-all cursor-pointer">
                <div className="size-10 bg-white rounded-full flex items-center justify-center text-[#1F63E0] shadow-sm"><Network className="size-5" /></div>
                <span className="text-[12px] font-medium text-[#0F1B3D]">Sơ đồ WBS</span>
              </div>
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
      </div>

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
                  onClick={() => setModalConfig(prev => ({ ...prev, entryType: "task", error: "" }))}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    modalConfig.entryType === "task" ? "bg-white text-[#15803D] shadow-sm" : "text-[#64748B] hover:text-[#0F1B3D]"
                  }`}
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
