import React, { useEffect, useRef, useState } from 'react';
import { CategoryTree } from './category-tree.js';
import './category-tree.css';
import api from '../utils/api';

export default function CategoryTreeWrapper({ projectId }) {
  const containerRef = useRef(null);
  const treeInstanceRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const currentContainer = containerRef.current;
    if (!currentContainer) return;

    // Load entire tree data
    const fetchTreeData = async () => {
      try {
        const { data } = await api.get(`/categories/${projectId}/tree/all`);
        // data is flat array: [{ id, name, parent_id, code }]
        // We need to build a nested tree:
        const map = {};
        const roots = [];
        data.forEach(item => {
          map[item.id] = { ...item, children: [] };
        });
        data.forEach(item => {
          if (item.parent_id) {
            if (map[item.parent_id]) {
              map[item.parent_id].children.push(map[item.id]);
              map[item.parent_id].hasChildren = true;
            }
          } else {
            roots.push(map[item.id]);
          }
        });
        return { roots, rawData: data };
      } catch (err) {
        setError(err.response?.data?.message || err.message);
        return { roots: [], rawData: [] };
      }
    };

    const options = {
      onFetchTree: fetchTreeData,
      onAdd: async (parentId, data) => {
        try {
          setError(null);
          const res = await api.post(`/categories/${projectId}`, { parent_id: parentId, name: data.name });
          return { ...res.data, children: [], hasChildren: false };
        } catch (err) {
          setError(err.response?.data?.message || err.message);
          return null;
        }
      },
      onUpdate: async (id, data) => {
        try {
          setError(null);
          await api.put(`/categories/${projectId}/${id}`, data);
          return true;
        } catch (err) {
          setError(err.response?.data?.message || err.message);
          return false;
        }
      },
      onDelete: async (id) => {
        if (!confirm('Bạn có chắc chắn muốn xóa hạng mục này?')) return false;
        try {
          setError(null);
          await api.delete(`/categories/${projectId}/${id}`);
          return true;
        } catch (err) {
          setError(err.response?.data?.message || err.message);
          return false;
        }
      },
      onMove: async (id, newParentId) => {
        try {
          setError(null);
          await api.patch(`/categories/${projectId}/${id}/move`, { parent_id: newParentId });
          return true;
        } catch (err) {
          setError(err.response?.data?.message || err.message);
          return false;
        }
      }
    };

    const tree = new CategoryTree(currentContainer, options);
    treeInstanceRef.current = tree;
    tree.init();

    return () => {
      if (currentContainer) {
        currentContainer.innerHTML = '';
      }
    };
  }, [projectId]);

  return (
    <div className="category-tree-wrapper" style={{ padding: '20px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>Cây Hạng Mục (Work Items)</h2>
      {error && <div style={{ color: 'red', marginBottom: '10px', padding: '10px', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>{error}</div>}
      <div ref={containerRef}></div>
    </div>
  );
}
