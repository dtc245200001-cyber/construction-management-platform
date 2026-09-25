import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import api from './utils/api';
import './App.css';

// Layouts
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';

// Pages
import LoginPage from './pages/LoginPage';
import ProjectsPage from './pages/ProjectsPage';
import LandingPage from './pages/LandingPage';

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
          <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage setUser={setUser} />} />
        </Route>
        
        {/* Full screen dashboard layout */}
        <Route path="/dashboard" element={user ? <LandingPage user={user} setUser={setUser} /> : <Navigate to="/login" replace />} />

        {/* Existing MainLayout for other pages */}
        <Route element={<MainLayout user={user} setUser={setUser} />}>
          <Route path="/projects" element={<ProjectsPage />} />
          {/* Support future dynamic routes like /projects/:id here or in ProjectsPage */}
        </Route>
        
        {/* Default route */}
        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;