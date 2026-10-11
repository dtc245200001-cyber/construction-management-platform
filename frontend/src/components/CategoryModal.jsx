import React from "react";
import { X, Pencil, FileText, FolderPlus, FolderOpen } from "lucide-react";
import api from "../lib/api";

// Modal Thêm / Sửa hạng mục dùng chung cho trang bảng WBS và trang Sơ đồ WBS.
// Controlled: toàn bộ state nằm ở component cha, modal chỉ render + gọi callback.
// - config: { isOpen, mode ('add_root' | 'add_child' | 'edit_category'), targetNode, name, code, error, entryType, duration_days }
// - canAddTask: true khi được phép hiện tab "Công việc thi công" (mục con của hạng mục lá)
// - onPatch(patch): gộp patch vào config; onClose, onSubmit(form event), onSwitchToTask
export default function CategoryModal({
  config,
  loading,
  canAddTask,
  onPatch,
  onClose,
  onSubmit,
  onSwitchToTask,
}) {
  if (!config?.isOpen) return null;

  const days = Number(config.duration_days);
  const durationInvalid =
    !config.duration_days || !Number.isInteger(days) || days <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-[#E6EBF3] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-4 border-b border-[#EEF2F7]">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-50 text-[#1F63E0] flex items-center justify-center">
              {config.mode === "edit_category" || config.mode === "edit_task" ? (
                <Pencil className="size-5" />
              ) : config.entryType === "task" ? (
                <FileText className="size-5 text-[#15803D]" />
              ) : (
                <FolderPlus className="size-5" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-[#0F1B3D] text-[16px]">
                {config.mode === "add_root" && "Thêm hạng mục gốc"}
                {config.mode === "add_child" && (
                  config.entryType === "task" ? "Thêm công việc thi công" : "Thêm hạng mục con"
                )}
                {config.mode === "edit_category" && "Đổi tên hạng mục"}
                {config.mode === "edit_task" && "Chỉnh sửa công việc"}
              </h3>
              {config.mode === "add_child" && config.targetNode && (
                <p className="text-xs text-[#64748B]">Trực thuộc: <span className="font-semibold text-[#0F1B3D]">{config.targetNode.name}</span></p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-lg text-[#64748B] hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* NFR T-12: Chỉ hiển thị chọn loại nếu là hạng mục LÁ (không có work_item con). Nếu đã có hạng mục con, ẩn hẳn tab Công việc */}
        {config.mode === "add_child" && canAddTask && (
          <div className="flex p-1 bg-slate-100 rounded-xl mt-4">
            <button
              type="button"
              onClick={onSwitchToTask}
              className="flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 text-[#64748B] hover:text-[#0F1B3D] hover:bg-white"
            >
              <FileText className="size-3.5" /> Công việc thi công
            </button>
            <button
              type="button"
              onClick={() => onPatch({ entryType: "category", error: "" })}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                config.entryType === "category" ? "bg-white text-[#1F63E0] shadow-sm" : "text-[#64748B] hover:text-[#0F1B3D]"
              }`}
            >
              <FolderOpen className="size-3.5" /> Hạng mục con
            </button>
          </div>
        )}

        {config.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
            {config.error}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#0F1B3D] mb-1.5">
              {config.entryType === "task" ? "Tên công việc" : "Tên hạng mục"} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              placeholder={config.entryType === "task" ? "Ví dụ: Đào móng bằng máy, Đổ bê tông..." : "Nhập tên hạng mục..."}
              value={config.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              className="w-full h-11 px-3.5 rounded-xl border border-[#E6EBF3] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F63E0]/20 focus:border-[#1F63E0]"
              disabled={loading}
            />
          </div>

          {/* Nếu là Công việc: ô nhập Thời lượng thi công với validation > 0 tức thì */}
          {config.entryType === "task" && (
            <div>
              <label className="block text-xs font-semibold text-[#0F1B3D] mb-1.5">
                Thời lượng thi công (số ngày) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Ví dụ: 3, 5, 10..."
                value={config.duration_days}
                onChange={(e) => onPatch({ duration_days: e.target.value })}
                className={`w-full h-11 px-3.5 rounded-xl border text-sm focus:outline-none transition-colors ${
                  durationInvalid
                    ? "border-red-500 ring-2 ring-red-100 focus:border-red-500"
                    : "border-[#E6EBF3] focus:ring-2 focus:ring-[#1F63E0]/20 focus:border-[#1F63E0]"
                }`}
                disabled={loading}
              />
              {durationInvalid && (
                <p className="text-xs text-red-500 mt-1">
                  Thời lượng phải là số nguyên dương lớn hơn 0
                </p>
              )}
            </div>
          )}

          {/* Nếu là Hạng mục và không phải edit: mã hạng mục */}
          {config.entryType === "category" && config.mode !== "edit_category" && (
            <div>
              <label className="block text-xs font-semibold text-[#0F1B3D] mb-1.5">
                Mã hạng mục (tùy chọn)
              </label>
              <input
                type="text"
                placeholder="Ví dụ: HM-01, KET-CAU..."
                value={config.code}
                onChange={(e) => onPatch({ code: e.target.value })}
                className="w-full h-11 px-3.5 rounded-xl border border-[#E6EBF3] text-sm focus:outline-none focus:ring-2 focus:ring-[#1F63E0]/20 focus:border-[#1F63E0]"
                disabled={loading}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EEF2F7]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-10 px-4 rounded-xl text-sm font-medium text-[#475569] hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !config.name.trim() ||
                (config.entryType === "task" && durationInvalid)
              }
              className="h-10 px-5 rounded-xl text-sm font-semibold text-white bg-[#1F63E0] hover:bg-[#1A54C2] transition-colors shadow-sm cursor-pointer disabled:opacity-60"
            >
              {loading
                ? "Đang lưu..."
                : config.mode === "edit_category" || config.mode === "edit_task"
                ? "Cập nhật"
                : "Thêm mới"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Gọi API lưu hạng mục theo mode của modal. Dùng chung cho cả 2 trang.
export async function saveCategory({ projectId, mode, targetNode, name, code }) {
  const trimmedName = (name || "").trim();
  if (!trimmedName) throw new Error("Vui lòng nhập tên hạng mục");

  if (mode === "add_root") {
    await api.post(`/categories/${projectId}`, {
      name: trimmedName,
      code: (code || "").trim() || undefined,
      parent_id: null,
    });
    return { expandedParentId: null };
  }
  if (mode === "add_child") {
    await api.post(`/categories/${projectId}`, {
      name: trimmedName,
      code: (code || "").trim() || undefined,
      parent_id: targetNode.id,
    });
    return { expandedParentId: targetNode.id };
  }
  if (mode === "edit_category") {
    await api.put(`/categories/${projectId}/${targetNode.id}`, {
      name: trimmedName,
    });
    return { expandedParentId: null };
  }
  throw new Error(`Chế độ modal không hỗ trợ: ${mode}`);
}
