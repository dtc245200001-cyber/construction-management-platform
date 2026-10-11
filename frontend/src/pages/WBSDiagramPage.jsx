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
import { ArrowLeft, ChevronRight, ChevronDown, FolderOpen, FileText } from "lucide-react";
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
      className={`min-w-[220px] max-w-[260px] rounded-xl border-2 bg-white px-3 py-2 shadow-sm ${
        selected ? "border-[#1F63E0]" : "border-[#E6EBF3]"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-[#1F63E0]" />
      <div className="flex items-center gap-2">
        {isCategory ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#EAF2FF] text-[#1F63E0]">
            <FolderOpen className="size-4" />
          </span>
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#E8F7EE] text-[#15803D]">
            <FileText className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[13px] ${isCategory ? "font-bold text-[#0F1B3D]" : "font-medium text-[#334155]"}`}>
            {node.name}
          </div>
          <div className="text-[11px] text-[#64748B]">
            {isCategory ? "Hạng mục" : `Công việc · ${node.duration_days ?? "?"} ngày`}
          </div>
        </div>
        {isCategory && hasChildren && (
          <button
            type="button"
            data-node-toggle="1"
            title={collapsed ? "Mở rộng nhánh" : "Thu gọn nhánh"}
            className="nodrag flex size-6 shrink-0 items-center justify-center rounded-md text-[#1F63E0] hover:bg-[#EAF2FF]"
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[#1F63E0]" />
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
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/wbs")}
          className="flex items-center gap-1 text-[13px] font-medium text-[#1F63E0] hover:underline"
        >
          <ArrowLeft className="size-4" /> Quay lại bảng WBS
        </button>
        <h1 className="text-[18px] font-bold text-[#0F1B3D]">Sơ đồ WBS</h1>
        <span className="text-[12px] text-[#64748B]">
          Bấm nút mũi tên để thu gọn/mở rộng nhánh · Bấm vào node để sửa
        </span>
      </div>

      <div className="min-h-0 flex-1 rounded-xl border border-[#E6EBF3] bg-[#F8FAFC]">
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
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            attributionPosition="bottom-right"
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
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
