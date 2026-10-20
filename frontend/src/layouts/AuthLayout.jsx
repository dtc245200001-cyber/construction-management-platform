import React from 'react';
import { Outlet } from 'react-router-dom';
import '../pages/AuthPages.css';

const AuthLayout = () => {
  return (
    <div className="auth-layout" style={{ minHeight: '100vh' }}>
      <Outlet />
    </div>
  );
};

export default AuthLayout;
