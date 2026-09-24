import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import LogoutButton from '../components/LogoutButton';

const MainLayout = ({ user, setUser }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="main-layout" style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <header style={{ padding: '15px 40px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: 0, color: '#333' }}>Construction Management</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span>Xin chào, <strong>{user.email}</strong></span>
          <LogoutButton setUser={setUser} />
        </div>
      </header>
      <main style={{ padding: '40px' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
