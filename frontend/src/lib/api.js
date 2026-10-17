import axios from "axios";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api";
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 15000,
});

// Xử lý lỗi phản hồi từ API
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || "";

      const isLoginPage = window.location.pathname === "/login";
      const isAuthMeRequest =
        requestUrl === "/auth/me" || requestUrl.endsWith("/auth/me");

      if (!isLoginPage && !isAuthMeRequest) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  },
);

export default api;
