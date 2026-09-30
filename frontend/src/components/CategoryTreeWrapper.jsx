import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { buildTree } from '../lib/tree';

const CategoryNode = ({ node, level, onAdd, onUpdate, onDelete, onMove, expandedMap, toggleExpand, allNodes }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [moveMode, setMoveMode] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState('');

  const expanded = expandedMap[node.id] !== false; // default true for level < 3 handled by initial map

  const handleUpdate = async () => {
    if (editName.trim() && editName !== node.name) {
      const success = await onUpdate(node.id, { name: editName });
      if (success) setIsEditing(false);
    } else {
      setIsEditing(false);
    }
  };

  const handleAdd = async () => {
    if (newName.trim()) {
      const success = await onAdd(node.id, { name: newName });
      if (success) {
        setIsAdding(false);
        setNewName('');
      }
    }
  };

  const handleMove = async () => {
    const parentId = selectedParentId === 'root' ? null : parseInt(selectedParentId);
    if (parentId !== node.parent_id) {
      const success = await onMove(node.id, parentId);
      if (success) setMoveMode(false);
    } else {
      setMoveMode(false);
    }
  };

  return (
    <div className="tree-node-container" style={{ marginLeft: `${level > 1 ? 20 : 0}px`, borderLeft: level > 1 ? '1px dashed #ccc' : 'none', paddingLeft: level > 1 ? '10px' : '0' }}>
      <div className="tree-node" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', padding: '4px', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
        
        {/* Toggle icon */}
        <div 
          onClick={() => toggleExpand(node.id)} 
          style={{ width: '20px', cursor: 'pointer', display: 'inline-block', textAlign: 'center', fontWeight: 'bold', color: '#555' }}
        >
          {node.hasChildren ? (expanded ? '▼' : '▶') : '•'}
        </div>

        {/* Node Content */}
        {isEditing ? (
          <div style={{ display: 'flex', gap: '4px' }}>
            <input 
              autoFocus 
              value={editName} 
              onChange={e => setEditName(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleUpdate()}
              style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '2px 4px' }}
            />
            <button onClick={handleUpdate} style={{ cursor: 'pointer' }}>Lưu</button>
            <button onClick={() => setIsEditing(false)} style={{ cursor: 'pointer' }}>Hủy</button>
          </div>
        ) : moveMode ? (
          <div style={{ display: 'flex', gap: '4px' }}>
            <select 
              value={selectedParentId} 
              onChange={e => setSelectedParentId(e.target.value)}
              style={{ padding: '2px', borderRadius: '4px' }}
            >
              <option value="root">-- Làm gốc --</option>
              {allNodes
                .filter(n => n.id !== node.id)
                .map(n => <option key={n.id} value={n.id}>{n.name}</option>)
              }
            </select>
            <button onClick={handleMove} style={{ cursor: 'pointer' }}>Chuyển</button>
            <button onClick={() => setMoveMode(false)} style={{ cursor: 'pointer' }}>Hủy</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: level === 1 ? 'bold' : 'normal' }}>{node.name}</span>
            <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
              <button onClick={() => setIsAdding(true)} title="Thêm con" style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}>➕</button>
              <button onClick={() => setIsEditing(true)} title="Sửa" style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}>✏️</button>
              <button onClick={() => setMoveMode(true)} title="Đổi cha" style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}>🔄</button>
              <button onClick={() => onDelete(node.id)} title="Xóa" style={{ cursor: 'pointer', border: 'none', background: 'transparent', color: 'red' }}>🗑️</button>
            </div>
          </div>
        )}
      </div>

      {isAdding && (
        <div style={{ marginLeft: '24px', display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <input 
            autoFocus 
            placeholder="Tên hạng mục con..." 
            value={newName} 
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '2px 4px' }}
          />
          <button onClick={handleAdd} style={{ cursor: 'pointer' }}>Lưu</button>
          <button onClick={() => setIsAdding(false)} style={{ cursor: 'pointer' }}>Hủy</button>
        </div>
      )}

      {expanded && node.hasChildren && (
        <div className="tree-children">
          {node.children.map(child => (
            <CategoryNode 
              key={child.id} 
              node={child} 
              level={level + 1} 
              onAdd={onAdd}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onMove={onMove}
              expandedMap={expandedMap}
              toggleExpand={toggleExpand}
              allNodes={allNodes}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function CategoryTreeWrapper({ projectId }) {
  const [treeData, setTreeData] = useState([]);
  const [allNodes, setAllNodes] = useState([]);
  const [expandedMap, setExpandedMap] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTree = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get(`/categories/${projectId}/tree/all`);
      const { roots } = buildTree(data);
      setTreeData(roots);
      setAllNodes(data);
      
      // Default thu gọn từ tầng 3 trở xuống (level >= 3 -> collapsed)
      // Level 1 (roots) = expanded
      // Level 2 (children of roots) = expanded
      // Level 3+ = collapsed (expanded = false)
      const initExpand = {};
      const traverse = (nodes, currentLevel) => {
        nodes.forEach(n => {
          if (currentLevel < 3) {
            initExpand[n.id] = true;
          } else {
            initExpand[n.id] = false;
          }
          if (n.children) traverse(n.children, currentLevel + 1);
        });
      };
      traverse(roots, 1);
      setExpandedMap(initExpand);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTree();
  }, [projectId]);

  const toggleExpand = (id) => {
    setExpandedMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddRoot = async (name) => {
    try {
      await api.post(`/categories/${projectId}`, { name, parent_id: null });
      fetchTree();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      return false;
    }
  };

  const handleAdd = async (parentId, data) => {
    try {
      await api.post(`/categories/${projectId}`, { ...data, parent_id: parentId });
      // auto expand parent
      setExpandedMap(prev => ({ ...prev, [parentId]: true }));
      fetchTree();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      return false;
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      await api.put(`/categories/${projectId}/${id}`, data);
      fetchTree();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      return false;
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa hạng mục này?')) return false;
    try {
      await api.delete(`/categories/${projectId}/${id}`);
      fetchTree();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      return false;
    }
  };

  const handleMove = async (id, newParentId) => {
    try {
      await api.patch(`/categories/${projectId}/${id}/move`, { parent_id: newParentId });
      if (newParentId) setExpandedMap(prev => ({ ...prev, [newParentId]: true }));
      fetchTree();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      return false;
    }
  };

  return (
    <div style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>Cây Hạng Mục (Work Items)</h2>
        <button 
          onClick={() => {
            const name = window.prompt("Nhập tên hạng mục gốc mới:");
            if (name) handleAddRoot(name);
          }}
          style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', borderRadius: '4px', cursor: 'pointer', border: 'none' }}
        >
          + Thêm gốc
        </button>
      </div>
      
      {error && <div style={{ color: '#b91c1c', marginBottom: '16px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #f87171', borderRadius: '4px' }}>
        <strong>Lỗi:</strong> {error}
      </div>}

      {isLoading && treeData.length === 0 ? (
        <div>Đang tải cây...</div>
      ) : (
        <div className="category-tree">
          {treeData.length === 0 ? (
            <p style={{ color: '#666' }}>Chưa có hạng mục nào.</p>
          ) : (
            treeData.map(node => (
              <CategoryNode 
                key={node.id} 
                node={node} 
                level={1}
                onAdd={handleAdd}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onMove={handleMove}
                expandedMap={expandedMap}
                toggleExpand={toggleExpand}
                allNodes={allNodes}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
