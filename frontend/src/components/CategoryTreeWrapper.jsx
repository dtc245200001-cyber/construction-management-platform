import React, { useEffect, useRef } from 'react';
import { CategoryTree } from './category-tree.js';
import './category-tree.css';

export default function CategoryTreeWrapper({ projectId }) {
  const containerRef = useRef(null);
  const treeInstanceRef = useRef(null);

  useEffect(() => {
    const currentContainer = containerRef.current;
    if (!currentContainer) return;

    // Callbacks to interact with backend
    const options = {
      onFetchChildren: async (parentId) => {
        try {
          const url = parentId 
            ? `http://localhost:3000/api/categories/${projectId}?parentId=${parentId}`
            : `http://localhost:3000/api/categories/${projectId}`;
          
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) throw new Error('Failed to fetch categories');
          return await res.json();
        } catch (error) {
          console.error(error);
          return [];
        }
      },
      onAdd: async (parentId, data) => {
        try {
          const res = await fetch(`http://localhost:3000/api/categories/${projectId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ parent_id: parentId, name: data.name })
          });
          if (!res.ok) throw new Error('Failed to create category');
          return await res.json();
        } catch (error) {
          console.error(error);
          return null;
        }
      },
      onUpdate: async (id, data) => {
        try {
          const res = await fetch(`http://localhost:3000/api/categories/${projectId}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data)
          });
          return res.ok;
        } catch (error) {
          console.error(error);
          return false;
        }
      },
      onDelete: async (id) => {
        if (!confirm('Bạn có chắc chắn muốn xóa hạng mục này và tất cả hạng mục con?')) return false;
        try {
          const res = await fetch(`http://localhost:3000/api/categories/${projectId}/${id}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          return res.ok;
        } catch (error) {
          console.error(error);
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
      <div ref={containerRef}></div>
    </div>
  );
}
