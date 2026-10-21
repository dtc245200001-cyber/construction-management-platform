import { useMemo, useState } from "react";
import api from "../lib/api";
import { GitBranch, Search, Plus, Trash2, X, CheckCircle2, AlertCircle } from "lucide-react";

const TYPES = [
  { value: "FS", label: "FS – Xong việc trước mới bắt đầu việc này (Tuần tự)" },
  { value: "SS", label: "SS – Cùng bắt đầu với việc trước (Song song)" },
  { value: "FF", label: "FF – Cùng kết thúc với việc trước" },
  { value: "SF", label: "SF – Việc trước bắt đầu thì việc này kết thúc (Hiếm dùng)" },
];

export default function DependencySection({
  projectId,
  taskId,
  tasks = [],
  dependencies = [],
  onChanged,
  isCreateMode,
  onAddPendingDependency,
  onRemovePendingDependency,
}) {
  const [query, setQuery] = useState("");
  const [predId, setPredId] = useState(null);
  const [type, setType] = useState("FS");
  const [lag, setLag] = useState("0");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Ô chọn việc trước: lọc theo tên khi gõ, bỏ chính nó
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    return safeTasks
      .filter((t) => {
        const tId =
          t.task_id ??
          (typeof t.id === "string" && t.id.startsWith("task-")
            ? Number(t.id.replace("task-", ""))
            : Number(t.id));
        return tId !== taskId && (t.name || "").toLowerCase().includes(q);
      })
      .map((t) => ({
        ...t,
        task_id:
          t.task_id ??
          (typeof t.id === "string" && t.id.startsWith("task-")
            ? Number(t.id.replace("task-", ""))
            : Number(t.id)),
      }));
  }, [tasks, taskId, query]);

  const selectedCandidate = useMemo(() => {
    return candidates.find((c) => c.task_id === predId);
  }, [candidates, predId]);

  const handleAdd = async () => {
    setError("");
    setSuccessMsg("");
    if (!predId) return setError("Hãy chọn một công việc trước khi thêm quan hệ.");
    if (!Number.isInteger(Number(lag)))
      return setError("Độ trễ phải là số nguyên (được âm).");
    // Báo trùng cặp ngay, không đợi server
    const safeDeps = Array.isArray(dependencies) ? dependencies : [];
    if (safeDeps.some((d) => d.predecessor_id === predId))
      return setError("Quan hệ giữa hai công việc này đã có.");

    const predName = selectedCandidate?.name || "công việc";
    const lagText = Number(lag) === 0 ? "không độ trễ" : `độ trễ ${lag} ngày`;

    if (isCreateMode) {
      if (onAddPendingDependency) {
        onAddPendingDependency({
          id: Date.now(), // Fake ID
          predecessor_id: predId,
          predecessor_name: predName,
          dependency_type: type,
          lead_lag_days: Number(lag),
        });
      }
      setSuccessMsg(`Đã thêm quan hệ: "${predName}" (${type}, ${lagText})`);
      setPredId(null);
      setQuery("");
      setLag("0");
      setType("FS");
      return;
    }

    setSaving(true);
    try {
      await api.post(`/projects/${projectId}/dependencies`, {
        predecessor_id: predId,
        successor_id: taskId,
        dependency_type: type,
        lead_lag_days: Number(lag),
      });
      setSuccessMsg(`Đã thêm quan hệ: "${predName}" (${type}, ${lagText})`);
      setPredId(null);
      setQuery("");
      setLag("0");
      setType("FS");
      if (onChanged) onChanged();
    } catch (err) {
      setError(err.response?.data?.message || "Không thể thêm quan hệ.");
    } finally {
      setSaving(false);
    }
  };

  const safeDeps = Array.isArray(dependencies) ? dependencies : [];

  return (
    <div className="task-dep-container">
      {/* TIÊU ĐỀ PHẦN QUAN HỆ */}
      <div className="task-dep-header">
        <label className="task-dep-title" style={{ margin: 0 }}>
          <GitBranch className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Công việc phải làm trước (Ràng buộc phụ thuộc)</span>
        </label>
        {safeDeps.length > 0 && (
          <span className="task-dep-count-badge">
            {safeDeps.length} quan hệ
          </span>
        )}
      </div>

      <p className="task-dep-subtitle">
        (Tùy chọn) Chọn công việc cần làm trước và kiểu liên kết CPM (FS, SS, FF, SF).
      </p>

      {/* THÔNG BÁO THÀNH CÔNG KHI VỪA LƯU QUAN HỆ */}
      {successMsg && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#ECFDF5",
            border: "1.5px solid #10B981",
            color: "#065F46",
            padding: "8px 12px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "500",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg("")}
            style={{
              background: "none",
              border: "none",
              color: "#065F46",
              cursor: "pointer",
              fontSize: "16px",
              lineHeight: 1,
              padding: 0,
            }}
            title="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}

      {/* DANH SÁCH CÁC QUAN HỆ ĐÃ GÁN */}
      {safeDeps.length > 0 ? (
        <div className="task-dep-assigned-list">
          {safeDeps.map((d) => (
            <div key={d.id} className="task-dep-assigned-item">
              <div className="task-dep-assigned-info">
                <span className="task-dep-assigned-name">{d.predecessor_name}</span>
                <span className={`task-dep-type-badge task-dep-type-${d.dependency_type || "FS"}`}>
                  {d.dependency_type}
                </span>
                <span className="task-dep-assigned-lag">
                  {Number(d.lead_lag_days) === 0
                    ? "không độ trễ"
                    : `độ trễ ${d.lead_lag_days} ngày`}
                </span>
              </div>
              {isCreateMode && (
                <button
                  type="button"
                  onClick={() => onRemovePendingDependency && onRemovePendingDependency(d.id)}
                  className="task-dep-btn-remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa</span>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: "12.5px", color: "#94A3B8", fontStyle: "italic" }}>
          (Chưa có quan hệ công việc nào được gán)
        </div>
      )}

      {/* KHU VỰC TÌM KIẾM VÀ CHỌN CÔNG VIỆC TRƯỚC */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "2px" }}>
        {/* Ô TÌM KIẾM CÔNG VIỆC */}
        <div className="task-dep-search-wrap">
          <Search className="w-4 h-4 task-dep-search-icon" />
          <input
            placeholder="Gõ để tìm công việc trước..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPredId(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            className="task-form-input task-dep-search-input"
          />
          {query && (
            <button
              type="button"
              className="task-dep-search-clear"
              onClick={() => {
                setQuery("");
                setPredId(null);
              }}
              aria-label="Xóa từ khóa tìm kiếm"
            >
              ×
            </button>
          )}
        </div>

        {/* THÔNG BÁO CÔNG VIỆC ĐANG ĐƯỢC CHỌN */}
        {selectedCandidate && (
          <div className="task-dep-selected-banner">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontWeight: "700" }}>Đang chọn việc:</span>
              <span style={{ fontWeight: "600" }}>{selectedCandidate.name}</span>
            </div>
            <button
              type="button"
              onClick={() => setPredId(null)}
              style={{
                background: "none",
                border: "none",
                color: "#DC2626",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
                padding: 0,
              }}
            >
              (Bỏ chọn)
            </button>
          </div>
        )}

        {/* DANH SÁCH CÁC CÔNG VIỆC TRƯỚC ĐỂ LỰA CHỌN */}
        <div className="task-dep-candidate-list">
          {candidates.length === 0 ? (
            <div
              style={{
                padding: "10px",
                textAlign: "center",
                color: "#94A3B8",
                fontSize: "12.5px",
              }}
            >
              {query
                ? "Không tìm thấy công việc phù hợp với từ khóa"
                : "Chưa có công việc nào khác trong dự án"}
            </div>
          ) : (
            candidates.map((t) => {
              const isSelected = predId === t.task_id;
              return (
                <div
                  key={t.task_id}
                  onClick={() => {
                    setPredId(isSelected ? null : t.task_id);
                    setError("");
                    setSuccessMsg("");
                  }}
                  className={`task-dep-candidate-item ${isSelected ? "selected" : ""}`}
                >
                  <span style={{ fontSize: "13px" }}>{t.name}</span>
                  {isSelected ? (
                    <span
                      style={{
                        fontSize: "11px",
                        backgroundColor: "#2563EB",
                        color: "#FFFFFF",
                        padding: "2px 7px",
                        borderRadius: "10px",
                        fontWeight: "700",
                      }}
                    >
                      ✓ Đã chọn
                    </span>
                  ) : (
                    <span style={{ fontSize: "11.5px", color: "#94A3B8" }}>
                      Bấm để chọn
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* CẤU HÌNH LOẠI QUAN HỆ, ĐỘ TRỄ VÀ NÚT THÊM */}
        <div className="task-dep-controls-row">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="task-form-input task-dep-type-select"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <div className="task-dep-lag-wrap">
            <label style={{ fontSize: "13px", color: "#475569", margin: 0 }}>
              Độ trễ:
            </label>
            <input
              type="number"
              step="1"
              value={lag}
              onChange={(e) => setLag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              className="task-form-input task-dep-lag-input"
            />
            <span style={{ fontSize: "13px", color: "#475569" }}>ngày</span>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !predId}
            className="task-dep-btn-add"
          >
            <Plus className="w-4 h-4" />
            <span>{saving ? "Đang thêm..." : "+ Thêm quan hệ"}</span>
          </button>
        </div>

        {/* THÔNG BÁO LỖI NẾU CÓ */}
        {error && (
          <div className="task-form-error" style={{ margin: "2px 0 0", padding: "8px 12px" }}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}