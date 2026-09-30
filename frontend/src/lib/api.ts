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
      // Chuyển hướng về trang đăng nhập nếu 401
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
