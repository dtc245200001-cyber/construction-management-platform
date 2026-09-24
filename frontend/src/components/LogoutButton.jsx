import React from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const LogoutButton = ({ setUser }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      if (setUser) setUser(null);
      navigate('/login');
    } catch (error) {
      console.error("LOGOUT ERROR:", error);
    }
  };

  return (
    <button onClick={handleLogout} className="logout-button">
      Đăng xuất
    </button>
  );
};

export default LogoutButton;
