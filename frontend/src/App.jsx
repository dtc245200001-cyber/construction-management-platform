import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import api from './lib/api';
import './App.css';

// Layouts
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';
import DashboardLayout from './layouts/DashboardLayout';
import PublicLayout from './layouts/PublicLayout';

// Pages
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import PublicProjectsPage from './pages/PublicProjectsPage';
import ProjectsPage from './pages/ProjectsPage';
import LandingPage from './pages/LandingPage';
import WBSPage from './pages/WBSPage';
import MembersPage from './pages/MembersPage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';
import ComingSoonPage from './pages/ComingSoonPage';

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
        
        {/* Public Routes with Header & Footer */}
        <Route element={<PublicLayout user={user} setUser={setUser} />}>
          <Route path="/" element={<HomePage user={user} />} />
          <Route path="/du-an" element={<PublicProjectsPage />} />
          <Route path="/nha-thau" element={<ComingSoonPage title="Trang danh bạ nhà thầu" />} />
          <Route path="/vat-tu" element={<ComingSoonPage title="Trang vật tư thiết bị" />} />
          <Route path="/tin-tuc" element={<ComingSoonPage title="Trang tin tức" />} />
          <Route path="/lien-he" element={<ComingSoonPage title="Trang liên hệ" />} />
          <Route path="/gioi-thieu" element={<ComingSoonPage title="Trang giới thiệu" />} />
          <Route path="/dieu-khoan" element={<ComingSoonPage title="Trang điều khoản sử dụng" />} />
          <Route path="/bao-mat" element={<ComingSoonPage title="Trang chính sách bảo mật" />} />
          <Route path="/huong-dan" element={<ComingSoonPage title="Trang hướng dẫn sử dụng" />} />
          <Route path="/faq" element={<ComingSoonPage title="Câu hỏi thường gặp" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

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

      </Routes>
    </BrowserRouter>
  );
}

export default App;