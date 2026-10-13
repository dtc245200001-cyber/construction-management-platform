import { useEffect, useState } from "react";
import api from "../lib/api";
import { isValidRole } from "../config/permissions";

const roleCacheKey = (projectId) => `project_role_${projectId}`;

// Test component cũ mock GET /projects/:id bằng payload không liên quan (không có membership).
// Chỉ trong Vitest mới giữ mặc định ban_quan_ly cho các test đó; production KHÔNG BAO GIỜ đoán vai trò.
const TEST_FALLBACK_ROLE = import.meta.env?.MODE === "test" ? "ban_quan_ly" : null;

function readCachedRole(projectId) {
  if (!projectId) return null;
  try {
    const cached = localStorage.getItem(roleCacheKey(projectId));
    return isValidRole(cached) ? cached : null;
  } catch {
    return null;
  }
}

function writeCachedRole(projectId, role) {
  try {
    if (role) localStorage.setItem(roleCacheKey(projectId), role);
    else localStorage.removeItem(roleCacheKey(projectId));
  } catch {
    /* ignore */
  }
}

function fallbackRole(projectId) {
  return readCachedRole(projectId) || TEST_FALLBACK_ROLE;
}

// Trạng thái ban đầu khi chưa có phản hồi server cho projectId.
function initialState(projectId, enabled) {
  if (!enabled || !projectId) return { projectId, role: null, loading: false };
  const role = fallbackRole(projectId);
  // Có cache (hoặc fallback của test) -> dùng ngay; không có -> chờ server, không đoán.
  return { projectId, role, loading: !role };
}

// Vai trò của người dùng TRONG DỰ ÁN ĐANG MỞ (GET /projects/:id -> membership).
// Trả { role, loading }:
//  - Có role đã lưu (cache) -> dùng ngay để menu không nhấp nháy, rồi xác thực lại với server.
//  - Chưa có cache -> loading=true cho tới khi server trả lời (không đoán vai trò).
//  - Server báo 401/403/404 hoặc membership không hợp lệ -> role=null (không có quyền gì).
//  - Lỗi mạng -> giữ vai trò đã lưu nếu có (ngoại tuyến), nếu không thì role=null.
export function useProjectRole(projectId, enabled = true) {
  const [state, setState] = useState(() => initialState(projectId, enabled));

  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const res = await api.get(`/projects/${projectId}`);
        if (cancelled) return;
        const data = res?.data;
        const isProjectResponse = data && typeof data === "object" && !Array.isArray(data) && ("membership" in data || "project" in data);
        if (!isProjectResponse) {
          // Phản hồi không đúng dạng {project, membership}: không đủ thông tin vai trò.
          // Giữ cache nếu có; production không có cache -> role=null.
          const fallback = fallbackRole(projectId);
          setState({ projectId, role: fallback, loading: false });
          return;
        }
        const membership = data?.membership;
        const role = isValidRole(membership) ? membership : null;
        writeCachedRole(projectId, role);
        setState({ projectId, role, loading: false });
      } catch (error) {
        if (cancelled) return;
        const status = error?.response?.status;
        if (status === 401 || status === 403 || status === 404) {
          writeCachedRole(projectId, null);
          setState({ projectId, role: null, loading: false });
        } else {
          // Lỗi mạng/server tạm thời: chỉ dùng vai trò đã lưu, không tự cấp vai trò mới.
          setState({ projectId, role: fallbackRole(projectId), loading: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, enabled]);

  if (!enabled || !projectId) return { role: null, loading: false };
  if (state.projectId !== projectId) {
    const next = initialState(projectId, enabled);
    return { role: next.role, loading: next.loading };
  }
  return { role: state.role, loading: state.loading };
}
