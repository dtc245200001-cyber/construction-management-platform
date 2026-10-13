import { createContext } from "react";

// null = không có PermissionProvider bên trên (trang render độc lập, vd. trong test):
// usePermission sẽ tự tải vai trò.
export const PermissionContext = createContext(null);
