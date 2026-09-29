import React, { useState, useEffect } from 'react';
import CategoryTreeWrapper from '../components/CategoryTreeWrapper';
import api from '../utils/api';

const ProjectsPage = () => {
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await api.get('/projects');
        setProjects(response.data.projects);
      } catch (error) {
        console.error("Lỗi khi tải danh sách dự án:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  if (loading) {
    return <div>Đang tải dự án...</div>;
  }

  return (
    <div style={{ width: "100%", maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>
      {!projectId ? (
        <div className="dashboard-card" style={{ textAlign: "center", padding: "20px", background: "#fff", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
          <h3 style={{ marginTop: 0 }}>Danh sách dự án của bạn</h3>
          
          {projects.length === 0 ? (
            <p>Bạn chưa tham gia dự án nào.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
              {projects.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', border: '1px solid #eee', borderRadius: '4px' }}>
                  <div style={{ textAlign: 'left' }}>
                    <strong>{p.name}</strong> <span style={{ fontSize: '0.8em', color: '#666', background: '#e0e0e0', padding: '2px 6px', borderRadius: '10px' }}>{p.role}</span>
                    <div style={{ fontSize: '0.9em', color: '#555' }}>{p.location || 'Chưa cập nhật địa điểm'}</div>
                  </div>
                  <button onClick={() => setProjectId(p.id)} className="primary-button" style={{ width: 'auto', padding: '8px 16px', margin: 0 }}>
                    Mở
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Đang xem dự án #{projectId}</h3>
            <button onClick={() => setProjectId(null)} style={{ background: "none", border: "1px solid #ccc", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}>
              Đóng dự án
            </button>
          </div>
          <CategoryTreeWrapper projectId={projectId} />
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
