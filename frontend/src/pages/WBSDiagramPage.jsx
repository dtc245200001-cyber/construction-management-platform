import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, Link } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from "reactflow";
import { ArrowLeft, ChevronRight, ChevronDown, FolderOpen, FileText, Maximize2 } from "lucide-react";
import "reactflow/dist/style.css";

import api from "../lib/api";
import TaskForm from "../components/TaskForm";
import CategoryModal, { saveCategory } from "../components/CategoryModal";
import { buildTree, rollupCategoryDates, flattenTasks } from "../utils/buildTree";
import { layoutWithDagre, treeToFlowElements } from "../utils/wbsDiagramUtils";

function WbsNode({ data, selected }) {
  const { node, collapsed, hasChildren } = data;
  const isCategory = node.type === "category";

  return (
    <div
      title={node.name}
      className={`w-[240px] min-h-[82px] rounded-xl border-2 px-3 py-2.5 transition-all duration-150 select-none ${
        isCategory
          ? `bg-[#EFF6FF] border-[#60A5FA] shadow-xs hover:shadow-md ${
              selected ? "ring-2 ring-[#2563EB] border-[#2563EB]" : ""
            }`
          : `bg-white border-[#CBD5E1] shadow-xs hover:shadow-md hover:border-[#10B981] ${
              selected ? "ring-2 ring-[#16A34A] border-[#16A34A]" : ""
            }`
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={`!w-2.5 !h-2.5 !border-2 !border-white ${
          isCategory ? "!bg-[#2563EB]" : "!bg-[#10B981]"
        }`}
      />

      {/* Dòng 1: Icon phân loại + Badge loại node + Nút thu gọn hoặc Badge số ngày */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {isCategory ? (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#2563EB] text-white shadow-xs">
                <FolderOpen className="size-3.5" />
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#DBEAFE] text-[#1E40AF] tracking-wide uppercase">
                Hạng mục
              </span>
            </>
          ) : (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#DCFCE7] text-[#15803D]">
                <FileText className="size-3.5" />
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]">
                Công việc
              </span>
            </>
          )}
        </div>

        {/* Góc phải: Nút thu gọn nhánh (Hạng mục) hoặc Badge số ngày (Công việc) */}
        {isCategory ? (
          hasChildren && (
            <button
              type="button"
              data-node-toggle="1"
              title={collapsed ? "Mở rộng nhánh" : "Thu gọn nhánh"}
              className="nodrag flex size-6 shrink-0 items-center justify-center rounded-md text-[#2563EB] hover:bg-[#DBEAFE] transition-colors cursor-pointer"
            >
              {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          )
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] shadow-2xs">
            {node.duration_days ?? 1} ngày
          </span>
        )}
      </div>

      {/* Dòng 2: Tên node hiển thị tối đa 2 dòng rõ ràng (-webkit-line-clamp: 2), kèm native tooltip title */}
      <div
        className={`line-clamp-2 text-[13px] leading-snug break-words ${
          isCategory ? "font-bold text-[#0F1B3D]" : "font-medium text-[#1E293B]"
        }`}
      >
        {node.name}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={`!w-2.5 !h-2.5 !border-2 !border-white ${
          isCategory ? "!bg-[#2563EB]" : "!bg-[#10B981]"
        }`}
      />
    </div>
  );
}

const nodeTypes = { wbsNode: WbsNode };

function WBSDiagramInner() {
  const navigate = useNavigate();
  const context = useOutletContext();
  const currentProject = context?.currentProject;
  const projectId = currentProject?.id || localStorage.getItem("currentProjectId") || 1;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(new Set());
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [rfInstance, setRfInstance] = useState(null);

  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    mode: "edit_category",
    targetNode: null,
    name: "",
    code: "",
    error: "",
    entryType: "category",
  });
  const [modalLoading, setModalLoading] = useState(false);

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  const fetchWBS = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/categories/${projectId}/tree/all`);
      setItems(buildTree(res.data));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setItems([]);
    setNodes([]);
    setEdges([]);
    setShowTaskForm(false);
    setModalConfig(prev => ({ ...prev, isOpen: false, error: "" }));
  }, [projectId]);

  useEffect(() => {
    fetchWBS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const rolledItems = useMemo(() => rollupCategoryDates(items), [items]);

  // Dựng lại nodes/edges mỗi khi cây hoặc trạng thái thu gọn đổi
  useEffect(() => {
    const { nodes: rawNodes, edges: rawEdges } = treeToFlowElements(rolledItems, collapsed);
    setNodes(layoutWithDagre(rawNodes, rawEdges));
    setEdges(rawEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolledItems, collapsed]);

  const toggleCollapse = useCallback((id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsed(new Set());
    setTimeout(() => {
      rfInstance?.fitView?.({ padding: 0.15, duration: 300 });
    }, 50);
  }, [rfInstance]);

  const collapseAll = useCallback(() => {
    const parentIds = new Set();
    const collect = (list) => {
      for (const item of list || []) {
        if (item.children && item.children.length > 0) {
          parentIds.add(item.id);
          collect(item.children);
        }
      }
    };
    collect(rolledItems);
    setCollapsed(parentIds);
    setTimeout(() => {
      rfInstance?.fitView?.({ padding: 0.15, duration: 300 });
    }, 50);
  }, [rolledItems, rfInstance]);

  const onNodeClick = useCallback((event, node) => {
    // Bấm nút mũi tên trên node: chỉ thu gọn/mở rộng, không mở modal
    if (event?.target?.closest?.("[data-node-toggle]")) {
      const data = node.data?.node;
      if (data) toggleCollapse(data.id);
      return;
    }
    const data = node.data?.node;
    if (!data) return;
    if (data.type === "category") {
      setModalConfig({
        isOpen: true,
        mode: "edit_category",
        targetNode: data,
        name: data.name,
        code: data.code || "",
        error: "",
        entryType: "category",
      });
    } else {
      setEditingTask({ id: data.task_id, name: data.name, duration_days: data.duration_days });
      setShowTaskForm(true);
    }
  }, [toggleCollapse]);

  const closeModal = () => setModalConfig((prev) => ({ ...prev, isOpen: false, error: "" }));

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    try {
      setModalLoading(true);
      setModalConfig((prev) => ({ ...prev, error: "" }));
      await saveCategory({
        projectId,
        mode: modalConfig.mode,
        targetNode: modalConfig.targetNode,
        name: modalConfig.name,
        code: modalConfig.code,
      });
      closeModal();
      await fetchWBS();
    } catch (err) {
      setModalConfig((prev) => ({
        ...prev,
        error: err.response?.data?.message || err.message || "Lỗi khi lưu dữ liệu",
      }));
    } finally {
      setModalLoading(false);
    }
  };

  const closeTaskForm = () => {
    setShowTaskForm(false);
    setEditingTask(null);
  };

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[500px] flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/wbs")}
            className="flex items-center gap-1 text-[13px] font-medium text-[#1F63E0] hover:underline cursor-pointer"
          >
            <ArrowLeft className="size-4" /> Quay lại bảng WBS
          </button>
          <h1 className="text-[18px] font-bold text-[#0F1B3D]">Sơ đồ WBS</h1>
          <span className="text-[12px] text-[#64748B] hidden sm:inline">
            Bấm mũi tên để thu gọn/mở rộng nhánh · Bấm vào node để sửa
          </span>
        </div>

        {/* Cụm công cụ điều khiển sơ đồ trực quan */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => rfInstance?.fitView?.({ padding: 0.15, duration: 300 })}
            title="Thu phóng vừa màn hình (Fit View)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-[12px] font-semibold text-[#1E293B] hover:bg-slate-50 hover:border-[#94A3B8] shadow-2xs transition-colors cursor-pointer"
          >
            <Maximize2 className="size-3.5 text-[#2563EB]" />
            Vừa màn hình
          </button>
          <button
            type="button"
            onClick={expandAll}
            title="Mở rộng tất cả các nhánh"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-[12px] font-medium text-[#1E293B] hover:bg-slate-50 hover:border-[#94A3B8] shadow-2xs transition-colors cursor-pointer"
          >
            <FolderOpen className="size-3.5 text-[#2563EB]" />
            Mở rộng tất cả
          </button>
          <button
            type="button"
            onClick={collapseAll}
            title="Thu gọn tất cả về hạng mục gốc"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-[12px] font-medium text-[#1E293B] hover:bg-slate-50 hover:border-[#94A3B8] shadow-2xs transition-colors cursor-pointer"
          >
            <ChevronRight className="size-3.5 text-[#64748B]" />
            Thu gọn tất cả
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] shadow-2xs">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[13px] text-[#64748B]">
            Đang tải sơ đồ...
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[13px] text-[#64748B]">
            <p>Chưa có hạng mục nào.</p>
            <Link to="/wbs" className="text-[#1F63E0] hover:underline">
              Sang bảng WBS để thêm hạng mục
            </Link>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onInit={setRfInstance}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            panOnScroll={false}
            minZoom={0.25}
            maxZoom={1.75}
            fitView
            fitViewOptions={{ padding: 0.15, minZoom: 0.45, maxZoom: 1.0, duration: 300 }}
            attributionPosition="bottom-right"
          >
            <Background color="#CBD5E1" gap={16} size={1} />
            <Controls showFitView={true} showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable nodeStrokeWidth={2} />
          </ReactFlow>
        )}
      </div>

      <CategoryModal
        config={modalConfig}
        loading={modalLoading}
        canAddTask={false}
        onPatch={(patch) => setModalConfig((prev) => ({ ...prev, ...patch }))}
        onClose={closeModal}
        onSubmit={handleModalSubmit}
        onSwitchToTask={() => {}}
      />

      {showTaskForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-xs">
          <TaskForm
            projectId={projectId}
            workItem={null}
            task={editingTask}
            allTasks={flattenTasks(items)}
            onClose={closeTaskForm}
            onSuccess={() => {
              closeTaskForm();
              fetchWBS();
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function WBSDiagramPage(props) {
  return (
    <ReactFlowProvider>
      <WBSDiagramInner {...props} />
    </ReactFlowProvider>
  );
}
