import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";

export default function ForbiddenPage({ homePath }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
        <ShieldAlert className="size-7" />
      </div>
      <h1 className="text-xl font-bold text-slate-900">Bạn không có quyền truy cập trang này</h1>
      <p className="max-w-md text-sm text-slate-500">
        Vai trò hiện tại của bạn trong dự án không bao gồm chức năng này. Nếu cần quyền,
        hãy liên hệ Ban quản lý dự án.
      </p>
      {homePath && (
        <Link
          to={homePath}
          className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Về trang chính của tôi
        </Link>
      )}
    </div>
  );
}
