import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import api from './lib/api';
import './App.css';

// Layouts
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';

// Pages
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProjectsPage from './pages/ProjectsPage';
import LandingPage from './pages/LandingPage';
import WBSPage from './pages/WBSPage';
import MembersPage from './pages/MembersPage';
import AdminPage from './pages/AdminPage';
import DashboardLayout from './layouts/DashboardLayout';

function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await api.get('/auth/me');
        setUser(response.data.user);
      } catch (error) {
        console.error("Không thể kiểm tra session", error);
      } finally {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, []);

  if (checkingSession) {
    return (
      <div className="loading-page">
        <div className="loading-logo">CM</div>
        <p>Đang tải hệ thống...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage setUser={setUser} />} />
        </Route>
        
        {/* Public / Protected Home Page */}
        <Route path="/" element={<HomePage user={user} setUser={setUser} />} />

        {/* Project Selection (Full screen) */}
        <Route path="/projects" element={user ? <ProjectsPage user={user} setUser={setUser} /> : <Navigate to="/login" replace />} />

        {/* Admin Dashboard */}
        <Route path="/admin" element={user ? <AdminPage user={user} /> : <Navigate to="/login" replace />} />

        {/* Dashboard Layout (With Sidebar) */}
        <Route element={user ? <DashboardLayout user={user} setUser={setUser} /> : <Navigate to="/login" replace />}>
          <Route path="/dashboard" element={<LandingPage user={user} setUser={setUser} />} />
          <Route path="/wbs" element={<WBSPage user={user} />} />
          <Route path="/members" element={<MembersPage user={user} />} />
        </Route>

        {/* Existing MainLayout for other pages */}
        <Route element={<MainLayout user={user} setUser={setUser} />}>
          {/* Add other pages here if needed */}
        </Route>
        
        {/* Default route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;