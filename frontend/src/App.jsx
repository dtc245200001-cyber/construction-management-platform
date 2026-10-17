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
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import HomePage from './pages/HomePage';
import PublicProjectsPage from './pages/PublicProjectsPage';
import PublicProjectDetailPage from './pages/PublicProjectDetailPage';
import ProjectsPage from './pages/ProjectsPage';
import LandingPage from './pages/LandingPage';
import WBSPage from './pages/WBSPage';
import WBSDiagramPage from './pages/WBSDiagramPage';
import MembersPage from './pages/MembersPage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';
import ComingSoonPage from './pages/ComingSoonPage';
import InvitationAcceptPage from './pages/InvitationAcceptPage';
import SchedulePage from './pages/SchedulePage';
import GanttPage from './pages/GanttPage';
import MilestoneWarningsPage from './pages/MilestoneWarningsPage';
import ProjectCalendarPage from './pages/ProjectCalendarPage';
import DiaryPage from './pages/DiaryPage';
import { startDiarySync } from './services/diarySync';

// S-26 / T-60
import FieldPage from './pages/FieldPage';
import ContractQuantityPage from './pages/ContractQuantityPage';

// S-36 / T-92
import AcceptancePage from './pages/AcceptancePage';

// S-39: Audit Portal cho Chủ đầu tư / Ban quản lý
import AuditPortalPage from './pages/AuditPortalPage';


// S-33 / T-80 / T-82 Upload Queue
import { UploadQueueProvider } from './context/UploadQueueContext';
import UploadQueueDrawer from './components/UploadQueueDrawer';

function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cached_auth_user') || 'null');
    } catch {
      return null;
    }
  });
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await api.get('/auth/me');
        setUser(response.data.user);
        try {
          localStorage.setItem('cached_auth_user', JSON.stringify(response.data.user));
        } catch {
          /* ignore */
        }
      } catch (error) {
        const status = error?.response?.status;

        if (status === 401 || status === 403) {
          try {
            localStorage.removeItem('cached_auth_user');
          } catch {
            /* ignore */
          }
          setUser(null);
        } else {
          // Ngoại tuyến hoặc lỗi kết nối: phục hồi phiên đăng nhập từ bộ nhớ máy
          console.warn('Không thể kiểm tra session trực tuyến (có thể đang ngoại tuyến):', error?.message || error);
          try {
            const cachedUser = JSON.parse(localStorage.getItem('cached_auth_user') || 'null');
            if (cachedUser) {
              setUser(cachedUser);
            }
          } catch {
            /* ignore */
          }
        }
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    return startDiarySync();
  }, [user]);

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
      <UploadQueueProvider>
        <Routes>

        {/* ================= LOGIN ================= */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage setUser={setUser} />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Route>

        <Route
          path="/invitations/:token/accept"
          element={<InvitationAcceptPage />}
        />

        {/* ================= PUBLIC ================= */}
        <Route element={<PublicLayout user={user} setUser={setUser} />}>
          <Route
            path="/"
            element={<HomePage user={user} />}
          />

          <Route
            path="/du-an"
            element={<PublicProjectsPage />}
          />

          <Route
            path="/du-an/:id"
            element={<PublicProjectDetailPage user={user} />}
          />

          <Route
            path="/nha-thau"
            element={<ComingSoonPage title="Trang danh bạ nhà thầu" />}
          />

          <Route
            path="/vat-tu"
            element={<ComingSoonPage title="Trang vật tư thiết bị" />}
          />

          <Route
            path="/tin-tuc"
            element={<ComingSoonPage title="Trang tin tức" />}
          />

          <Route
            path="/lien-he"
            element={<ComingSoonPage title="Trang liên hệ" />}
          />

          <Route
            path="/gioi-thieu"
            element={<ComingSoonPage title="Trang giới thiệu" />}
          />

          <Route
            path="/dieu-khoan"
            element={<ComingSoonPage title="Trang điều khoản sử dụng" />}
          />

          <Route
            path="/bao-mat"
            element={<ComingSoonPage title="Trang chính sách bảo mật" />}
          />

          <Route
            path="/huong-dan"
            element={<ComingSoonPage title="Trang hướng dẫn sử dụng" />}
          />

          <Route
            path="/faq"
            element={<ComingSoonPage title="Câu hỏi thường gặp" />}
          />

          <Route
            path="*"
            element={<NotFoundPage />}
          />
        </Route>

        {/* ================= CHỌN DỰ ÁN ================= */}
        <Route
          path="/projects"
          element={
            user
              ? <ProjectsPage user={user} setUser={setUser} />
              : <Navigate to="/login" replace />
          }
        />

        {/* ================= ADMIN ================= */}
        <Route
          path="/admin"
          element={
            user
              ? <AdminPage user={user} />
              : <Navigate to="/login" replace />
          }
        />

        {/* ================= DASHBOARD ================= */}
        <Route
          element={
            user
              ? <DashboardLayout user={user} setUser={setUser} />
              : <Navigate to="/login" replace />
          }
        >
          <Route
            path="/dashboard"
            element={<LandingPage user={user} setUser={setUser} />}
          />

          <Route
            path="/wbs"
            element={<WBSPage user={user} />}
          />

          <Route
            path="/wbs-diagram"
            element={<WBSDiagramPage user={user} />}
          />

          <Route
            path="/contract-quantities"
            element={<ContractQuantityPage user={user} />}
          />

          <Route
            path="/schedule"
            element={<SchedulePage user={user} />}
          />

          <Route
            path="/gantt"
            element={<GanttPage />}
          />

          <Route
            path="/warnings"
            element={<MilestoneWarningsPage user={user} />}
          />

          <Route
            path="/calendar"
            element={<ProjectCalendarPage user={user} />}
          />

          {/* S-26 / T-59 / T-60 */}
<Route
  path="/field"
  element={<FieldPage user={user} />}
/>

          <Route
            path="/diary"
            element={<DiaryPage user={user} />}
          />

          <Route
            path="/acceptance"
            element={<AcceptancePage user={user} />}
          />

          <Route
            path="/audit"
            element={<AuditPortalPage user={user} />}
          />

          <Route
            path="/members"
            element={<MembersPage user={user} />}
          />
        </Route>

      </Routes>
      <UploadQueueDrawer />
    </UploadQueueProvider>
  </BrowserRouter>
);
}

export default App;
