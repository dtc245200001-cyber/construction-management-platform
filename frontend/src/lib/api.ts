import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
});

// Xử lý 401 -> về trang đăng nhập
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Tránh lặp vô hạn nếu đang ở trang login hoặc request gọi từ /auth/me
      if (
        window.location.pathname !== '/login' && 
        error.config.url !== '/auth/me' && 
        error.config.url !== '/api/auth/me'
      ) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
