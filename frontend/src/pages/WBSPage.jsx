import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { ChevronRight, ChevronDown, Plus, Trash2, Edit2, AlertCircle, CornerDownRight, Network } from "lucide-react";

// Build tree from flat list
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

export default function WBSPage({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(new Set()); // id -> boolean
  
  const projectId = localStorage.getItem('currentProjectId') || 1;

  const fetchWBS = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/categories/${projectId}/tree/all`);
      const roots = buildTree(res.data);
      setItems(roots);

      // Auto expand up to level 2 (level 1 is root, level 2 is children, level 3 is hidden)
      const initExpanded = new Set();
      const traverse = (node, level) => {
        if (level < 2) {
          initExpanded.add(node.id);
          node.children.forEach(c => traverse(c, level + 1));
        }
      };
      roots.forEach(r => traverse(r, 1));
      setExpanded(initExpanded);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Lỗi tải WBS");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWBS();
  }, [projectId]);

  const toggleExpand = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const handleCreate = async (parentId = null) => {
    const name = prompt("Nhập tên hạng mục mới:");
    if (!name) return;
    try {
      await api.post(`/categories/${projectId}`, { name, parent_id: parentId });
      fetchWBS();
    } catch (err) {
      alert("Lỗi tạo hạng mục: " + (err.response?.data?.message || err.message));
    }
  };

  const handleUpdate = async (id, oldName) => {
    const name = prompt("Sửa tên hạng mục:", oldName);
    if (!name || name === oldName) return;
    try {
      await api.put(`/categories/${projectId}/${id}`, { name });
      fetchWBS();
    } catch (err) {
      alert("Lỗi sửa hạng mục: " + (err.response?.data?.message || err.message));
    }
  };

  const handleMove = async (id, oldParentId) => {
    const newParentIdRaw = prompt(`Nhập ID của Hạng mục cha mới (để trống nếu muốn làm gốc, hiện tại: ${oldParentId || 'gốc'}):`);
    if (newParentIdRaw === null) return; // cancelled
    
    let parentId = newParentIdRaw.trim() === "" ? null : parseInt(newParentIdRaw.trim());
    if (parentId === oldParentId) return;

    try {
      await api.patch(`/categories/${projectId}/${id}/move`, { parent_id: parentId });
      fetchWBS();
    } catch (err) {
      alert("Lỗi di chuyển: " + (err.response?.data?.message || err.message));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Bạn có chắc chắn muốn xóa hạng mục này?")) return;
    try {
      await api.delete(`/categories/${projectId}/${id}`);
      fetchWBS();
    } catch (err) {
      alert("Không thể xóa: " + (err.response?.data?.message || err.message));
    }
  };

  const renderNode = (node, level = 0) => {
    const isExpanded = expanded.has(node.id);
    
    return (
      <div key={node.id} className="w-full">
        <div className={`flex items-center gap-2 py-2 px-3 border-b border-border/50 hover:bg-accent/30 group ${level === 0 ? 'bg-accent/10 font-semibold' : ''}`} style={{ paddingLeft: `${level * 24 + 12}px` }}>
          
          <button 
            onClick={() => node.hasChildren && toggleExpand(node.id)}
            className={`flex size-6 shrink-0 items-center justify-center rounded hover:bg-border/50 text-muted-foreground ${!node.hasChildren && 'opacity-0 cursor-default'}`}
          >
            {node.hasChildren ? (isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />) : <CornerDownRight className="size-3" />}
          </button>
          
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-mono bg-accent px-1.5 py-0.5 rounded">#{node.id}</span>
            <span className="truncate text-sm">{node.name}</span>
          </div>

          {user?.role === 'ban_quan_ly' && (
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
              <button title="Thêm hạng mục con" onClick={() => handleCreate(node.id)} className="p-1.5 text-info hover:bg-info-soft rounded">
                <Plus className="size-3.5" />
              </button>
              <button title="Chỉnh sửa" onClick={() => handleUpdate(node.id, node.name)} className="p-1.5 text-warning hover:bg-warning-soft rounded">
                <Edit2 className="size-3.5" />
              </button>
              <button title="Đổi cấp cha" onClick={() => handleMove(node.id, node.parent_id)} className="p-1.5 text-muted-foreground hover:bg-accent rounded text-xs font-medium">
                Move
              </button>
              <button title="Xóa hạng mục" onClick={() => handleDelete(node.id)} className="p-1.5 text-danger hover:bg-danger-soft rounded">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {isExpanded && node.hasChildren && (
          <div className="w-full flex flex-col">
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="flex-1 overflow-auto p-6 flex flex-col h-[calc(100vh-73px)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cơ cấu công việc (WBS)</h1>
          <p className="text-sm text-muted-foreground mt-1">Quản lý cấu trúc hạng mục phân cấp của dự án</p>
        </div>
        {user?.role === 'ban_quan_ly' && (
          <button onClick={() => handleCreate(null)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <Plus className="size-4" /> Thêm hạng mục gốc
          </button>
        )}
      </div>

      <div className="card-surface flex-1 overflow-hidden flex flex-col border border-border rounded-2xl shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Đang tải cấu trúc WBS...</div>
        ) : error ? (
          <div className="p-8 text-center flex flex-col items-center">
            <AlertCircle className="size-8 text-danger mb-3" />
            <p className="text-danger mb-4">{error}</p>
            <button onClick={fetchWBS} className="px-4 py-2 bg-primary text-white rounded-lg">Thử lại</button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
            <Network className="size-12 mb-4 opacity-20" />
            <p>Dự án chưa có hạng mục nào.</p>
            {user?.role === 'ban_quan_ly' && (
              <button onClick={() => handleCreate(null)} className="mt-4 px-4 py-2 text-sm bg-primary/10 text-primary font-medium rounded-lg hover:bg-primary/20">
                Tạo hạng mục đầu tiên
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto w-full">
            <div className="min-w-[600px] flex flex-col">
              {items.map(root => renderNode(root, 0))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
