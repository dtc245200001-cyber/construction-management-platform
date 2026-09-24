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
          <Route path="/login" element={user ? <Navigate to="/projects" replace /> : <LoginPage setUser={setUser} />} />
        </Route>
        
        <Route element={<MainLayout user={user} setUser={setUser} />}>
          <Route path="/projects" element={<ProjectsPage />} />
          {/* Support future dynamic routes like /projects/:id here or in ProjectsPage */}
        </Route>
        
        {/* Default route */}
        <Route path="*" element={<Navigate to={user ? "/projects" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;